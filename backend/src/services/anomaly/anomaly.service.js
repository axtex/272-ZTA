const prisma = require('../../config/prisma');

const MAX_FAILED_LOGINS = 5;
const FAILED_LOGIN_WINDOW_MINUTES = 15;

/** Rolling window start for lockout: last N minutes, but never before latest admin unlock (preserves audit rows). */
async function effectiveFailedLoginWindowStart(userId) {
  const windowStart = new Date(Date.now() - FAILED_LOGIN_WINDOW_MINUTES * 60 * 1000);
  const lastUnlock = await prisma.auditLog.findFirst({
    where: {
      action: 'ACCOUNT_UNLOCKED',
      resourceId: userId,
    },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  if (!lastUnlock) return windowStart;
  const unlockMs = new Date(lastUnlock.timestamp).getTime();
  return new Date(Math.max(windowStart.getTime(), unlockMs));
}

// ── Failed Login Tracking ─────────────────────────────────────
async function recordFailedLogin(userId, ipAddress) {
  // Write failed login to audit log
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'LOGIN_FAILED',
      resourceId: null,
      decision: 'DENY',
      trustScore: 0,
      ipAddress: ipAddress ?? null,
    },
  });

  const countFrom = await effectiveFailedLoginWindowStart(userId);
  const failedCount = await prisma.auditLog.count({
    where: {
      userId,
      action: 'LOGIN_FAILED',
      timestamp: { gte: countFrom },
    },
  });

  // Auto-lock after 5 failed attempts
  if (failedCount >= MAX_FAILED_LOGINS) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    // Write lockout event to audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_LOCKED',
        resourceId: null,
        decision: 'DENY',
        trustScore: 0,
        ipAddress: ipAddress ?? null,
      },
    });

    return { locked: true, failedCount };
  }

  return { locked: false, failedCount };
}

// ── Off-Hours Access Flag ─────────────────────────────────────
function isOffHours() {
  const hour = new Date().getUTCHours();
  return hour >= 2 && hour < 5;
}

async function flagOffHoursAccess(userId, action, resourceId, ipAddress) {
  if (!isOffHours()) return;

  await prisma.auditLog.create({
    data: {
      userId,
      action: `OFFHOURS_${action}`,
      resourceId: resourceId ?? null,
      decision: 'ALLOW',
      trustScore: null,
      ipAddress: ipAddress ?? null,
    },
  });
}

// ── Bulk Download Detection ───────────────────────────────────
const BULK_THRESHOLD = 10;
const BULK_WINDOW_MINUTES = 5;

async function checkBulkDownload(userId, ipAddress) {
  const windowStart = new Date(Date.now() - BULK_WINDOW_MINUTES * 60 * 1000);

  const recentReads = await prisma.auditLog.count({
    where: {
      userId,
      action: 'READ_EHR',
      timestamp: { gte: windowStart },
      decision: 'ALLOW',
    },
  });

  if (recentReads >= BULK_THRESHOLD) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'BULK_DOWNLOAD_FLAGGED',
        resourceId: null,
        decision: 'DENY',
        trustScore: 0,
        ipAddress: ipAddress ?? null,
      },
    });

    // Suspend account
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    return { flagged: true, recentReads };
  }

  return { flagged: false, recentReads };
}

// ── Get Anomaly Summary for Admin Dashboard ───────────────────
async function getAnomalySummary() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    failedLogins,
    lockedAccounts,
    offHoursAccess,
    bulkDownloads,
    totalDenied,
  ] = await Promise.all([
    prisma.auditLog.count({
      where: { action: 'LOGIN_FAILED', timestamp: { gte: last24h } },
    }),
    prisma.auditLog.count({
      where: { action: 'ACCOUNT_LOCKED', timestamp: { gte: last24h } },
    }),
    prisma.auditLog.count({
      where: { action: { startsWith: 'OFFHOURS_' }, timestamp: { gte: last24h } },
    }),
    prisma.auditLog.count({
      where: { action: 'BULK_DOWNLOAD_FLAGGED', timestamp: { gte: last24h } },
    }),
    prisma.auditLog.count({
      where: { decision: 'DENY', timestamp: { gte: last24h } },
    }),
  ]);

  return {
    last24Hours: {
      failedLogins,
      lockedAccounts,
      offHoursAccess,
      bulkDownloads,
      totalDenied,
    },
  };
}

module.exports = {
  recordFailedLogin,
  flagOffHoursAccess,
  checkBulkDownload,
  getAnomalySummary,
};