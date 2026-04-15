/**
 * PDP + EHR integration tests.
 * Requires DATABASE_URL, JWT_SECRET, migrated DB with Role rows (Doctor, Nurse, Admin, Patient).
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../index');
const prisma = require('../config/prisma');

jest.setTimeout(30000);

const ts = Date.now();
const UA = 'test-agent';

let doctor;
let nurse;
let adminUser;
let patientUser;
let stepUpUser;
let otherPatientOwner;
let patientProfile;
let otherPatientProfile;
let testEhrId;
let otherEhrId;
let doctorToken;
let nurseToken;
let adminToken;
let patientToken;
let stepUpToken;

async function findRole(name) {
  return prisma.role.findFirst({
    where: { roleName: { equals: name, mode: 'insensitive' } },
  });
}

async function createUser(email, roleLabel) {
  const role = await findRole(roleLabel);
  if (!role) {
    throw new Error(`Missing Role in DB: ${roleLabel}`);
  }
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const username = email.split('@')[0].slice(0, 50);
  return prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      roleId: role.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });
}

function signAccessToken(userId, role, email) {
  return jwt.sign(
    { sub: userId, role, email },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
}

beforeAll(async () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for PDP tests');
  }

  doctor = await createUser(`doctor_${ts}@test.com`, 'Doctor');
  nurse = await createUser(`nurse_${ts}@test.com`, 'Nurse');
  adminUser = await createUser(`admin_${ts}@test.com`, 'Admin');
  patientUser = await createUser(`patient_${ts}@test.com`, 'Patient');
  stepUpUser = await createUser(`stepup_${ts}@test.com`, 'Doctor');
  otherPatientOwner = await createUser(`otherpat_${ts}@test.com`, 'Patient');

  await prisma.device.create({
    data: {
      userId: doctor.id,
      userAgent: UA,
      ip: '127.0.0.1',
      lastSeen: new Date(),
    },
  });
  await prisma.device.create({
    data: {
      userId: nurse.id,
      userAgent: UA,
      ip: '127.0.0.1',
      lastSeen: new Date(),
    },
  });
  await prisma.device.create({
    data: {
      userId: patientUser.id,
      userAgent: UA,
      ip: '127.0.0.1',
      lastSeen: new Date(),
    },
  });

  patientProfile = await prisma.patient.create({
    data: {
      userId: patientUser.id,
      medicalRecordNumber: `MRN-PDP-P-${ts}`,
      assignedDoctorId: doctor.id,
    },
  });

  otherPatientProfile = await prisma.patient.create({
    data: {
      userId: otherPatientOwner.id,
      medicalRecordNumber: `MRN-PDP-O-${ts}`,
      assignedDoctorId: doctor.id,
    },
  });

  const ehr = await prisma.eHR.create({
    data: {
      patientId: patientProfile.id,
      doctorId: doctor.id,
      diagnosis: 'PDP test record',
      vitals: {},
    },
  });
  testEhrId = ehr.id;

  const ehrOther = await prisma.eHR.create({
    data: {
      patientId: otherPatientProfile.id,
      doctorId: doctor.id,
      diagnosis: 'Other patient record',
      vitals: {},
    },
  });
  otherEhrId = ehrOther.id;

  doctorToken = signAccessToken(doctor.id, 'doctor', doctor.email);
  nurseToken = signAccessToken(nurse.id, 'nurse', nurse.email);
  adminToken = signAccessToken(adminUser.id, 'admin', adminUser.email);
  patientToken = signAccessToken(patientUser.id, 'patient', patientUser.email);
  stepUpToken = signAccessToken(stepUpUser.id, 'doctor', stepUpUser.email);

  await prisma.device.create({
    data: {
      userId: stepUpUser.id,
      userAgent: UA,
      ip: null,
      lastSeen: new Date(),
    },
  });
});

afterAll(async () => {
  const userIds = [
    doctor?.id,
    nurse?.id,
    adminUser?.id,
    patientUser?.id,
    stepUpUser?.id,
    otherPatientOwner?.id,
  ].filter(Boolean);

  if (userIds.length === 0) {
    await prisma.$disconnect();
    return;
  }

  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.device.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.eHR.deleteMany({
    where: {
      patientId: {
        in: [patientProfile?.id, otherPatientProfile?.id].filter(Boolean),
      },
    },
  });
  await prisma.patient.deleteMany({
    where: { userId: { in: userIds } },
  });
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('PDP — no token', () => {
  it('GET /api/ehr/:id without Authorization → 401', async () => {
    const res = await request(app).get(`/api/ehr/${testEhrId}`);
    expect(res.status).toBe(401);
  });
});

describe('PDP — malformed token', () => {
  it('GET /api/ehr/:id with Bearer invalidtoken → 401', async () => {
    const res = await request(app)
      .get(`/api/ehr/${testEhrId}`)
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
  });
});

describe('PDP — doctor', () => {
  it('GET /api/ehr/:testEhrId with doctorToken → not 403', async () => {
    const res = await request(app)
      .get(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('POST /api/ehr with doctorToken and valid body → not 403', async () => {
    const res = await request(app)
      .post('/api/ehr')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA)
      .send({
        patientId: patientProfile.id,
        diagnosis: 'New dx',
        vitals: {},
      });
    expect([201, 400]).toContain(res.status);
    expect(res.status).not.toBe(403);
    if (res.status === 201 && res.body.record?.id) {
      await prisma.eHR.delete({ where: { id: res.body.record.id } }).catch(() => {});
    }
  });

  it('PATCH /api/ehr/:testEhrId with doctorToken → not 403', async () => {
    const res = await request(app)
      .patch(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA)
      .send({ diagnosis: 'Updated by doctor test' });
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });
});

describe('PDP — nurse', () => {
  it('GET /api/ehr/:testEhrId with nurseToken → not 403', async () => {
    const res = await request(app)
      .get(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA);
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('POST /api/ehr with nurseToken → 201 or 400 (PDP allows ehr:write for Nurse)', async () => {
    const res = await request(app)
      .post('/api/ehr')
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA)
      .send({
        patientId: patientProfile.id,
        diagnosis: 'Nurse try',
        vitals: {},
      });
    expect([201, 400]).toContain(res.status);
    expect(res.status).not.toBe(403);
    if (res.status === 201 && res.body.record?.id) {
      await prisma.eHR.delete({ where: { id: res.body.record.id } }).catch(() => {});
    }
  });

  it('PATCH /api/ehr/:testEhrId with nurseToken and { vitals } → 200 or 404 (PDP allows ehr:write; handler restricts to vitals)', async () => {
    const res = await request(app)
      .patch(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA)
      .send({ vitals: { bp: '120/80' } });
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
    if (res.status === 200) {
      expect(res.body.record).toBeDefined();
    }
  });
});

describe('PDP — admin', () => {
  it('GET /api/ehr/:testEhrId with adminToken → 403', async () => {
    const res = await request(app)
      .get(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });

  it('POST /api/ehr with adminToken → 403', async () => {
    const res = await request(app)
      .post('/api/ehr')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', UA)
      .send({
        patientId: patientProfile.id,
        diagnosis: 'Admin try',
        vitals: {},
      });
    expect(res.status).toBe(403);
  });
});

describe('PDP — patient', () => {
  it('GET /api/patients/:patientId/ehr with own patientId → not 403', async () => {
    const res = await request(app)
      .get(`/api/patients/${patientProfile.id}/ehr`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('GET /api/ehr/:otherEhrId with patientToken when EHR belongs to another patient → 403', async () => {
    const res = await request(app)
      .get(`/api/ehr/${otherEhrId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });
});

describe('PDP — STEP_UP', () => {
  it('doctor with device (ip null) during off-hours UTC → 401 + STEP_UP', async () => {
    // Spec asked for "no device"; trust score would be 25 → DENY (403), not STEP_UP.
    // Stable STEP_UP: device match (+30), ip null (no ±10), UTC hour in [2,5) (−20) → 60 ∈ [45,70).
    const spy = jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(3);
    const res = await request(app)
      .get(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${stepUpToken}`)
      .set('User-Agent', UA);
    spy.mockRestore();
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'STEP_UP' });
  });
});

describe('PDP — audit logging', () => {
  it('after doctor GET ALLOW path, audit_logs contains ALLOW for user', async () => {
    await request(app)
      .get(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);

    const rows = await prisma.auditLog.findMany({
      where: { userId: doctor.id },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });
    const allow = rows.some((r) => String(r.decision).toUpperCase() === 'ALLOW');
    expect(allow).toBe(true);
  });

  it('after admin GET DENY path, audit_logs contains DENY for user', async () => {
    await request(app)
      .get(`/api/ehr/${testEhrId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', UA);

    const rows = await prisma.auditLog.findMany({
      where: { userId: adminUser.id },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });
    const deny = rows.some((r) => String(r.decision).toUpperCase() === 'DENY');
    expect(deny).toBe(true);
  });
});

/*
 * TODO — known missing product features (tests not implemented):
 *
 * // describe('POST /pdp/evaluate', () => {
 * //   it('should accept deviceScore, hour, … and return decision + reason', async () => {});
 * // });
 *
 * // it('should accept deviceScore as direct request input on evaluate', async () => {});
 *
 * // it('should include explicit offHours: true in JSON when request falls in off-hours window', async () => {});
 */
