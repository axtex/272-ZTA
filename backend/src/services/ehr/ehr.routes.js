const express = require('express');

const prisma = require('../../config/prisma');
const { verifyToken, verifyRole } = require('../auth/auth.middleware');
const pdp = require('../../middleware/pdp.middleware');
const { tokenUserId } = require('../../utils/jwtPayload');

const ehrService = require('./ehr.service');
const { storageConfigured, uploadEhrFile, getStorageSignedUrl } = require('./storage.helper');

const router = express.Router();

function sendServiceError(res, err) {
  const status = err.statusCode || 500;
  if (status === 404) return res.status(404).json({ error: 'Not found' });
  if (status === 403) return res.status(403).json({ error: 'Access denied' });
  if (status === 400) return res.status(400).json({ error: err.message || 'Bad request' });
  return res.status(500).json({ error: 'Internal server error' });
}

async function attachPatientProfileId(req, res, next) {
  try {
    const uid = tokenUserId(req.user);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const p = await prisma.patient.findUnique({ where: { userId: uid }, select: { id: true } });
    if (!p) return res.status(404).json({ error: 'Patient profile not found' });
    req.patientProfileId = p.id;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

router.get('/ehr/:id', verifyToken, pdp('ehr', 'read', (req) => req.params.id), async (req, res) => {
  try {
    const record = await ehrService.getEhrRecord(req.params.id, req.user);
    return res.status(200).json({ record, trustScore: req.pdpResult?.trustScore });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.post('/ehr', verifyToken, pdp('ehr', 'write'), async (req, res) => {
  try {
    const record = await ehrService.createEhrRecord(req.body, req.user);
    return res.status(201).json({ record, trustScore: req.pdpResult?.trustScore });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.patch('/ehr/:id', verifyToken, pdp('ehr', 'write', (req) => req.params.id), async (req, res) => {
  try {
    const record = await ehrService.updateEhrRecord(req.params.id, req.body, req.user);
    return res.status(200).json({ record, trustScore: req.pdpResult?.trustScore });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.get('/patients/:patientId/ehr', verifyToken, pdp('ehr', 'read', (req) => req.params.patientId), async (req, res) => {
  try {
    const records = await ehrService.getPatientEhr(req.params.patientId, req.user);
    return res.status(200).json({ records, trustScore: req.pdpResult?.trustScore });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.get(
  '/patient/ehr',
  verifyToken,
  verifyRole('patient'),
  attachPatientProfileId,
  pdp('ehr', 'read', (req) => req.patientProfileId),
  async (req, res) => {
    try {
      const records = await ehrService.getPatientEhr(req.patientProfileId, req.user);
      return res.status(200).json({ records, trustScore: req.pdpResult?.trustScore });
    } catch (err) {
      return sendServiceError(res, err);
    }
  },
);

router.get('/patient/profile', verifyToken, verifyRole('patient'), async (req, res) => {
  try {
    const profile = await ehrService.getPatientProfileSelf(req.user);
    return res.status(200).json(profile);
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.get(
  '/doctor/assigned-patients',
  verifyToken,
  verifyRole('doctor'),
  pdp('ehr', 'read', (req) => tokenUserId(req.user)),
  async (req, res) => {
    try {
      const { storageConfigured } = require('./storage.helper');
      const payload = await ehrService.listDoctorAssignedPatients(req.user);
      return res.status(200).json({ ...payload, filesStorageAvailable: storageConfigured() });
    } catch (err) {
      return sendServiceError(res, err);
    }
  },
);

router.get(
  '/doctor/access-log',
  verifyToken,
  verifyRole('doctor'),
  pdp('ehr', 'read', (req) => tokenUserId(req.user)),
  async (req, res) => {
    try {
      const takeRaw = parseInt(String(req.query.take ?? '50'), 10);
      const take = Number.isFinite(takeRaw) ? takeRaw : 50;
      const skipRaw = parseInt(String(req.query.skip ?? '0'), 10);
      const skip = Number.isFinite(skipRaw) && skipRaw >= 0 ? skipRaw : 0;
      const action = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
      const result = await ehrService.listDoctorAccessLog(req.user, { take, skip, action });
      return res.status(200).json(result);
    } catch (err) {
      return sendServiceError(res, err);
    }
  },
);

router.get(
  '/nurse/patients',
  verifyToken,
  verifyRole('nurse'),
  pdp('ehr', 'read', (req) => tokenUserId(req.user)),
  async (req, res) => {
    try {
      const patients = await ehrService.listNursePatients(req.user);
      return res.status(200).json({ patients });
    } catch (err) {
      return sendServiceError(res, err);
    }
  },
);

router.get(
  '/nurse/summary',
  verifyToken,
  verifyRole('nurse'),
  pdp('ehr', 'read', (req) => tokenUserId(req.user)),
  async (req, res) => {
    try {
      const summary = await ehrService.getNurseDashboardSummary(req.user);
      return res.status(200).json(summary);
    } catch (err) {
      return sendServiceError(res, err);
    }
  },
);

router.get(
  '/nurse/access-log',
  verifyToken,
  verifyRole('nurse'),
  pdp('ehr', 'read', (req) => tokenUserId(req.user)),
  async (req, res) => {
    try {
      const takeRaw = parseInt(String(req.query.take ?? '50'), 10);
      const take = Number.isFinite(takeRaw) ? takeRaw : 50;
      const skipRaw = parseInt(String(req.query.skip ?? '0'), 10);
      const skip = Number.isFinite(skipRaw) && skipRaw >= 0 ? skipRaw : 0;
      const action = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
      const result = await ehrService.listNurseAccessLog(req.user, { take, skip, action });
      return res.status(200).json(result);
    } catch (err) {
      return sendServiceError(res, err);
    }
  },
);

router.post(
  '/doctor/break-glass',
  verifyToken,
  verifyRole('doctor'),
  pdp('ehr', 'read', (req) => String(req.body?.patientIdentifier || 'unknown').slice(0, 100)),
  async (req, res) => {
    try {
      const xf = req.headers['x-forwarded-for'];
      const ip =
        req.ip ||
        (typeof xf === 'string' ? xf.split(',')[0].trim() : '') ||
        req.socket?.remoteAddress ||
        null;
      const result = await ehrService.breakGlassEmergency({
        patientIdentifier: req.body?.patientIdentifier,
        reason: req.body?.reason,
        reasonDetail: req.body?.reasonDetail,
        requestingUser: req.user,
        ipAddress: ip,
      });
      return res.status(200).json(result);
    } catch (err) {
      return sendServiceError(res, err);
    }
  },
);

router.post('/patients/:patientId/break-glass', verifyToken, pdp('ehr', 'read', (req) => req.params.patientId), async (req, res) => {
  try {
    const xf = req.headers['x-forwarded-for'];
    const ip =
      req.ip ||
      (typeof xf === 'string' ? xf.split(',')[0].trim() : '') ||
      req.socket?.remoteAddress ||
      null;
    const result = await ehrService.breakGlassAccess(req.params.patientId, req.user, {
      reason: req.body?.reason,
      reasonDetail: req.body?.reasonDetail,
      ipAddress: ip,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.post('/ehr/:id/files', verifyToken, pdp('ehr', 'write', (req) => req.params.id), async (req, res) => {
  try {
    if (!storageConfigured()) {
      return res.status(503).json({ error: 'File storage (Supabase) is not configured' });
    }

    const { filename, mimetype, contentBase64 } = req.body || {};
    if (!filename || !mimetype || !contentBase64) {
      return res.status(400).json({ error: 'filename, mimetype, and contentBase64 are required' });
    }

    const record = await prisma.eHR.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: 'Not found' });

    const buffer = Buffer.from(String(contentBase64), 'base64');
    const { fileKey } = await uploadEhrFile(buffer, filename, mimetype, record.patientId);

    const updated = await prisma.eHR.update({
      where: { id: req.params.id },
      data: { s3FileKey: fileKey },
    });

    return res.status(200).json({ success: true, fileKey: updated.s3FileKey });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.get('/ehr/:id/files/url', verifyToken, pdp('ehr', 'read', (req) => req.params.id), async (req, res) => {
  try {
    if (!storageConfigured()) {
      return res.status(503).json({ error: 'File storage (Supabase) is not configured' });
    }

    const record = await prisma.eHR.findUnique({
      where: { id: req.params.id },
      select: { s3FileKey: true },
    });
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!record.s3FileKey) return res.status(404).json({ error: 'No file attached' });

    const url = await getStorageSignedUrl(record.s3FileKey);
    return res.status(200).json({ url });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

module.exports = router;

