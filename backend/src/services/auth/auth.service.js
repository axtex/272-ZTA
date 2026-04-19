const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const prisma = require('../../config/prisma');
const { recordFailedLogin } = require('../anomaly/anomaly.service');

async function writeLoginSuccessAudit(userId, deviceInfo) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGIN_SUCCESS',
        resourceId: null,
        decision: 'ALLOW',
        trustScore: null,
        ipAddress: deviceInfo?.ip ? String(deviceInfo.ip).slice(0, 100) : null,
        details: { userAgent: deviceInfo?.userAgent ?? null },
      },
    });
  } catch (err) {
    console.error('[AuditLog] LOGIN_SUCCESS failed:', err.message);
  }
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

function resolveRoleForToken(role) {
  if (typeof role === 'string') {
    return role;
  }
  if (role && typeof role.roleName === 'string') {
    return role.roleName;
  }
  throw new Error('Invalid role');
}

function trimOptionalName(value) {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length ? t : undefined;
}

function formatAssignedDoctorNameForToken(doctor) {
  if (!doctor) return null;
  const fn = typeof doctor.firstName === 'string' ? doctor.firstName.trim() : '';
  const ln = typeof doctor.lastName === 'string' ? doctor.lastName.trim() : '';
  const full = [fn, ln].filter(Boolean).join(' ');
  if (full) return `Dr. ${full}`;
  const email = typeof doctor.email === 'string' ? doctor.email.trim() : '';
  return email.length ? email : null;
}

async function issueTokens(userId, role) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      mfaEnabled: true,
      department: true,
      patientProfile: {
        select: {
          assignedDoctor: {
            select: { email: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });
  if (!user) {
    throw new Error('User not found');
  }

  const roleValue = resolveRoleForToken(role);
  const roleClaim =
    typeof roleValue === 'string' ? roleValue.toLowerCase() : String(roleValue);
  const assignedDoctorName =
    roleClaim === 'patient'
      ? formatAssignedDoctorNameForToken(user.patientProfile?.assignedDoctor)
      : undefined;

  const accessToken = jwt.sign(
    {
      userId,
      sub: userId,
      role: roleClaim,
      email: user.email,
      firstName: user.firstName || null,
      department: user.department || null,
      mfaEnabled: user.mfaEnabled ?? false,
      ...(roleClaim === 'patient' ? { assignedDoctorName } : {}),
    },
    getJwtSecret(),
    { expiresIn: '15m' },
  );

  const refreshToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

async function registerPatient(body, auditIp) {
  const { username, email, password, roleName, firstName, lastName } = body;

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    const err = new Error('Username must be at least 3 characters');
    err.statusCode = 400;
    throw err;
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    const err = new Error('Valid email is required');
    err.statusCode = 400;
    throw err;
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.statusCode = 400;
    throw err;
  }

  const requestedRole = (roleName || 'Patient').trim().toLowerCase();
  if (requestedRole !== 'patient') {
    const err = new Error(
      'Only Patient accounts can self-register. Contact admin for staff access.',
    );
    err.statusCode = 403;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
    },
  });

  if (existing) {
    const err = new Error(
      existing.email === normalizedEmail
        ? 'Email is already registered'
        : 'Username is already registered',
    );
    err.statusCode = 409;
    throw err;
  }

  const role = await prisma.role.findFirst({
    where: {
      roleName: {
        equals: 'Patient',
        mode: 'insensitive',
      },
    },
  });

  if (!role) {
    const err = new Error('Role configuration error. Contact admin.');
    err.statusCode = 500;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      username: normalizedUsername,
      email: normalizedEmail,
      firstName: trimOptionalName(firstName),
      lastName: trimOptionalName(lastName),
      passwordHash,
      roleId: role.id,
      mfaEnabled: false,
      status: 'ACTIVE',
    },
  });

  const mrn = `MRN-${Date.now()}`;
  await prisma.patient.create({
    data: {
      userId: user.id,
      medicalRecordNumber: mrn,
      assignedDoctorId: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'REGISTER',
      resourceId: user.id,
      decision: 'ALLOW',
      trustScore: 50,
      ipAddress: auditIp || null,
    },
  });

  return {
    message: 'Account created successfully. Please log in.',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: 'Patient',
    },
  };
}

async function registerUser(email, password, roleName, opts = {}) {
  const { firstName, lastName } = opts || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    const err = new Error('Valid email is required');
    err.statusCode = 400;
    throw err;
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.statusCode = 400;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const requestedRole = (roleName || 'Patient').trim();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    const err = new Error('Email is already registered');
    err.statusCode = 409;
    throw err;
  }

  const role = await prisma.role.findFirst({
    where: { roleName: { equals: requestedRole, mode: 'insensitive' } },
  });
  if (!role) {
    const err = new Error('Invalid role');
    err.statusCode = 400;
    throw err;
  }

  const baseUsername = normalizedEmail.split('@')[0].replace(/[^a-z0-9_\\-\\.]/gi, '').slice(0, 35) || 'user';
  const username = `${baseUsername}_${Date.now()}`.slice(0, 50);
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      username,
      email: normalizedEmail,
      firstName: trimOptionalName(firstName),
      lastName: trimOptionalName(lastName),
      passwordHash,
      roleId: role.id,
      mfaEnabled: false,
      status: 'ACTIVE',
    },
  });

  if (role.roleName.toLowerCase() === 'patient') {
    const mrn = `MRN-${Date.now()}`;
    await prisma.patient.create({
      data: {
        userId: user.id,
        medicalRecordNumber: mrn,
        assignedDoctorId: null,
      },
    });
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: role.roleName,
  };
}

// ── Login with failed attempt tracking + auto-lock ────────────
async function loginUser(email, password, deviceInfo) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  if (user.status === 'SUSPENDED') {
    throw Object.assign(
      new Error('Account locked: Too many failed login attempts. Contact your administrator to unlock.'),
      { statusCode: 403 },
    );
  }

  if (user.status === 'DISABLED') {
    throw Object.assign(
      new Error('Account is disabled. Contact admin.'),
      { statusCode: 403 },
    );
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) {
    await recordFailedLogin(user.id, deviceInfo?.ip ?? null);
    throw new Error('Invalid credentials');
  }

  const userAgent = deviceInfo?.userAgent ?? 'unknown';
  await prisma.device.upsert({
    where: {
      userId_userAgent: { userId: user.id, userAgent },
    },
    update: {
      ip: deviceInfo?.ip ?? null,
      timezone: deviceInfo?.timezone ?? null,
      lastSeen: new Date(),
    },
    create: {
      userId: user.id,
      userAgent,
      ip: deviceInfo?.ip ?? null,
      timezone: deviceInfo?.timezone ?? null,
      lastSeen: new Date(),
    },
  });

  if (user.mfaEnabled) {
    const tempToken = jwt.sign(
      { userId: user.id, purpose: 'mfa' },
      getJwtSecret(),
      { expiresIn: '5m' },
    );
    return { mfaRequired: true, tempToken };
  }

  await prisma.auditLog.deleteMany({
    where: {
      userId: user.id,
      action: 'LOGIN_FAILED',
    },
  });

  const tokens = await issueTokens(user.id, user.role);
  await writeLoginSuccessAudit(user.id, deviceInfo);
  return { mfaRequired: false, ...tokens };
}

async function setupMfa(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, mfaEnabled: true, mfaSecret: true },
  });
  if (!user) {
    throw new Error('User not found');
  }

  if (user.mfaEnabled) {
    const err = new Error('Two-factor authentication is already enabled');
    err.statusCode = 400;
    throw err;
  }

  /**
   * Reuse an existing pending secret when present so repeated setup calls (e.g. React Strict Mode
   * double-mounting the MFA setup page) do not rotate the secret out from under the QR shown to the user.
   */
  let secretBase32 = user.mfaSecret;
  if (!secretBase32) {
    const secret = speakeasy.generateSecret({
      name: `HospitalZT (${user.email})`,
      length: 20,
    });
    secretBase32 = secret.base32;
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secretBase32 },
    });
  }

  const label = `HospitalZT (${user.email})`;
  const otpauth_url = speakeasy.otpauthURL({
    secret: secretBase32,
    label,
    encoding: 'base32',
    issuer: 'HospitalZT',
  });
  const qrCode = await QRCode.toDataURL(otpauth_url);

  return { secret: secretBase32, qrCode };
}

async function verifyMfaSetup(userId, code) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.mfaSecret) {
    const err = new Error('MFA setup was not started. Reload the page and scan the new QR code.');
    err.statusCode = 400;
    throw err;
  }

  const ok = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 2,
  });
  if (!ok) {
    throw new Error('Invalid MFA code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true },
  });

  return { success: true };
}

async function validateMfaLogin(tempToken, code, deviceInfo = {}) {
  const payload = jwt.verify(tempToken, getJwtSecret());
  if (payload.purpose !== 'mfa') {
    throw new Error('Invalid token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { role: true },
  });
  if (!user) {
    throw new Error('User not found');
  }

  if (user.status === 'SUSPENDED') {
    throw Object.assign(
      new Error('Account locked: Too many failed login attempts. Contact your administrator to unlock.'),
      { statusCode: 403 },
    );
  }

  if (user.status === 'DISABLED') {
    throw Object.assign(new Error('Account is disabled. Contact admin.'), { statusCode: 403 });
  }

  const ok = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 2,
  });
  if (!ok) {
    const { locked } = await recordFailedLogin(user.id, deviceInfo?.ip ?? null);
    if (locked) {
      throw Object.assign(
        new Error('Account locked: Too many failed login attempts. Contact your administrator to unlock.'),
        { statusCode: 403 },
      );
    }
    throw new Error('Invalid MFA code');
  }

  await prisma.auditLog.deleteMany({
    where: {
      userId: user.id,
      action: 'LOGIN_FAILED',
    },
  });

  const tokens = await issueTokens(user.id, user.role);
  await writeLoginSuccessAudit(user.id, deviceInfo);
  return tokens;
}

async function refreshTokens(refreshToken) {
  const record = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: {
      user: { include: { role: true } },
    },
  });
  if (!record) {
    throw new Error('Invalid refresh token');
  }
  if (record.expiresAt < new Date()) {
    throw new Error('Refresh token expired');
  }

  await prisma.refreshToken.delete({
    where: { id: record.id },
  });

  return issueTokens(record.userId, record.user.role);
}

async function logoutUser(refreshToken) {
  await prisma.refreshToken.deleteMany({
    where: { token: refreshToken },
  });
  return { success: true };
}

module.exports = {
  registerPatient,
  registerUser,
  loginUser,
  issueTokens,
  setupMfa,
  verifyMfaSetup,
  validateMfaLogin,
  refreshTokens,
  logoutUser,
};