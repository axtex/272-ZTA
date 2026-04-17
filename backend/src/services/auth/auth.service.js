const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const prisma = require('../../config/prisma');
const { recordFailedLogin } = require('../anomaly/anomaly.service');

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

async function issueTokens(userId, role) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) {
    throw new Error('User not found');
  }

  const roleValue = resolveRoleForToken(role);
  const accessToken = jwt.sign(
    { userId, role: roleValue, email: user.email },
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
  const { username, email, password, roleName } = body;

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

async function registerUser(email, password, roleName) {
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

  // Block suspended accounts
  if (user.status === 'SUSPENDED') {
    throw Object.assign(
      new Error('Account is locked due to too many failed login attempts. Contact admin.'),
      { statusCode: 403 },
    );
  }

  // Block disabled accounts
  if (user.status === 'DISABLED') {
    throw Object.assign(
      new Error('Account is disabled. Contact admin.'),
      { statusCode: 403 },
    );
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) {
    // Record failed login — auto-locks after 5 attempts
    await recordFailedLogin(user.id, deviceInfo?.ip ?? null);
    throw new Error('Invalid credentials');
  }

  // Successful login — upsert device
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
  return { mfaRequired: false, ...tokens };
}

async function setupMfa(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new Error('User not found');
  }

  const secret = speakeasy.generateSecret({
    name: `HospitalZT (${user.email})`,
    length: 20,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: secret.base32 },
  });

  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  return { secret: secret.base32, qrCode };
}

async function verifyMfaSetup(userId, code) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new Error('User not found');
  }

  const ok = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 1,
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

async function validateMfaLogin(tempToken, code) {
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

  const ok = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!ok) {
    throw new Error('Invalid MFA code');
  }

  return issueTokens(user.id, user.role);
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