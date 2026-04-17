const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = require('../index');
const prisma = require('../config/prisma');

function mustGetJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for audit tests');
  }
  return secret;
}

describe('GET /audit/logs', () => {
  let adminUser;
  let doctorUser;
  let adminToken;
  let doctorToken;

  beforeAll(async () => {
    const ts = Date.now();

    const [adminRole, doctorRole] = await Promise.all([
      prisma.role.findFirst({ where: { roleName: 'Admin' } }),
      prisma.role.findFirst({ where: { roleName: 'Doctor' } }),
    ]);

    if (!adminRole || !doctorRole) {
      throw new Error('Required roles (Admin, Doctor) not found');
    }

    const [adminHash, doctorHash] = await Promise.all([
      bcrypt.hash('AdminPass1!', 12),
      bcrypt.hash('DoctorPass1!', 12),
    ]);

    adminUser = await prisma.user.create({
      data: {
        email: `audit_admin_${ts}@test.com`,
        username: `audit_admin_${ts}`,
        passwordHash: adminHash,
        roleId: adminRole.id,
        status: 'ACTIVE',
      },
    });

    doctorUser = await prisma.user.create({
      data: {
        email: `audit_doctor_${ts}@test.com`,
        username: `audit_doctor_${ts}`,
        passwordHash: doctorHash,
        roleId: doctorRole.id,
        status: 'ACTIVE',
      },
    });

    // Seed 3 logs for adminUser with slight timestamp differences.
    const base = Date.now();
    await prisma.auditLog.createMany({
      data: [0, 1, 2].map((i) => ({
        userId: adminUser.id,
        action: 'TEST_EVENT',
        resourceId: 'ehr',
        decision: 'ALLOW',
        trustScore: 100,
        ipAddress: null,
        timestamp: new Date(base + i),
      })),
    });

    adminToken = jwt.sign(
      { sub: adminUser.id, role: 'admin', email: adminUser.email },
      mustGetJwtSecret(),
      { expiresIn: '15m' },
    );

    doctorToken = jwt.sign(
      { sub: doctorUser.id, role: 'doctor', email: doctorUser.email },
      mustGetJwtSecret(),
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    const ids = [adminUser?.id, doctorUser?.id].filter(Boolean);
    if (ids.length) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: ids }, action: 'TEST_EVENT' },
      });
    }

    if (adminUser?.id) {
      await prisma.user.deleteMany({ where: { id: adminUser.id } });
    }
    if (doctorUser?.id) {
      await prisma.user.deleteMany({ where: { id: doctorUser.id } });
    }

    await prisma.$disconnect();
  });

  test('admin can fetch audit logs — 200', async () => {
    const res = await request(app)
      .get('/audit/logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body?.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(3);

    for (const log of res.body.logs.slice(0, 3)) {
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('action');
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('userId');
    }
  });

  test('logs are ordered newest first', async () => {
    const res = await request(app)
      .get('/audit/logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const logs = Array.isArray(res.body?.logs) ? res.body.logs : [];
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const t0 = new Date(logs[0].timestamp).getTime();
    const t1 = new Date(logs[1].timestamp).getTime();
    expect(Number.isNaN(t0)).toBe(false);
    expect(Number.isNaN(t1)).toBe(false);
    expect(t0).toBeGreaterThanOrEqual(t1);
  });

  test('doctor cannot access audit logs — 403', async () => {
    await request(app)
      .get('/audit/logs')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });

  test('unauthenticated request rejected — 401', async () => {
    await request(app).get('/audit/logs').expect(401);
  });

  test('response includes at most 100 entries', async () => {
    const res = await request(app)
      .get('/audit/logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body?.logs)).toBe(true);
    expect(res.body.logs.length).toBeLessThanOrEqual(100);
  });
});

