const express = require('express');

const prisma = require('../../config/prisma');
const { verifyToken, verifyRole } = require('../auth/auth.middleware');

const router = express.Router();

function shortDeviceLabelFromDetails(details) {
  const ua =
    details && typeof details === 'object' && details.userAgent != null
      ? String(details.userAgent)
      : '';
  if (!ua) return '—';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  let os = 'Device';
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'Mac';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} / ${os}`;
}

const ALLOWED_DECISIONS = new Set(['ALLOW', 'DENY', 'STEP_UP']);
const MAX_TAKE = 200;

function timestampRange(rangeKey) {
  const r = String(rangeKey || 'all').toLowerCase();
  const now = new Date();
  if (r === 'today') {
    return { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  }
  if (r === 'last7' || r === 'last7days') {
    return { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  }
  return undefined;
}

router.get('/logs', verifyToken, verifyRole('admin'), async (req, res) => {
  const decisionRaw = typeof req.query.decision === 'string' ? req.query.decision.trim().toUpperCase() : '';
  const decision = ALLOWED_DECISIONS.has(decisionRaw) ? decisionRaw : undefined;

  const actionRaw = typeof req.query.action === 'string' ? req.query.action.trim() : '';
  const action = actionRaw && actionRaw.length <= 100 ? actionRaw : undefined;

  const rangeKey = typeof req.query.range === 'string' ? req.query.range.trim() : 'all';

  const takeParsed = parseInt(String(req.query.take ?? '20'), 10);
  const take = Number.isFinite(takeParsed) ? Math.min(MAX_TAKE, Math.max(1, takeParsed)) : 20;

  const skipParsed = parseInt(String(req.query.skip ?? '0'), 10);
  const skip = Number.isFinite(skipParsed) && skipParsed >= 0 ? skipParsed : 0;

  const where = {};
  if (decision) where.decision = decision;
  if (action) where.action = action;

  const tsFilter = timestampRange(rangeKey);
  if (tsFilter) where.timestamp = tsFilter;

  const [total, rawLogs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take,
      skip,
      include: { user: { select: { email: true } } },
    }),
  ]);

  const logs = rawLogs.map((log) => ({
    ...log,
    userEmail: log.user?.email ?? null,
    user: undefined,
  }));

  return res.status(200).json({ logs, total, take, skip });
});

router.get('/my-login-activity', verifyToken, verifyRole('patient'), async (req, res) => {
  const userId = req.user.userId ?? req.user.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const rows = await prisma.auditLog.findMany({
    where: { userId, action: 'LOGIN_SUCCESS' },
    orderBy: { timestamp: 'desc' },
    take: 50,
  });
  return res.status(200).json({
    logs: rows.map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      actionLabel: 'Sign in',
      ipAddress: l.ipAddress,
      deviceLabel: shortDeviceLabelFromDetails(l.details),
    })),
  });
});

module.exports = router;
