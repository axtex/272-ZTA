const express = require('express');

const prisma = require('../../config/prisma');
const { verifyToken } = require('../auth/auth.middleware');
const pdp = require('../../middleware/pdp.middleware');

const ehrService = require('./ehr.service');
const { s3Configured, uploadFileToS3, getPresignedUrl } = require('./s3.helper');

const router = express.Router();

function sendServiceError(res, err) {
  const status = err.statusCode || 500;
  if (status === 404) return res.status(404).json({ error: 'Not found' });
  if (status === 403) return res.status(403).json({ error: 'Access denied' });
  return res.status(500).json({ error: 'Internal server error' });
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

router.post('/patients/:patientId/break-glass', verifyToken, pdp('ehr', 'read', (req) => req.params.patientId), async (req, res) => {
  try {
    const result = await ehrService.breakGlassAccess(req.params.patientId, req.user);
    return res.status(200).json(result);
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.post('/ehr/:id/files', verifyToken, pdp('ehr', 'write', (req) => req.params.id), async (req, res) => {
  try {
    if (!s3Configured) {
      return res.status(503).json({ error: 'S3 is not configured' });
    }

    const { filename, mimetype, contentBase64 } = req.body || {};
    if (!filename || !mimetype || !contentBase64) {
      return res.status(400).json({ error: 'filename, mimetype, and contentBase64 are required' });
    }

    const record = await prisma.eHR.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: 'Not found' });

    const buffer = Buffer.from(String(contentBase64), 'base64');
    const { s3Key } = await uploadFileToS3(buffer, filename, mimetype, record.patientId);

    const updated = await prisma.eHR.update({
      where: { id: req.params.id },
      data: { s3FileKey: s3Key },
    });

    return res.status(200).json({ success: true, s3Key: updated.s3FileKey });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

router.get('/ehr/:id/files/url', verifyToken, pdp('ehr', 'read', (req) => req.params.id), async (req, res) => {
  try {
    if (!s3Configured) {
      return res.status(503).json({ error: 'S3 is not configured' });
    }

    const record = await prisma.eHR.findUnique({
      where: { id: req.params.id },
      select: { s3FileKey: true },
    });
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!record.s3FileKey) return res.status(404).json({ error: 'No file attached' });

    const url = await getPresignedUrl(record.s3FileKey);
    return res.status(200).json({ url });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

module.exports = router;

