const prisma = require('../../config/prisma');
const { tokenUserId, tokenRoleKey } = require('../../utils/jwtPayload');

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
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
  });

  if (role === 'patient') {
    return records.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      diagnosis: r.diagnosis,
      vitals: r.vitals,
      updatedAt: r.updatedAt,
    }));
  }

  return records.map((r) => filterRecordForRole(r, role));
}

async function breakGlassAccess(patientId, requestingUser) {
  const role = tokenRoleKey(requestingUser);
  if (role !== 'doctor') throw makeError('Access denied', 403);

  // AuditLog schema fields are: userId, action, resourceId, decision, trustScore, ipAddress, timestamp
  // DecisionType enum does NOT include OVERRIDE in schema; use ALLOW to record the override event.
  await prisma.auditLog.create({
    data: {
      userId: tokenUserId(requestingUser),
      action: 'BREAK_GLASS',
      resourceId: String(patientId),
      decision: 'ALLOW',
      trustScore: null,
      ipAddress: null,
    },
  });

  return { success: true, message: 'Break-glass access granted' };
}

module.exports = {
  getEhrRecord,
  createEhrRecord,
  updateEhrRecord,
  getPatientEhr,
  breakGlassAccess,
};

