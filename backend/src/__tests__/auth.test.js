/**
 * Integration tests for /auth routes.
 * Requires DATABASE_URL, JWT_SECRET, and a migrated DB (Patient role from seed).
 * NODE_ENV=test enables GET /__test__/auth-context for verifyToken assertions.
 */

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

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
      role: 'Patient',
    });
    expect(res.body.user.userId).toBeDefined();
  });
});
