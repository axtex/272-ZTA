const express      = require('express');
const prisma       = require('../db');
const authenticate = require('../middleware/authenticate');
const pdp          = require('../middleware/pdp.middleware');

const router = express.Router();

// ── GET /api/patients/:patientId/ehr ──────────────────────────
// Doctor: sees full record | Nurse: sees vitals only | Patient: own records only
router.get('/patients/:patientId/ehr',
  authenticate,
  pdp('ehr', 'read', (req) => req.params.patientId),
  async (req, res, next) => {
    try {
      const { patientId } = req.params;
      const role           = req.user.roleName;
      const userId         = req.user.sub;

      // Patient can only see their own records
      if (role === 'Patient') {
        const patient = await prisma.patient.findUnique({
          where: { userId },
        });
        if (!patient || patient.id !== patientId) {
          return res.status(403).json({ error: 'You can only access your own records' });
        }
      }

      const records = await prisma.eHR.findMany({
        where: { patientId },
        select: {
          id:        true,
          patientId: true,
          updatedAt: true,
          vitals:    true,
          // Nurses cannot see diagnosis
          diagnosis: role !== 'Nurse',
          s3FileKey: role !== 'Nurse' && role !== 'Patient',
          doctorId:  true,
        },
      });

      res.json({
        records,
        accessLevel: role,
        trustScore:  req.pdpResult?.trustScore,
      });

    } catch (e) {
      next(e);
    }
  }
);

// ── GET /api/ehr/:id ──────────────────────────────────────────
router.get('/ehr/:id',
  authenticate,
  pdp('ehr', 'read', (req) => req.params.id),
  async (req, res, next) => {
    try {
      const role   = req.user.roleName;
      const record = await prisma.eHR.findUnique({
        where: { id: req.params.id },
      });

      if (!record) {
        return res.status(404).json({ error: 'EHR record not found' });
      }

      // Field-level filtering per role
      if (role === 'Nurse') {
        const { diagnosis, s3FileKey, ...allowed } = record;
        return res.json({ record: allowed, trustScore: req.pdpResult?.trustScore });
      }

      res.json({ record, trustScore: req.pdpResult?.trustScore });

    } catch (e) {
      next(e);
    }
  }
);

// ── POST /api/ehr ─────────────────────────────────────────────
// Only Doctors can create EHR records
router.post('/ehr',
  authenticate,
  pdp('ehr', 'write'),
  async (req, res, next) => {
    try {
      const { patientId, diagnosis, vitals, s3FileKey } = req.body;

      if (!patientId || !diagnosis) {
        return res.status(400).json({ error: 'patientId and diagnosis are required' });
      }

      const record = await prisma.eHR.create({
        data: {
          patientId,
          doctorId: req.user.sub,
          diagnosis,
          vitals:   vitals ?? {},
          s3FileKey: s3FileKey ?? null,
        },
      });

      res.status(201).json({ record, trustScore: req.pdpResult?.trustScore });

    } catch (e) {
      next(e);
    }
  }
);

// ── PATCH /api/ehr/:id ────────────────────────────────────────
// Doctor: update anything | Nurse: update vitals only
router.patch('/ehr/:id',
  authenticate,
  pdp('ehr', 'write', (req) => req.params.id),
  async (req, res, next) => {
    try {
      const role = req.user.roleName;
      const { diagnosis, vitals, s3FileKey } = req.body;

      // Nurses can only update vitals
      if (role === 'Nurse') {
        if (diagnosis || s3FileKey) {
          return res.status(403).json({
            error: 'Nurses can only update vitals',
          });
        }
        const record = await prisma.eHR.update({
          where: { id: req.params.id },
          data:  { vitals },
        });
        return res.json({ record, trustScore: req.pdpResult?.trustScore });
      }

      // Doctor can update everything
      const record = await prisma.eHR.update({
        where: { id: req.params.id },
        data: {
          ...(diagnosis  && { diagnosis }),
          ...(vitals     && { vitals }),
          ...(s3FileKey  && { s3FileKey }),
        },
      });

      res.json({ record, trustScore: req.pdpResult?.trustScore });

    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;