const express = require('express');

const prisma = require('../../config/prisma');
const { verifyToken, verifyRole } = require('../auth/auth.middleware');

const router = express.Router();

router.get('/logs', verifyToken, verifyRole('admin'), async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 100,
    include: { user: { select: { email: true } } },
  });

  return res.status(200).json({ logs });
});

module.exports = router;

