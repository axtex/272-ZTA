const express = require('express');
const { getAnomalySummary } = require('./anomaly.service');
const { verifyToken, verifyRole } = require('../auth/auth.middleware');

const router = express.Router();

// GET /api/anomaly/summary — Admin only
router.get('/summary', verifyToken, verifyRole('Admin'), async (req, res, next) => {
  try {
    const summary = await getAnomalySummary();
    res.json(summary);
  } catch (e) {
    next(e);
  }
});

module.exports = router;