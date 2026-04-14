const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const prisma = require('../../config/prisma');

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

  const refreshToken = uuidv4();
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

async function loginUser(email, password, deviceInfo) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    throw new Error('Invalid credentials');
  }

  const userAgent = deviceInfo?.userAgent ?? 'unknown';
  await prisma.device.upsert({
    where: {
      userId_userAgent: {
        userId: user.id,
        userAgent,
      },
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
  loginUser,
  issueTokens,
  setupMfa,
  verifyMfaSetup,
  validateMfaLogin,
  refreshTokens,
  logoutUser,
};
