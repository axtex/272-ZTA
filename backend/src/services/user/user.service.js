const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');

function stripPassword(user) {
  if (!user) return user;
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

function normalizeStatus(status) {
  if (status == null) return undefined;
  if (typeof status !== 'string') return undefined;
  const upper = status.toUpperCase();
  // Support requested INACTIVE value by mapping to schema's DISABLED.
  if (upper === 'INACTIVE') return 'DISABLED';
  if (upper === 'ACTIVE' || upper === 'SUSPENDED' || upper === 'DISABLED') return upper;
  return undefined;
}

async function findRoleByName(roleName) {
  if (!roleName || typeof roleName !== 'string') return null;
  return prisma.role.findFirst({
    where: { roleName: { equals: roleName, mode: 'insensitive' } },
  });
}

async function listUsers({ roleName } = {}) {
  const where = roleName
    ? { role: { roleName: { equals: roleName, mode: 'insensitive' } } }
    : undefined;
  const users = await prisma.user.findMany({
    where,
    include: { role: true },
    orderBy: { createdAt: 'desc' },
  });
  return users.map(stripPassword);
}

async function getUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  return stripPassword(user);
}

async function createUser({ username, email, password, roleName }) {
  const role = await findRoleByName(roleName);
  if (!role) {
    const err = new Error('Invalid role');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const created = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        roleId: role.id,
        status: 'ACTIVE',
      },
      include: { role: true },
    });
    return stripPassword(created);
  } catch (e) {
    // Prisma unique constraint error
    if (e && e.code === 'P2002') {
      const err = new Error('User already exists');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function updateUser(id, { username, email, roleName, status }) {
  const data = {};
  if (username !== undefined) data.username = username;
  if (email !== undefined) data.email = email;

  if (roleName !== undefined) {
    const role = await findRoleByName(roleName);
    if (!role) {
      const err = new Error('Invalid role');
      err.statusCode = 400;
      throw err;
    }
    data.roleId = role.id;
  }

  if (status !== undefined) {
    const normalized = normalizeStatus(status);
    if (!normalized) {
      const err = new Error('Invalid status');
      err.statusCode = 400;
      throw err;
    }
    data.status = normalized;
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      include: { role: true },
    });
    return stripPassword(updated);
  } catch (e) {
    if (e && e.code === 'P2025') {
      const err = new Error('Not found');
      err.statusCode = 404;
      throw err;
    }
    if (e && e.code === 'P2002') {
      const err = new Error('User already exists');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function deactivateUser(id) {
  try {
    await prisma.user.update({
      where: { id },
      data: { status: 'DISABLED' },
    });
    return { success: true };
  } catch (e) {
    if (e && e.code === 'P2025') {
      const err = new Error('Not found');
      err.statusCode = 404;
      throw err;
    }
    throw e;
  }
}

async function assignDoctorToPatient(userId, patientId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (!user.role || user.role.roleName !== 'Doctor') {
    const err = new Error('User is not a Doctor');
    err.statusCode = 400;
    throw err;
  }

  try {
    await prisma.patient.update({
      where: { id: patientId },
      data: { assignedDoctorId: userId },
    });
  } catch (e) {
    if (e && e.code === 'P2025') {
      const err = new Error('Patient not found');
      err.statusCode = 404;
      throw err;
    }
    throw e;
  }

  return { success: true };
}

async function unlockUser(userId, adminUserId, ipAddress) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });

  if (!user) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  if (user.status !== 'SUSPENDED') {
    const err = new Error('Account is not locked');
    err.statusCode = 400;
    throw err;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: 'ACTIVE' },
  });

  await prisma.auditLog.deleteMany({
    where: {
      userId,
      action: 'LOGIN_FAILED',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUserId ?? null,
      action: 'ACCOUNT_UNLOCKED',
      resourceId: userId,
      decision: 'ALLOW',
      trustScore: 100,
      ipAddress: ipAddress ?? null,
    },
  });

  return { success: true };
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deactivateUser,
  assignDoctorToPatient,
  unlockUser,
};
