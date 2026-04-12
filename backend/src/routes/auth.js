const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma = require('../db');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT_SECRET is not configured');
    err.statusCode = 503;
    throw err;
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.roleName,
    },
    secret,
    { expiresIn }
  );
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    const emailTrim = typeof email === 'string' ? email.trim() : '';
    const usernameTrim = typeof username === 'string' ? username.trim() : '';
    const identifier = emailTrim || usernameTrim;
    if (!identifier) {
      return res
        .status(400)
        .json({ error: 'Email or username is required' });
    }

    const user = await prisma.user.findFirst({
      where: emailTrim
        ? { email: emailTrim.toLowerCase() }
        : { username: usernameTrim },
      include: { role: true },
    });

    const unauthorized = () =>
      res.status(401).json({ error: 'Invalid email or password' });

    if (!user) {
      return unauthorized();
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return unauthorized();
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role.roleName,
        mfaEnabled: user.mfaEnabled,
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
