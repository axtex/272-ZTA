const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');

function stripPassword(user) {
  if (!user) return user;
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

function trimOptionalName(value) {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length ? t : undefined;
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
    include: {
      role: true,
      patientProfile: {
        select: {
          id: true,
          medicalRecordNumber: true,
          assignedDoctorId: true,
          assignedDoctor: { select: { id: true, email: true, firstName: true, lastName: true, department: true } },
        },
      },
      devices: {
        select: { lastSeen: true },
        orderBy: { lastSeen: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return users.map((u) => {
    const { devices, patientProfile, ...rest } = u;
    const base = stripPassword(rest);
    return {
      ...base,
      lastLoginAt: devices?.[0]?.lastSeen ?? null,
      patient:
        patientProfile != null
          ? {
              id: patientProfile.id,
              medicalRecordNumber: patientProfile.medicalRecordNumber,
              assignedDoctorId: patientProfile.assignedDoctorId,
              assignedDoctor: patientProfile.assignedDoctor
                ? {
                    id: patientProfile.assignedDoctor.id,
                    email: patientProfile.assignedDoctor.email,
                    firstName: patientProfile.assignedDoctor.firstName,
                    lastName: patientProfile.assignedDoctor.lastName,
                    department: patientProfile.assignedDoctor.department,
                  }
                : null,
            }
          : null,
    };
  });
}

async function getUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  return stripPassword(user);
}

async function createUser({ username, email, password, roleName, firstName, lastName, department }) {
  const role = await findRoleByName(roleName);
  if (!role) {
    const err = new Error('Invalid role');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const fn = trimOptionalName(firstName);
  const ln = trimOptionalName(lastName);
  const dept = trimOptionalName(department);
  try {
    const created = await prisma.user.create({
      data: {
        username,
        email,
        firstName: fn,
        lastName: ln,
        department: dept ?? null,
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

async function updateUser(id, { username, email, roleName, status, firstName, lastName, department }) {
  const data = {};
  if (username !== undefined) data.username = username;
  if (email !== undefined) data.email = email;

  if (firstName !== undefined) {
    data.firstName = trimOptionalName(firstName) ?? null;
  }
  if (lastName !== undefined) {
    data.lastName = trimOptionalName(lastName) ?? null;
  }
  if (department !== undefined) {
    data.department = trimOptionalName(department) ?? null;
  }

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

async function unassignDoctorFromPatient(patientId) {
  try {
    await prisma.patient.update({
      where: { id: patientId },
      data: { assignedDoctorId: null },
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

/** Aggregates for admin dashboard stat cards (accurate counts, not limited to list payloads). */
async function getAdminDashboardSummary() {
  const now = new Date();
  const activeWindowStart = new Date(now.getTime() - 20 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalUsers,
    lockedAccounts,
    activeDistinct,
    deniedRequestsToday,
    breakGlassEventsToday,
    auditEventsToday,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.device.findMany({
      where: { lastSeen: { gte: activeWindowStart } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.auditLog.count({
      where: {
        decision: 'DENY',
        timestamp: { gte: startOfToday },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: 'BREAK_GLASS',
        timestamp: { gte: startOfToday },
      },
    }),
    prisma.auditLog.count({
      where: {
        timestamp: { gte: startOfToday },
      },
    }),
  ]);

  return {
    totalUsers,
    lockedAccounts,
    activeSessionsApprox: activeDistinct.length,
    deniedRequestsToday,
    breakGlassEventsToday,
    auditEventsToday,
  };
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deactivateUser,
  assignDoctorToPatient,
  unassignDoctorFromPatient,
  unlockUser,
  getAdminDashboardSummary,
};
