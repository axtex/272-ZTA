const express = require('express');
const {
  login,
  mfaSetup,
  mfaVerify,
  mfaValidate,
  refreshToken,
  logout,
} = require('./auth.controller');
const { verifyToken } = require('./auth.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/mfa/setup', verifyToken, mfaSetup);
router.post('/mfa/verify', verifyToken, mfaVerify);
router.post('/mfa/validate', mfaValidate);
router.post('/token/refresh', refreshToken);
router.post('/logout', logout);

module.exports = router;
