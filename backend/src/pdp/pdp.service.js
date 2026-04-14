const { newEnforcer } = require('casbin');
const path = require('path');
const prisma = require('../db');

// ── Load casbin enforcer ──────────────────────────────────────
let enforcer = null;

async function getEnforcer() {
  if (!enforcer) {
    const modelPath  = path.join(__dirname, 'model.conf');
    const policyPath = path.join(__dirname, 'policy.csv');
    enforcer = await newEnforcer(modelPath, policyPath);
  }
  return enforcer;
}

// ── Trust Score Calculator ────────────────────────────────────
async function calculateTrustScore({ userId, userAgent, ipAddress }) {
  let score = 50;

  const device = (userId && userAgent)
    ? await prisma.device.findFirst({
        where: { userId, userAgent },
      })
    : null;

  if (!device) {
    score -= 25;
  } else {
    score += 30;
    if (device.ip && device.ip === ipAddress) {
      score += 10;
    } else if (device.ip && device.ip !== ipAddress) {
      score -= 10;
    }
  }

  const hour = new Date().getUTCHours();
  if (hour >= 2 && hour < 5) {
    score -= 20;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    return 0;
  }

  return Math.max(0, Math.min(100, score));
}

// ── Make Decision ─────────────────────────────────────────────
function getDecisionFromScore(score) {
  if (score >= 70) return 'ALLOW';
  if (score >= 45) return 'STEP_UP';
  return 'DENY';
}

// ── Write Audit Log ───────────────────────────────────────────
async function writeAuditLog({ userId, action, resourceId, decision, trustScore, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId:     userId ?? null,
        action,
        resourceId: resourceId ? String(resourceId) : null,
        decision,
        trustScore,
        ipAddress:  ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write:', err.message);
  }
}

// ── Main Evaluate Function ────────────────────────────────────
async function evaluate({ userId, role, resource, action, userAgent, ipAddress, resourceId }) {
  try {
    const e = await getEnforcer();
    const allowed = await e.enforce(role, resource, action);

    if (!allowed) {
      await writeAuditLog({
        userId,
        action: `${action.toUpperCase()}_${resource.toUpperCase()}`,
        resourceId,
        decision: 'DENY',
        trustScore: 0,
        ipAddress,
      });
      return {
        decision: 'DENY',
        reason: `Role ${role} does not have permission to ${action} ${resource}`,
        trustScore: 0,
      };
    }

    const trustScore = await calculateTrustScore({ userId, userAgent, ipAddress });
    const decision   = getDecisionFromScore(trustScore);

    await writeAuditLog({
      userId,
      action: `${action.toUpperCase()}_${resource.toUpperCase()}`,
      resourceId,
      decision,
      trustScore,
      ipAddress,
    });

    return {
      decision,
      trustScore,
      reason: decision === 'ALLOW'
        ? 'Access granted'
        : decision === 'STEP_UP'
        ? 'Additional verification required'
        : 'Trust score too low',
    };

  } catch (err) {
    console.error('[PDP] Evaluation error:', err.message);
    return { decision: 'DENY', reason: 'Policy evaluation error', trustScore: 0 };
  }
}

module.exports = { evaluate, writeAuditLog };