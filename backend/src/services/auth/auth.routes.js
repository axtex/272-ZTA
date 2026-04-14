const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  register,
  login,
  mfaSetup,
  mfaVerify,
  mfaValidate,
  refreshToken,
  logout,
} = require('./auth.controller');
const { verifyToken } = require('./auth.middleware');

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', registerLimiter, register);
router.post('/login', login);
router.post('/mfa/setup', verifyToken, mfaSetup);
router.post('/mfa/verify', verifyToken, mfaVerify);
router.post('/mfa/validate', mfaValidate);
router.post('/token/refresh', refreshToken);
router.post('/logout', logout);

module.exports = router;
