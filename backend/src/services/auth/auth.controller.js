const {
  registerPatient,
  registerUser,
  loginUser,
  setupMfa,
  verifyMfaSetup,
  validateMfaLogin,
  refreshTokens,
  logoutUser,
} = require('./auth.service');

function handleAuthError(res, error) {
  const msg = error.message;
  if (msg === 'User not found') {
    return res.status(404).json({ error: msg });
  }
  if (
    msg === 'Invalid credentials' ||
    msg === 'Invalid MFA code' ||
    msg === 'Invalid token' ||
    msg === 'Refresh token expired' ||
    msg === 'Invalid refresh token'
  ) {
    return res.status(401).json({ error: msg });
  }
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  return res.status(500).json({ error: msg });
}

async function register(req, res) {
  try {
    const { email, password, role } = req.body || {};
    const user = await registerUser(email, password, role);
    return res.status(201).json({ user });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return handleAuthError(res, error);
  }
}

async function login(req, res) {
  try {
    const { email, password, timezone } = req.body;
    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      timezone,
    };
    const result = await loginUser(email, password, deviceInfo);
    return res.status(200).json(result);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

async function mfaSetup(req, res) {
  try {
    const result = await setupMfa(req.user.userId);
    return res.status(200).json({
      secret: result.secret,
      qrCode: result.qrCode,
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

async function mfaVerify(req, res) {
  try {
    await verifyMfaSetup(req.user.userId, req.body.code);
    return res.status(200).json({ success: true });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

async function mfaValidate(req, res) {
  try {
    const tokens = await validateMfaLogin(req.body.tempToken, req.body.code);
    return res.status(200).json(tokens);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

async function refreshToken(req, res) {
  try {
    const tokens = await refreshTokens(req.body.refreshToken);
    return res.status(200).json(tokens);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

async function logout(req, res) {
  try {
    const result = await logoutUser(req.body.refreshToken);
    return res.status(200).json(result);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

module.exports = {
  register,
  login,
  mfaSetup,
  mfaVerify,
  mfaValidate,
  refreshToken,
  logout,
};
