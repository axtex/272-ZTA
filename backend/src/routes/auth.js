const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma = require('../config/prisma');

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
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── POST /api/auth/register ───────────────────────────────────
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { username, email, password, roleName } = req.body;

    // 1. Validate input
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // 2. Block non-patient self-registration
    const requestedRole = (roleName || 'Patient').trim().toLowerCase();
    if (requestedRole !== 'patient') {
      return res.status(403).json({
        error: 'Only Patient accounts can self-register. Contact admin for staff access.',
      });
    }

    // 3. Check for duplicate email or username
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { username: normalizedUsername },
        ],
      },
    });

    if (existing) {
      const field =
        existing.email === normalizedEmail ? 'Email' : 'Username';
      return res.status(409).json({ error: `${field} is already registered` });
    }

    // 4. Find Patient role in DB
    const role = await prisma.role.findFirst({
      where: {
        roleName: {
          equals: 'Patient',
          mode: 'insensitive',
        },
      },
    });

    if (!role) {
      return res.status(500).json({ error: 'Role configuration error. Contact admin.' });
    }

    // 5. Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        roleId: role.id,
        mfaEnabled: false,
        status: 'ACTIVE',
      },
    });

    // 6. Create patient profile with unique MRN
    const mrn = `MRN-${Date.now()}`;
    await prisma.patient.create({
      data: {
        userId: user.id,
        medicalRecordNumber: mrn,
        assignedDoctorId: null,
      },
    });

    // 7. Write audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        resourceId: user.id,
        decision: 'ALLOW',
        trustScore: 50,
        ipAddress: req.ip || null,
      },
    });

    // 8. Return success only — no token
    res.status(201).json({
      message: 'Account created successfully. Please log in.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: 'Patient',
      },
    });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
