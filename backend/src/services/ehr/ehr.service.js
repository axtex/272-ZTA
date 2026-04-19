const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const { tokenUserId, tokenRoleKey } = require('../../utils/jwtPayload');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function truncateUuid(id) {
  const s = String(id ?? '');
  if (!s) return '—';
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function formatDoctorDisplay(doctor) {
  if (!doctor) return null;
  const fn = typeof doctor.firstName === 'string' ? doctor.firstName.trim() : '';
  const ln = typeof doctor.lastName === 'string' ? doctor.lastName.trim() : '';
  const full = [fn, ln].filter(Boolean).join(' ');
  if (full) return `Dr. ${full}`;
  return null;
}

async function resolvePatientByIdentifier(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw makeError('Patient identifier is required', 400);
  if (UUID_RE.test(s)) {
    const byId = await prisma.patient.findUnique({ where: { id: s } });
    if (byId) return byId;
  }
  const byMrn = await prisma.patient.findFirst({
    where: { medicalRecordNumber: s },
  });
  if (byMrn) return byMrn;
  throw makeError('Patient not found', 404);
}

/** Doctor break-glass: MRN lookup only (UUIDs are rejected so staff cannot paste internal IDs). */
async function resolvePatientByMrnOnly(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw makeError('Medical record number is required', 400);
  if (UUID_RE.test(s)) {
    throw makeError('Use the patient medical record number (MRN), not an internal patient ID', 400);
  }
  const byMrn = await prisma.patient.findFirst({
    where: { medicalRecordNumber: s },
  });
  if (byMrn) return byMrn;
  throw makeError('Patient not found for this MRN', 404);
}

function filterRecordForRole(record, role) {
  if (role === 'doctor') return record;
  if (role === 'nurse') {
    return {
      id: record.id,
      patientId: record.patientId,
      vitals: record.vitals,
      updatedAt: record.updatedAt,
    };
  }
  // patient is handled separately (ownership check + fields)
  return record;
}

async function getEhrRecord(ehrId, requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role === 'admin') throw makeError('Access denied', 403);

  const record = await prisma.eHR.findUnique({
    where: { id: ehrId },
    include: { patient: true, doctor: true },
  });
  if (!record) throw makeError('Not found', 404);

  if (role === 'patient') {
    const uid = tokenUserId(requestingUser);
    const patient = await prisma.patient.findUnique({
      where: { userId: uid },
    });
    if (!patient || patient.id !== record.patientId) throw makeError('Access denied', 403);
    return {
      id: record.id,
      patientId: record.patientId,
      diagnosis: record.diagnosis,
      vitals: record.vitals,
      updatedAt: record.updatedAt,
    };
  }

  return filterRecordForRole(record, role);
}

async function createEhrRecord(data, requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'doctor') throw makeError('Access denied', 403);

  const { patientId, diagnosis, vitals, s3FileKey } = data || {};
  const record = await prisma.eHR.create({
    data: {
      patientId,
      doctorId: tokenUserId(requestingUser),
      diagnosis,
      vitals: vitals ?? {},
      s3FileKey: s3FileKey ?? null,
    },
  });
  return record;
}

async function updateEhrRecord(ehrId, data, requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role === 'admin' || role === 'patient') throw makeError('Access denied', 403);

  const existing = await prisma.eHR.findUnique({ where: { id: ehrId } });
  if (!existing) throw makeError('Not found', 404);

  let updateData = {};
  if (role === 'nurse') {
    if (Object.prototype.hasOwnProperty.call(data || {}, 'vitals')) {
      updateData.vitals = data.vitals;
    }
  } else if (role === 'doctor') {
    if (Object.prototype.hasOwnProperty.call(data || {}, 'diagnosis')) updateData.diagnosis = data.diagnosis;
    if (Object.prototype.hasOwnProperty.call(data || {}, 'vitals')) updateData.vitals = data.vitals;
    if (Object.prototype.hasOwnProperty.call(data || {}, 's3FileKey')) updateData.s3FileKey = data.s3FileKey;
  } else {
    throw makeError('Access denied', 403);
  }

  const updated = await prisma.eHR.update({
    where: { id: ehrId },
    data: updateData,
  });
  return updated;
}

async function getPatientEhr(patientId, requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role === 'admin') throw makeError('Access denied', 403);

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });
  if (!patient) throw makeError('Not found', 404);

  const uid = tokenUserId(requestingUser);
  if (role === 'doctor') {
    if (patient.assignedDoctorId !== uid) throw makeError('Access denied', 403);
  } else if (role === 'patient') {
    if (patient.userId !== uid) throw makeError('Access denied', 403);
  } else if (role === 'nurse') {
    // Allowed: no nurse assignment model exists
  } else {
    throw makeError('Access denied', 403);
  }

  const records = await prisma.eHR.findMany({
    where: { patientId },
    orderBy: { updatedAt: 'desc' },
    include: {
      doctor: { select: { firstName: true, lastName: true, email: true, department: true } },
    },
  });

  if (role === 'patient') {
    return records.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      diagnosis: r.diagnosis,
      vitals: r.vitals,
      s3FileKey: r.s3FileKey,
      updatedAt: r.updatedAt,
      doctorDisplayName: formatDoctorDisplay(r.doctor),
      doctorDepartment: r.doctor?.department?.trim() ? r.doctor.department.trim() : null,
    }));
  }

  return records.map((r) => filterRecordForRole(r, role));
}

async function getPatientProfileSelf(requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'patient') throw makeError('Access denied', 403);
  const uid = tokenUserId(requestingUser);
  const patient = await prisma.patient.findUnique({
    where: { userId: uid },
    include: {
      assignedDoctor: { select: { firstName: true, lastName: true, department: true } },
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!patient) throw makeError('Not found', 404);
  const { storageConfigured } = require('./storage.helper');
  return {
    medicalRecordNumber: patient.medicalRecordNumber,
    assignedDoctorDisplayName: formatDoctorDisplay(patient.assignedDoctor),
    assignedDoctorDepartment: patient.assignedDoctor?.department?.trim()
      ? patient.assignedDoctor.department.trim()
      : null,
    email: patient.user?.email ?? null,
    firstName: patient.user?.firstName ?? null,
    lastName: patient.user?.lastName ?? null,
    filesStorageAvailable: storageConfigured(),
  };
}

async function breakGlassEmergency({
  patientIdentifier,
  reason,
  reasonDetail,
  requestingUser,
  ipAddress,
  patientLookup = 'flexible',
}) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'doctor') throw makeError('Access denied', 403);

  const patient =
    patientLookup === 'mrnOnly'
      ? await resolvePatientByMrnOnly(patientIdentifier)
      : await resolvePatientByIdentifier(patientIdentifier);
  const uid = tokenUserId(requestingUser);
  const reasonNorm = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Medical emergency';
  const details = {
    reason: reasonNorm,
    reasonDetail: typeof reasonDetail === 'string' && reasonDetail.trim() ? reasonDetail.trim() : null,
    patientId: patient.id,
  };

  const rid = String(patient.id);
  await prisma.auditLog.create({
    data: {
      userId: uid,
      action: 'BREAK_GLASS',
      resourceId: rid.length > 100 ? rid.slice(0, 100) : rid,
      decision: 'ALLOW',
      trustScore: null,
      ipAddress: ipAddress ? String(ipAddress).slice(0, 100) : null,
      details,
    },
  });

  return {
    success: true,
    message: 'Break-glass access granted',
    patientId: patient.id,
    reason: reasonNorm,
  };
}

async function breakGlassAccess(patientId, requestingUser, extra = {}) {
  return breakGlassEmergency({
    patientIdentifier: patientId,
    reason: extra.reason,
    reasonDetail: extra.reasonDetail,
    requestingUser,
    ipAddress: extra.ipAddress,
  });
}

async function listDoctorAssignedPatients(requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'doctor') throw makeError('Access denied', 403);
  const uid = tokenUserId(requestingUser);

  const patients = await prisma.patient.findMany({
    where: { assignedDoctorId: uid },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const patientIds = patients.map((p) => p.id);
  const ehrRows =
    patientIds.length === 0
      ? []
      : await prisma.eHR.findMany({
          where: { patientId: { in: patientIds } },
          orderBy: [{ updatedAt: 'desc' }],
        });

  const latestByPatient = new Map();
  for (const row of ehrRows) {
    if (!latestByPatient.has(row.patientId)) latestByPatient.set(row.patientId, row);
  }

  const lastRead = await prisma.auditLog.findFirst({
    where: { userId: uid, action: 'READ_EHR', decision: 'ALLOW' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });

  const maxEhrUpdated =
    ehrRows.length > 0
      ? ehrRows.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), ehrRows[0].updatedAt)
      : null;

  const lastAccessAt = lastRead?.timestamp || maxEhrUpdated || null;

  const stats = {
    myPatients: patients.length,
    ehrRecords: ehrRows.length,
    pendingFiles: ehrRows.filter((r) => !r.s3FileKey).length,
    lastAccessAt: lastAccessAt ? lastAccessAt.toISOString() : null,
  };

  const assignedPatients = patients.map((p) => {
    const latest = latestByPatient.get(p.id) || null;
    const fn = p.user?.firstName?.trim() || '';
    const ln = p.user?.lastName?.trim() || '';
    const displayName = [fn, ln].filter(Boolean).join(' ') || p.user?.email || 'Patient';
    return {
      patientId: p.id,
      userId: p.userId,
      email: p.user?.email ?? null,
      firstName: p.user?.firstName ?? null,
      lastName: p.user?.lastName ?? null,
      displayName,
      mrn: p.medicalRecordNumber,
      assignedSince: p.createdAt.toISOString(),
      latestEhr: latest
        ? {
            id: latest.id,
            diagnosis: latest.diagnosis,
            vitals: latest.vitals,
            updatedAt: latest.updatedAt.toISOString(),
            s3FileKey: latest.s3FileKey,
          }
        : null,
    };
  });

  return { patients: assignedPatients, stats };
}

async function enrichDoctorAccessRows(rows) {
  const ridUuids = [
    ...new Set(rows.map((r) => r.resourceId).filter((id) => id && UUID_RE.test(String(id)))),
  ];
  const ehrs =
    ridUuids.length > 0
      ? await prisma.eHR.findMany({
          where: { id: { in: ridUuids } },
          select: { id: true, patient: { select: { medicalRecordNumber: true } } },
        })
      : [];
  const mrnByEhrId = new Map(
    ehrs.map((e) => [e.id, e.patient?.medicalRecordNumber || null]),
  );

  const patients =
    ridUuids.length > 0
      ? await prisma.patient.findMany({
          where: { id: { in: ridUuids } },
          select: { id: true, medicalRecordNumber: true },
        })
      : [];
  const mrnByPatientId = new Map(patients.map((p) => [p.id, p.medicalRecordNumber]));

  return rows.map((log) => {
    const rid = log.resourceId;
    let patientLabel = '—';
    if (rid && UUID_RE.test(String(rid))) {
      if (log.action === 'BREAK_GLASS') {
        patientLabel = mrnByPatientId.get(rid) || truncateUuid(rid);
      } else {
        patientLabel = mrnByEhrId.get(rid) || mrnByPatientId.get(rid) || truncateUuid(rid);
      }
    } else if (rid) {
      patientLabel = String(rid);
    }
    return {
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      action: log.action,
      decision: log.decision,
      ipAddress: log.ipAddress,
      resourceId: log.resourceId,
      patientLabel,
      details: log.details ?? null,
    };
  });
}

async function listDoctorAccessLog(requestingUser, { take = 50, skip: skipArg = 0, action } = {}) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'doctor') throw makeError('Access denied', 403);
  const uid = tokenUserId(requestingUser);
  const n = Math.min(100, Math.max(1, parseInt(String(take), 10) || 50));
  const skipParsed = parseInt(String(skipArg ?? 0), 10);
  const skip = Number.isFinite(skipParsed) && skipParsed >= 0 ? skipParsed : 0;

  const where = { userId: uid };
  if (typeof action === 'string' && action.trim()) {
    where.action = action.trim();
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: n,
      skip,
    }),
  ]);

  const logs = await enrichDoctorAccessRows(rows);
  return { logs, total, take: n, skip };
}

function startOfUtcDay(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

async function listNursePatients(requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'nurse') throw makeError('Access denied', 403);

  const patients = await prisma.patient.findMany({
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      assignedDoctor: { select: { firstName: true, lastName: true, email: true } },
      ehrRecords: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { id: true, updatedAt: true, vitals: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return patients.map((p) => {
    const latest = p.ehrRecords[0] || null;
    const fn = p.user?.firstName?.trim() || '';
    const ln = p.user?.lastName?.trim() || '';
    const displayName = [fn, ln].filter(Boolean).join(' ') || null;
    let assignedDoctorName = null;
    if (p.assignedDoctor) {
      const dfn = p.assignedDoctor.firstName?.trim() || '';
      const dln = p.assignedDoctor.lastName?.trim() || '';
      const docFull = [dfn, dln].filter(Boolean).join(' ');
      assignedDoctorName = docFull ? `Dr. ${docFull}` : p.assignedDoctor.email || null;
    }
    return {
      patientId: p.id,
      email: p.user?.email ?? null,
      firstName: p.user?.firstName ?? null,
      lastName: p.user?.lastName ?? null,
      displayName,
      mrn: p.medicalRecordNumber,
      assignedDoctorName,
      lastVitalsAt: latest?.updatedAt ? latest.updatedAt.toISOString() : null,
      latestEhrId: latest?.id ?? null,
    };
  });
}

async function getNurseDashboardSummary(requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'nurse') throw makeError('Access denied', 403);
  const uid = tokenUserId(requestingUser);
  const dayStart = startOfUtcDay();

  const [myPatients, vitalsUpdatedToday, pendingVitals, lastLog] = await Promise.all([
    prisma.patient.count(),
    prisma.eHR.count({
      where: {
        updatedAt: { gte: dayStart },
        AND: [
          { NOT: { vitals: { equals: Prisma.DbNull } } },
          { NOT: { vitals: { equals: {} } } },
        ],
      },
    }),
    prisma.eHR.count({
      where: {
        OR: [{ vitals: { equals: Prisma.DbNull } }, { vitals: { equals: {} } }],
      },
    }),
    prisma.auditLog.findFirst({
      where: {
        userId: uid,
        action: { in: ['READ_EHR', 'WRITE_EHR'] },
        decision: 'ALLOW',
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    }),
  ]);

  return {
    myPatients,
    vitalsUpdatedToday,
    pendingVitals,
    lastActivityAt: lastLog?.timestamp ? lastLog.timestamp.toISOString() : null,
  };
}

async function listNurseAccessLog(requestingUser, { take = 50, skip: skipArg = 0, action } = {}) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'nurse') throw makeError('Access denied', 403);
  const uid = tokenUserId(requestingUser);
  const n = Math.min(100, Math.max(1, parseInt(String(take), 10) || 50));
  const skipParsed = parseInt(String(skipArg ?? 0), 10);
  const skip = Number.isFinite(skipParsed) && skipParsed >= 0 ? skipParsed : 0;

  const where = { userId: uid };
  if (typeof action === 'string' && action.trim()) {
    where.action = action.trim();
  } else {
    where.action = { in: ['READ_EHR', 'WRITE_EHR'] };
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: n,
      skip,
    }),
  ]);

  const logs = await enrichDoctorAccessRows(rows);
  return { logs, total, take: n, skip };
}

module.exports = {
  getEhrRecord,
  createEhrRecord,
  updateEhrRecord,
  getPatientEhr,
  getPatientProfileSelf,
  breakGlassAccess,
  breakGlassEmergency,
  listDoctorAssignedPatients,
  listDoctorAccessLog,
  listNursePatients,
  getNurseDashboardSummary,
  listNurseAccessLog,
};

