/**
 * Integration tests for /auth routes.
 * Requires DATABASE_URL, JWT_SECRET, and a migrated DB (Patient role from seed).
 * NODE_ENV=test enables GET /__test__/auth-context for verifyToken assertions.
 */

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');

const app = require('../index');
const prisma = require('../config/prisma');

jest.setTimeout(30000);

const runId = Date.now();
const testEmail = `test_${runId}@hospital.com`;
const testPassword = 'Password123!';

/** Emails of users created during this file — deleted in afterAll. */
const createdEmails = new Set();

async function registerUser(email, usernameSuffix = '') {
  const res = await request(app)
    .post('/auth/register')
    .send({
      email,
      password: testPassword,
      role: 'patient',
    });
  if (res.status === 201) {
    createdEmails.add(email);
  }
  return res;
}

async function deleteUserByEmail(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.device.deleteMany({ where: { userId: user.id } });
  await prisma.patient.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

afterAll(async () => {
  for (const email of createdEmails) {
    await deleteUserByEmail(email);
  }
  await prisma.$disconnect();
});

describe('POST /auth/register', () => {
  it('should register a new user successfully (201)', async () => {
    const res = await registerUser(testEmail);
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail.toLowerCase());
    expect(res.body.user.role).toMatch(/patient/i);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.id).toBeDefined();
  });

  it('should return 409 if email already registered', async () => {
    const email = `test_${runId}_409@hospital.com`;
    const first = await registerUser(email, '_409a');
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/auth/register')
      .send({
        email,
        password: testPassword,
        role: 'patient',
      });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already registered/i);
  });

  it('should return 400 if email is invalid or password missing', async () => {
    const noAt = await request(app)
      .post('/auth/register')
      .send({
        email: 'not-an-email',
        password: testPassword,
        role: 'patient',
      });
    expect(noAt.status).toBe(400);
    expect(noAt.body.error).toMatch(/valid email/i);

    const noPassword = await request(app)
      .post('/auth/register')
      .send({
        email: `test_${runId}_nopw@hospital.com`,
        role: 'patient',
      });
    expect(noPassword.status).toBe(400);
    expect(noPassword.body.error).toMatch(/password/i);
  });
});

describe('POST /auth/login', () => {
  const loginEmail = `test_${runId}_login@hospital.com`;

  beforeAll(async () => {
    await registerUser(loginEmail, '_login');
  });

  it('should login successfully and return accessToken + refreshToken', async () => {
    const res = await request(app).post('/auth/login').send({
      email: loginEmail,
      password: testPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(false);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('should return 401 for wrong password', async () => {
    const res = await request(app).post('/auth/login').send({
      email: loginEmail,
      password: 'WrongPassword!!!',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('should return 401 for non-existent email', async () => {
    const res = await request(app).post('/auth/login').send({
      email: `nosuch_${runId}@hospital.com`,
      password: testPassword,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });
});

describe('POST /auth/mfa/validate', () => {
  const mfaEmail = `test_${runId}_mfa_lock@hospital.com`;
  let mfaSecretBase32;

  beforeAll(async () => {
    await registerUser(mfaEmail, '_mfa_lock');
    const secret = speakeasy.generateSecret({ length: 20 });
    mfaSecretBase32 = secret.base32;
    const user = await prisma.user.findUnique({ where: { email: mfaEmail.toLowerCase() } });
    expect(user).toBeTruthy();
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: mfaSecretBase32, mfaEnabled: true },
    });
  });

  it('login returns MFA challenge for MFA-enabled user', async () => {
    const res = await request(app).post('/auth/login').send({
      email: mfaEmail,
      password: testPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.tempToken).toBeTruthy();
  });

  it('successful MFA clears LOGIN_FAILED audit rows', async () => {
    const user = await prisma.user.findUnique({ where: { email: mfaEmail.toLowerCase() } });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });

    const login1 = await request(app).post('/auth/login').send({ email: mfaEmail, password: testPassword });
    const bad = await request(app)
      .post('/auth/mfa/validate')
      .send({ tempToken: login1.body.tempToken, code: '000000' });
    expect(bad.status).toBe(401);

    const failCount = await prisma.auditLog.count({ where: { userId: user.id, action: 'LOGIN_FAILED' } });
    expect(failCount).toBe(1);

    const login2 = await request(app).post('/auth/login').send({ email: mfaEmail, password: testPassword });
    const goodCode = speakeasy.totp({ secret: mfaSecretBase32, encoding: 'base32' });
    const ok = await request(app)
      .post('/auth/mfa/validate')
      .send({ tempToken: login2.body.tempToken, code: goodCode });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeDefined();

    const cleared = await prisma.auditLog.count({ where: { userId: user.id, action: 'LOGIN_FAILED' } });
    expect(cleared).toBe(0);
  });

  it('locks account after 5 invalid MFA attempts (same window as password failures)', async () => {
    const user = await prisma.user.findUnique({ where: { email: mfaEmail.toLowerCase() } });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });

    let lastStatus;
    for (let i = 0; i < 5; i += 1) {
      const login = await request(app).post('/auth/login').send({ email: mfaEmail, password: testPassword });
      const r = await request(app)
        .post('/auth/mfa/validate')
        .send({ tempToken: login.body.tempToken, code: '000001' });
      lastStatus = r.status;
    }
    expect(lastStatus).toBe(403);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated.status).toBe('SUSPENDED');
  });
});

describe('POST /auth/token/refresh', () => {
  const refreshEmail = `test_${runId}_refresh@hospital.com`;
  let validRefreshToken;

  beforeAll(async () => {
    await registerUser(refreshEmail, '_ref');
    const login = await request(app).post('/auth/login').send({
      email: refreshEmail,
      password: testPassword,
    });
    validRefreshToken = login.body.refreshToken;
  });

  it('should return new token pair given a valid refresh token', async () => {
    const res = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken: validRefreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(validRefreshToken);
    validRefreshToken = res.body.refreshToken;
  });

  it('should return 401 for invalid refresh token', async () => {
    const res = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken: crypto.randomUUID() });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid refresh token/i);
  });

  it('should return 401 for expired refresh token', async () => {
    const email = `test_${runId}_rexp@hospital.com`;
    await registerUser(email, '_rexp');
    const user = await prisma.user.findUnique({ where: { email } });
    const expiredToken = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: {
        token: expiredToken,
        userId: user.id,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken: expiredToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });
});

describe('POST /auth/logout', () => {
  it('should delete refresh token and return success', async () => {
    const email = `test_${runId}_logout@hospital.com`;
    await registerUser(email, '_lo');
    const login = await request(app).post('/auth/login').send({
      email,
      password: testPassword,
    });
    const { refreshToken: rt } = login.body;

    const out = await request(app).post('/auth/logout').send({ refreshToken: rt });
    expect(out.status).toBe(200);
    expect(out.body.success).toBe(true);

    const again = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken: rt });
    expect(again.status).toBe(401);
  });

  it('should return success even if token does not exist (idempotent)', async () => {
    const res = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: crypto.randomUUID() });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('verifyToken middleware', () => {
  const mwEmail = `test_${runId}_mw@hospital.com`;
  let accessToken;

  beforeAll(async () => {
    await registerUser(mwEmail, '_mw');
    const login = await request(app).post('/auth/login').send({
      email: mwEmail,
      password: testPassword,
    });
    accessToken = login.body.accessToken;
  });

  it('should reject request with no Authorization header (401)', async () => {
    const res = await request(app).get('/__test__/auth-context');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no token provided/i);
  });

  it('should reject request with malformed token (401)', async () => {
    const res = await request(app)
      .get('/__test__/auth-context')
      .set('Authorization', 'Bearer not-a-valid-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired token/i);
  });

  it('should reject request with expired token (401)', async () => {
    const secret = process.env.JWT_SECRET;
    expect(secret).toBeDefined();
    const expired = jwt.sign(
      { userId: crypto.randomUUID(), role: 'Patient', email: 'x@y.com' },
      secret,
      { expiresIn: '-1h' },
    );
    const res = await request(app)
      .get('/__test__/auth-context')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired token/i);
  });

  it('should allow request with valid token and set req.user', async () => {
    const res = await request(app)
      .get('/__test__/auth-context')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: mwEmail,
      role: 'patient',
    });
    expect(res.body.user.userId).toBeDefined();
    expect(res.body.user.sub).toBe(res.body.user.userId);
  });
});

describe('POST /auth/token/refresh — edge cases', () => {
  const email = `test_${runId}_refresh_edge@hospital.com`;

  beforeAll(async () => {
    await registerUser(email, '_refresh_edge');
  });

  it('refresh token can only be used once (rotation)', async () => {
    const login = await request(app).post('/auth/login').send({
      email,
      password: testPassword,
    });
    expect(login.status).toBe(200);
    const { refreshToken } = login.body;
    expect(refreshToken).toBeDefined();

    const first = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken });
    expect(second.status).toBe(401);
  });

  it('expired refresh token is rejected', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();

    const token = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken: token });
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout — edge cases', () => {
  const email = `test_${runId}_logout_edge@hospital.com`;

  beforeAll(async () => {
    await registerUser(email, '_logout_edge');
  });

  it('logout is idempotent', async () => {
    const login = await request(app).post('/auth/login').send({
      email,
      password: testPassword,
    });
    expect(login.status).toBe(200);
    const { refreshToken } = login.body;

    const first = await request(app).post('/auth/logout').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    const second = await request(app).post('/auth/logout').send({ refreshToken });
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
  });

  it('after logout, refresh token no longer works', async () => {
    const login = await request(app).post('/auth/login').send({
      email,
      password: testPassword,
    });
    expect(login.status).toBe(200);
    const { refreshToken } = login.body;

    const out = await request(app).post('/auth/logout').send({ refreshToken });
    expect(out.status).toBe(200);

    const res = await request(app)
      .post('/auth/token/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('verifyToken middleware — edge cases', () => {
  it('token with tampered payload is rejected', async () => {
    const email = `test_${runId}_mw_tamper@hospital.com`;
    await registerUser(email, '_mw_tamper');
    const login = await request(app).post('/auth/login').send({
      email,
      password: testPassword,
    });
    expect(login.status).toBe(200);
    const valid = login.body.accessToken;
    expect(valid).toBeDefined();

    const decoded = jwt.decode(valid);
    const tamperedPayload = { ...(decoded || {}), role: 'admin' };
    delete tamperedPayload.exp;
    delete tamperedPayload.iat;
    delete tamperedPayload.nbf;
    const tampered = jwt.sign(tamperedPayload, 'definitely-not-the-real-secret', {
      expiresIn: '15m',
    });

    const res = await request(app)
      .get('/__test__/auth-context')
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('token issued for one user cannot be used as another', async () => {
    const fake = jwt.sign(
      { sub: 'fake-user-id', role: 'admin', email: 'fake@x.com' },
      'wrong-secret',
      { expiresIn: '15m' },
    );

    const res = await request(app)
      .get('/audit/logs')
      .set('Authorization', `Bearer ${fake}`);

    expect([401, 403]).toContain(res.status);
  });
});
