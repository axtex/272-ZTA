/**
 * Integration tests for /users routes.
 * Requires DATABASE_URL and JWT_SECRET and migrated DB with Role rows.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../index');
const prisma = require('../config/prisma');

jest.setTimeout(30000);

const ts = Date.now();
const adminEmail = `admin_${ts}@test.com`;
const doctorEmail = `doctor_${ts}@test.com`;
const patientEmail = `patient_${ts}@test.com`;

let adminUser;
let doctorUser;
let patientUser;
let patientProfile;

let adminToken;
let doctorToken;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
}

beforeAll(async () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for user tests');
  }

  const adminRole = await prisma.role.findFirst({ where: { roleName: 'Admin' } });
  const doctorRole = await prisma.role.findFirst({ where: { roleName: 'Doctor' } });
  const patientRole = await prisma.role.findFirst({ where: { roleName: 'Patient' } });
  if (!adminRole || !doctorRole || !patientRole) {
    throw new Error('Required roles not found in DB (Admin/Doctor/Patient)');
  }

  const passwordHash = await bcrypt.hash('Test1234!', 12);

  adminUser = await prisma.user.create({
    data: {
      username: `admin_${ts}`.slice(0, 50),
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });

  doctorUser = await prisma.user.create({
    data: {
      username: `doctor_${ts}`.slice(0, 50),
      email: doctorEmail,
      passwordHash,
      roleId: doctorRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });

  patientUser = await prisma.user.create({
    data: {
      username: `patient_${ts}`.slice(0, 50),
      email: patientEmail,
      passwordHash,
      roleId: patientRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });

  patientProfile = await prisma.patient.create({
    data: {
      userId: patientUser.id,
      medicalRecordNumber: `MRN-USERTEST-${ts}`,
      assignedDoctorId: null,
    },
  });

  adminToken = signToken({ ...adminUser, role: 'admin' });
  doctorToken = signToken({ ...doctorUser, role: 'doctor' });
});

afterAll(async () => {
  await prisma.patient.deleteMany({
    where: { userId: { in: [adminUser?.id, doctorUser?.id, patientUser?.id].filter(Boolean) } },
  });

  await prisma.user.deleteMany({
    where: {
      email: { in: [adminEmail, doctorEmail, patientEmail].filter(Boolean) },
    },
  });

  await prisma.$disconnect();
});

describe('GET /users', () => {
  it('200 with adminToken — returns array', async () => {
    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('403 with doctorToken', async () => {
    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(403);
  });

  it('401 with no token', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(401);
  });
});

describe('POST /users', () => {
  it('201 with adminToken, valid body — returns user without passwordHash', async () => {
    const email = `new_${ts}@test.com`;
    const body = {
      username: `new_${ts}`.slice(0, 50),
      email,
      password: 'Test1234!',
      roleName: 'Doctor',
    };
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.role).toBeDefined();

    await prisma.user.deleteMany({ where: { email } });
  });

  it('409 if email already exists', async () => {
    const body = {
      username: `dup_${ts}`.slice(0, 50),
      email: adminEmail,
      password: 'Test1234!',
      roleName: 'Doctor',
    };
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(409);
  });

  it('400 if roleName is invalid', async () => {
    const body = {
      username: `badrole_${ts}`.slice(0, 50),
      email: `badrole_${ts}@test.com`,
      password: 'Test1234!',
      roleName: 'NotARole',
    };
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('403 with doctorToken', async () => {
    const body = {
      username: `nope_${ts}`.slice(0, 50),
      email: `nope_${ts}@test.com`,
      password: 'Test1234!',
      roleName: 'Doctor',
    };
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(body);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /users/:id', () => {
  it('200 admin updates status to INACTIVE', async () => {
    const res = await request(app)
      .patch(`/users/${doctorUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    // Service maps INACTIVE -> DISABLED (schema enum)
    expect(res.body.user.status).toBe('DISABLED');
  });

  it('404 for non-existent id', async () => {
    const res = await request(app)
      .patch('/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });
    expect(res.status).toBe(404);
  });

  it('403 for non-admin', async () => {
    const res = await request(app)
      .patch(`/users/${doctorUser.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /users/:id', () => {
  it('200 admin deactivates user → { success: true }', async () => {
    const email = `todelete_${ts}@test.com`;
    const adminRole = await prisma.role.findFirst({ where: { roleName: 'Admin' } });
    const u = await prisma.user.create({
      data: {
        username: `todelete_${ts}`.slice(0, 50),
        email,
        passwordHash: await bcrypt.hash('Test1234!', 12),
        roleId: adminRole.id,
        status: 'ACTIVE',
        mfaEnabled: false,
      },
    });

    const res = await request(app)
      .delete(`/users/${u.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await prisma.user.findUnique({ where: { id: u.id } });
    expect(updated.status).toBe('DISABLED');

    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  });

  it('404 for non-existent id', async () => {
    const res = await request(app)
      .delete('/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /users/:id/assign', () => {
  it('200 admin assigns doctor to patient', async () => {
    const res = await request(app)
      .post(`/users/${doctorUser.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patientId: patientProfile.id });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await prisma.patient.findUnique({ where: { id: patientProfile.id } });
    expect(updated.assignedDoctorId).toBe(doctorUser.id);
  });

  it('400 if user is not a Doctor', async () => {
    const res = await request(app)
      .post(`/users/${adminUser.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patientId: patientProfile.id });
    expect(res.status).toBe(400);
  });

  it('404 if patient not found', async () => {
    const res = await request(app)
      .post(`/users/${doctorUser.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patientId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });
});

