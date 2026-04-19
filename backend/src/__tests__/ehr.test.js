/**
 * Integration tests for /api/v2 EHR routes.
 * Requires DATABASE_URL and JWT_SECRET and migrated DB with Role rows.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../index');
const prisma = require('../config/prisma');

jest.setTimeout(30000);

const UA = 'test-agent';
const ts = Date.now();

let doctorUser;
let nurseUser;
let adminUser;
let patientUser;
let otherPatientUser;

let patientProfile;
let otherPatientProfile;

let ehr;
let otherEhr;

let doctorToken;
let nurseToken;
let adminToken;
let patientToken;

function signToken(userId, role, email) {
  return jwt.sign(
    { sub: userId, role, email },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
}

beforeAll(async () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required for EHR tests');

  const doctorRole = await prisma.role.findFirst({ where: { roleName: 'Doctor' } });
  const nurseRole = await prisma.role.findFirst({ where: { roleName: 'Nurse' } });
  const adminRole = await prisma.role.findFirst({ where: { roleName: 'Admin' } });
  const patientRole = await prisma.role.findFirst({ where: { roleName: 'Patient' } });
  if (!doctorRole || !nurseRole || !adminRole || !patientRole) {
    throw new Error('Required roles not found in DB (Doctor/Nurse/Admin/Patient)');
  }

  const passwordHash = await bcrypt.hash('Test1234!', 12);

  doctorUser = await prisma.user.create({
    data: {
      username: `doctor_${ts}`.slice(0, 50),
      email: `doctor_${ts}@test.com`,
      passwordHash,
      roleId: doctorRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });
  nurseUser = await prisma.user.create({
    data: {
      username: `nurse_${ts}`.slice(0, 50),
      email: `nurse_${ts}@test.com`,
      passwordHash,
      roleId: nurseRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });
  adminUser = await prisma.user.create({
    data: {
      username: `admin_${ts}`.slice(0, 50),
      email: `admin_${ts}@test.com`,
      passwordHash,
      roleId: adminRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });
  patientUser = await prisma.user.create({
    data: {
      username: `patient_${ts}`.slice(0, 50),
      email: `patient_${ts}@test.com`,
      passwordHash,
      roleId: patientRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });

  // Extra patient used for patient-other-record test.
  otherPatientUser = await prisma.user.create({
    data: {
      username: `patient2_${ts}`.slice(0, 50),
      email: `patient2_${ts}@test.com`,
      passwordHash,
      roleId: patientRole.id,
      status: 'ACTIVE',
      mfaEnabled: false,
    },
  });

  await prisma.device.create({
    data: {
      userId: doctorUser.id,
      userAgent: UA,
      ip: '127.0.0.1',
      lastSeen: new Date(),
    },
  });
  await prisma.device.create({
    data: {
      userId: nurseUser.id,
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
      medicalRecordNumber: `MRN${ts}`,
      assignedDoctorId: doctorUser.id,
    },
  });
  otherPatientProfile = await prisma.patient.create({
    data: {
      userId: otherPatientUser.id,
      medicalRecordNumber: `MRN${ts}-OTHER`,
      assignedDoctorId: doctorUser.id,
    },
  });

  ehr = await prisma.eHR.create({
    data: {
      patientId: patientProfile.id,
      doctorId: doctorUser.id,
      diagnosis: 'Test diagnosis',
      vitals: { bp: '120/80' },
      s3FileKey: null,
    },
  });

  otherEhr = await prisma.eHR.create({
    data: {
      patientId: otherPatientProfile.id,
      doctorId: doctorUser.id,
      diagnosis: 'Other diagnosis',
      vitals: { bp: '110/70' },
      s3FileKey: null,
    },
  });

  doctorToken = signToken(doctorUser.id, 'doctor', doctorUser.email);
  nurseToken = signToken(nurseUser.id, 'nurse', nurseUser.email);
  adminToken = signToken(adminUser.id, 'admin', adminUser.email);
  patientToken = signToken(patientUser.id, 'patient', patientUser.email);
});

afterAll(async () => {
  const userIds = [
    doctorUser?.id,
    nurseUser?.id,
    adminUser?.id,
    patientUser?.id,
    otherPatientUser?.id,
  ].filter(Boolean);

  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.device.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.eHR.deleteMany({ where: { id: { in: [ehr?.id, otherEhr?.id].filter(Boolean) } } });
  await prisma.patient.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
  await prisma.$disconnect();
});

describe('GET /api/v2/ehr/:id', () => {
  it('doctor: 200, full record including diagnosis', async () => {
    const res = await request(app)
      .get(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(res.body.record).toBeDefined();
    expect(res.body.record.diagnosis).toBe('Test diagnosis');
    expect(res.body.record.s3FileKey).toBeDefined();
  });

  it('nurse: 200, no diagnosis field in response', async () => {
    const res = await request(app)
      .get(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(res.body.record).toBeDefined();
    expect(res.body.record.diagnosis).toBeUndefined();
    expect(res.body.record.s3FileKey).toBeUndefined();
    expect(res.body.record.vitals).toBeDefined();
  });

  it('patient own record: 200', async () => {
    const res = await request(app)
      .get(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(res.body.record).toBeDefined();
  });

  it('patient other record: 403', async () => {
    const res = await request(app)
      .get(`/api/v2/ehr/${otherEhr.id}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });

  it('admin: 403', async () => {
    const res = await request(app)
      .get(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });

  it('no token: 401', async () => {
    const res = await request(app)
      .get(`/api/v2/ehr/${ehr.id}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v2/ehr', () => {
  it('doctor: 201', async () => {
    const res = await request(app)
      .post('/api/v2/ehr')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA)
      .send({
        patientId: patientProfile.id,
        diagnosis: 'Created diagnosis',
        vitals: { hr: 70 },
      });
    expect(res.status).toBe(201);
    expect(res.body.record).toBeDefined();
    await prisma.eHR.delete({ where: { id: res.body.record.id } }).catch(() => {});
  });

  it('nurse: 403 (service layer allows only doctor)', async () => {
    const res = await request(app)
      .post('/api/v2/ehr')
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA)
      .send({
        patientId: patientProfile.id,
        diagnosis: 'Nurse create',
        vitals: { hr: 71 },
      });
    expect(res.status).toBe(403);
  });

  it('admin: 403', async () => {
    const res = await request(app)
      .post('/api/v2/ehr')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', UA)
      .send({
        patientId: patientProfile.id,
        diagnosis: 'Admin create',
        vitals: { hr: 72 },
      });
    expect(res.status).toBe(403);
  });

  it('no token: 401', async () => {
    const res = await request(app)
      .post('/api/v2/ehr')
      .send({
        patientId: patientProfile.id,
        diagnosis: 'No token',
        vitals: {},
      });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v2/ehr/:id', () => {
  it('doctor updates diagnosis: 200, diagnosis changed in response', async () => {
    const res = await request(app)
      .patch(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA)
      .send({ diagnosis: 'Updated diagnosis' });
    expect(res.status).toBe(200);
    expect(res.body.record.diagnosis).toBe('Updated diagnosis');
  });

  it('nurse updates vitals: 200, vitals changed', async () => {
    const res = await request(app)
      .patch(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA)
      .send({ vitals: { bp: '130/90' } });
    expect(res.status).toBe(200);
    expect(res.body.record.vitals).toMatchObject({ bp: '130/90' });
  });

  it('nurse cannot change diagnosis: 200 but diagnosis remains original', async () => {
    const current = await prisma.eHR.findUnique({ where: { id: ehr.id } });
    const res = await request(app)
      .patch(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA)
      .send({ diagnosis: 'Nurse tries', vitals: { bp: '135/95' } });
    expect(res.status).toBe(200);
    const after = await prisma.eHR.findUnique({ where: { id: ehr.id } });
    expect(after.diagnosis).toBe(current.diagnosis);
  });

  it('patient: 403', async () => {
    const res = await request(app)
      .patch(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA)
      .send({ vitals: {} });
    expect(res.status).toBe(403);
  });

  it('admin: 403', async () => {
    const res = await request(app)
      .patch(`/api/v2/ehr/${ehr.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', UA)
      .send({ vitals: {} });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v2/patient/ehr (patient self)', () => {
  it('patient: 200 with own records', async () => {
    const res = await request(app)
      .get('/api/v2/patient/ehr')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it('doctor: 403', async () => {
    const res = await request(app)
      .get('/api/v2/patient/ehr')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v2/patient/profile', () => {
  it('patient: 200', async () => {
    const res = await request(app)
      .get('/api/v2/patient/profile')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(res.body.medicalRecordNumber).toBeDefined();
  });

  it('doctor: 403', async () => {
    const res = await request(app)
      .get('/api/v2/patient/profile')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v2/patients/:patientId/ehr', () => {
  it('assigned doctor: 200', async () => {
    const res = await request(app)
      .get(`/api/v2/patients/${patientProfile.id}/ehr`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it('nurse: 200 (no assignment model, nurses see all)', async () => {
    const res = await request(app)
      .get(`/api/v2/patients/${patientProfile.id}/ehr`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it('patient own: 200', async () => {
    const res = await request(app)
      .get(`/api/v2/patients/${patientProfile.id}/ehr`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it('admin: 403', async () => {
    const res = await request(app)
      .get(`/api/v2/patients/${patientProfile.id}/ehr`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v2/patients/:patientId/break-glass', () => {
  it('doctor: 200 { success: true }', async () => {
    const res = await request(app)
      .post(`/api/v2/patients/${patientProfile.id}/break-glass`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('AuditLog has BREAK_GLASS entry', async () => {
    const row = await prisma.auditLog.findFirst({
      where: {
        userId: doctorUser.id,
        action: 'BREAK_GLASS',
        resourceId: String(patientProfile.id),
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(row).toBeTruthy();
  });

  it('nurse: 403', async () => {
    const res = await request(app)
      .post(`/api/v2/patients/${patientProfile.id}/break-glass`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });

  it('patient: 403', async () => {
    const res = await request(app)
      .post(`/api/v2/patients/${patientProfile.id}/break-glass`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });
});

describe('Nurse dashboard aggregates', () => {
  it('GET /api/v2/nurse/patients — nurse 200', async () => {
    const res = await request(app)
      .get('/api/v2/nurse/patients')
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.patients)).toBe(true);
    expect(res.body.patients.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v2/nurse/patients — doctor 403', async () => {
    const res = await request(app)
      .get('/api/v2/nurse/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(403);
  });

  it('GET /api/v2/nurse/summary — nurse 200 shape', async () => {
    const res = await request(app)
      .get('/api/v2/nurse/summary')
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(typeof res.body.myPatients).toBe('number');
    expect(typeof res.body.vitalsUpdatedToday).toBe('number');
    expect(typeof res.body.pendingVitals).toBe('number');
    expect(res.body.lastActivityAt === null || typeof res.body.lastActivityAt === 'string').toBe(true);
  });

  it('GET /api/v2/nurse/access-log — nurse 200', async () => {
    const res = await request(app)
      .get('/api/v2/nurse/access-log')
      .set('Authorization', `Bearer ${nurseToken}`)
      .set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });
});

describe('File operations', () => {
  const hasSupabaseStorage = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  (hasSupabaseStorage ? describe : describe.skip)('Supabase-backed file ops', () => {
    it('doctor upload: 200 { fileKey }', async () => {
      const content = Buffer.from('hello world').toString('base64');
      const res = await request(app)
        .post(`/api/v2/ehr/${ehr.id}/files`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('User-Agent', UA)
        .send({
          filename: `test-${ts}.txt`,
          mimetype: 'text/plain',
          contentBase64: content,
        });
      expect(res.status).toBe(200);
      expect(res.body.fileKey).toBeDefined();
    });

    it('GET presigned URL: 200 with a URL string', async () => {
      const res = await request(app)
        .get(`/api/v2/ehr/${ehr.id}/files/url`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('User-Agent', UA);
      expect(res.status).toBe(200);
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url.length).toBeGreaterThan(10);
    });
  });
});

