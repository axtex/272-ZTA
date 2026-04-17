const { evaluate } = require('../pdp/pdp.service');

// ── PDP Middleware Factory ────────────────────────────────────
// Usage: router.get('/ehr', authenticate, pdp('ehr', 'read'), handler)
function pdp(resource, action, getResourceId = (req) => req.params.id) {
  return async (req, res, next) => {
    // Support both token formats:
    // - old format: { sub, roleName } (our original auth.js)
    // - new format: { userId, role } (teammate's auth.service.js)
    const userId     = req.user?.userId || req.user?.sub;
    const rawRole    = req.user?.role || req.user?.roleName;
    const role       = rawRole
      ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase()
      : undefined;
    const ipAddress  = req.ip || req.headers['x-forwarded-for'];
    const userAgent  = req.headers['user-agent'] ?? null;
    const resourceId = getResourceId(req);

    // Must be authenticated before PDP runs
    if (!userId || !role) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await evaluate({
      userId,
      role,
      resource,
      action,
      userAgent,
      ipAddress,
      resourceId,
    });

    // Attach result to request for route handlers to use
    req.pdpResult = result;

    if (result.decision === 'DENY') {
      return res.status(403).json({
        error: 'Access denied',
        reason: result.reason,
        trustScore: result.trustScore,
      });
    }

    if (result.decision === 'STEP_UP') {
      return res.status(401).json({
        error: 'Step-up authentication required',
        code: 'STEP_UP',
        reason: result.reason,
        trustScore: result.trustScore,
      });
    }

    // ALLOW — continue to route handler
    next();
  };
}

module.exports = pdp;