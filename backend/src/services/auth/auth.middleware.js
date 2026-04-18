const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (
    !authHeader ||
    typeof authHeader !== 'string' ||
    !authHeader.startsWith('Bearer ')
  ) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'JWT_SECRET is not configured' });
  }

  try {
    const payload = jwt.verify(token, secret);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function verifyRole(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase());
  return function roleMiddleware(req, res, next) {
    const userRole =
      req.user?.role != null ? String(req.user.role).toLowerCase() : '';
    if (!req.user || !allowed.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role' });
    }
    next();
  };
}

module.exports = {
  verifyToken,
  verifyRole,
};
