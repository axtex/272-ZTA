const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = require('../index');
const prisma = require('../config/prisma');

function mustGetJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for monitoring tests');
  }
  return secret;
}

async function countAuditLogs({ userId, action, resourceId }) {
  return prisma.auditLog.count({
    where: {
      ...(userId ? { userId } : null),
      ...(action ? { action } : null),
      ...(resourceId ? { resourceId } : null),
    },
  });
}

describe('monitoring', () => {
  let lockTarget;
  let adminUser;
  let adminToken;

  beforeAll(async () => {
    const ts = Date.now();

    const [adminRole, doctorRole] = await Promise.all([
      prisma.role.findFirst({ where: { roleName: 'Admin' } }),
      prisma.role.findFirst({ where: { roleName: 'Doctor' } }),
    ]);

    if (!adminRole || !doctorRole) {
      throw new Error('Required roles (Admin, Doctor) not found');
    }

    const [lockTargetHash, adminHash] = await Promise.all([
      bcrypt.hash('CorrectPass1!', 12),
      bcrypt.hash('AdminPass1!', 12),
    ]);

    lockTarget = await prisma.user.create({
      data: {
        email: `lock_target_${ts}@test.com`,
        username: `lock_target_${ts}`,
        passwordHash: lockTargetHash,
        roleId: doctorRole.id,
        status: 'ACTIVE',
      },
    });

    adminUser = await prisma.user.create({
      data: {
        email: `admin_monitor_${ts}@test.com`,
        username: `admin_monitor_${ts}`,
        passwordHash: adminHash,
        roleId: adminRole.id,
        status: 'ACTIVE',
      },
    });

    adminToken = jwt.sign(
      { sub: adminUser.id, role: 'admin', email: adminUser.email },
      mustGetJwtSecret(),
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    const userIds = [lockTarget?.id, adminUser?.id].filter(Boolean);

    if (userIds.length) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: userIds } },
      });

      await prisma.device.deleteMany({
        where: { userId: { in: userIds } },
      });
    }

    if (lockTarget?.id) {
      await prisma.user.deleteMany({ where: { id: lockTarget.id } });
    }
    if (adminUser?.id) {
      await prisma.user.deleteMany({ where: { id: adminUser.id } });
    }

    await prisma.$disconnect();
  });

  describe('Failed login tracking', () => {
    test('single failed login does not lock account', async () => {
      await prisma.auditLog.deleteMany({
        where: { userId: lockTarget.id, action: 'LOGIN_FAILED' },
      });
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'ACTIVE' },
      });

      await request(app)
        .post('/auth/login')
        .send({ email: lockTarget.email, password: 'WrongPass1!', timezone: 'UTC' })
        .expect(401);

      const user = await prisma.user.findUnique({
        where: { id: lockTarget.id },
        select: { status: true },
      });
      expect(user.status).toBe('ACTIVE');

      const failedCount = await countAuditLogs({
        userId: lockTarget.id,
        action: 'LOGIN_FAILED',
      });
      expect(failedCount).toBe(1);
    });

    test('5 failed logins lock the account', async () => {
      await prisma.auditLog.deleteMany({
        where: { userId: lockTarget.id, action: 'LOGIN_FAILED' },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: lockTarget.id, action: 'ACCOUNT_LOCKED' },
      });
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'ACTIVE' },
      });

      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await request(app)
          .post('/auth/login')
          .send({ email: lockTarget.email, password: 'WrongPass1!', timezone: 'UTC' })
          .expect(401);
      }

      const user = await prisma.user.findUnique({
        where: { id: lockTarget.id },
        select: { status: true },
      });
      expect(user.status).toBe('SUSPENDED');

      const lockedCount = await countAuditLogs({
        userId: lockTarget.id,
        action: 'ACCOUNT_LOCKED',
      });
      expect(lockedCount).toBeGreaterThanOrEqual(1);
    });

    test('locked account cannot login even with correct password', async () => {
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ email: lockTarget.email, password: 'CorrectPass1!', timezone: 'UTC' });

      expect(res.status).toBe(403);
      expect(String(res.body?.error ?? '')).toMatch(/locked/i);
    });

    test('successful login resets failed login counter', async () => {
      await prisma.auditLog.deleteMany({
        where: { userId: lockTarget.id, action: 'LOGIN_FAILED' },
      });
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'ACTIVE' },
      });

      await prisma.auditLog.createMany({
        data: Array.from({ length: 3 }).map(() => ({
          userId: lockTarget.id,
          action: 'LOGIN_FAILED',
          resourceId: null,
          decision: 'DENY',
          trustScore: 0,
          ipAddress: null,
          timestamp: new Date(),
        })),
      });

      await request(app)
        .post('/auth/login')
        .send({ email: lockTarget.email, password: 'CorrectPass1!', timezone: 'UTC' })
        .expect(200);

      const failedCount = await countAuditLogs({
        userId: lockTarget.id,
        action: 'LOGIN_FAILED',
      });
      expect(failedCount).toBe(0);
    });
  });

  describe('Account unlock — POST /users/:id/unlock', () => {
    test('admin can unlock a suspended account', async () => {
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'SUSPENDED' },
      });

      await request(app)
        .post(`/users/${lockTarget.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200, { success: true });

      const user = await prisma.user.findUnique({
        where: { id: lockTarget.id },
        select: { status: true },
      });
      expect(user.status).toBe('ACTIVE');
    });

    test('unlock keeps LOGIN_FAILED history (lockout counter resets via ACCOUNT_UNLOCKED)', async () => {
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'SUSPENDED' },
      });

      await prisma.auditLog.createMany({
        data: Array.from({ length: 3 }).map(() => ({
          userId: lockTarget.id,
          action: 'LOGIN_FAILED',
          resourceId: null,
          decision: 'DENY',
          trustScore: 0,
          ipAddress: null,
          timestamp: new Date(),
        })),
      });

      await request(app)
        .post(`/users/${lockTarget.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const failedCount = await countAuditLogs({
        userId: lockTarget.id,
        action: 'LOGIN_FAILED',
      });
      expect(failedCount).toBe(3);
    });

    test('cannot unlock an account that is not suspended', async () => {
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'ACTIVE' },
      });

      const res = await request(app)
        .post(`/users/${lockTarget.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(String(res.body?.error ?? '')).toMatch(/not locked/i);
    });

    test('non-admin cannot unlock accounts', async () => {
      const doctorToken = jwt.sign(
        { sub: lockTarget.id, role: 'doctor', email: lockTarget.email },
        mustGetJwtSecret(),
        { expiresIn: '15m' },
      );

      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'SUSPENDED' },
      });

      await request(app)
        .post(`/users/${lockTarget.id}/unlock`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(403);
    });

    test('unlock writes ACCOUNT_UNLOCKED to audit_logs', async () => {
      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'SUSPENDED' },
      });

      await request(app)
        .post(`/users/${lockTarget.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const unlockedCount = await countAuditLogs({
        userId: adminUser.id,
        action: 'ACCOUNT_UNLOCKED',
        resourceId: lockTarget.id,
      });
      expect(unlockedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Status blocking — authenticate middleware', () => {
    test('SUSPENDED user token is rejected', async () => {
      const token = jwt.sign(
        { sub: lockTarget.id, role: 'doctor', email: lockTarget.email },
        mustGetJwtSecret(),
        { expiresIn: '15m' },
      );

      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await request(app)
        .get('/api/ehr/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect([401, 403]).toContain(res.status);

      await prisma.user.update({
        where: { id: lockTarget.id },
        data: { status: 'ACTIVE' },
      });
    });
  });
});

