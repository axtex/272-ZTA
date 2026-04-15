const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Block MFA pending tokens from accessing protected routes
    if (payload.mfaPending) {
      return res.status(403).json({ error: 'MFA verification required' });
    }

    req.user = payload; // { sub, email, roleId, roleName }
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }
}

module.exports = authenticate;