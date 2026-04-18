const userService = require('./user.service');
const { tokenUserId } = require('../../utils/jwtPayload');

function pick(body, keys) {
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) out[k] = body[k];
  }
  return out;
}

function handleError(res, err) {
  const status = err.statusCode || 500;
  if (status === 404) return res.status(404).json({ error: 'Not found' });
  if (status === 409) return res.status(409).json({ error: 'User already exists' });
  if (status === 400) return res.status(400).json({ error: err.message || 'Bad request' });
  return res.status(500).json({ error: 'Internal server error' });
}

async function listUsers(req, res) {
  try {
    const roleName = typeof req.query.role === 'string' ? req.query.role : undefined;
    const users = await userService.listUsers({ roleName });
    return res.status(200).json({ users });
  } catch (err) {
    return handleError(res, err);
  }
}

async function adminDashboardSummary(req, res) {
  try {
    const summary = await userService.getAdminDashboardSummary();
    return res.status(200).json(summary);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getUser(req, res) {
  try {
    const user = await userService.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ user });
  } catch (err) {
    return handleError(res, err);
  }
}

async function createUser(req, res) {
  try {
    const { username, email, password, roleName, firstName, lastName, department } = req.body || {};
    if (!username || !email || !password || !roleName) {
      return res.status(400).json({ error: 'username, email, password, and roleName are required' });
    }
    const created = await userService.createUser({
      username,
      email,
      password,
      roleName,
      firstName,
      lastName,
      department,
    });
    return res.status(201).json({ user: created });
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateUser(req, res) {
  try {
    const updates = pick(req.body || {}, [
      'username',
      'email',
      'roleName',
      'status',
      'firstName',
      'lastName',
      'department',
    ]);
    const user = await userService.updateUser(req.params.id, updates);
    return res.status(200).json({ user });
  } catch (err) {
    return handleError(res, err);
  }
}

async function deleteUser(req, res) {
  try {
    const result = await userService.deactivateUser(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function assignDoctor(req, res) {
  try {
    const { patientId } = req.body || {};
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const result = await userService.assignDoctorToPatient(req.params.id, patientId);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function unassignDoctorFromPatient(req, res) {
  try {
    const { patientId } = req.body || {};
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const result = await userService.unassignDoctorFromPatient(patientId);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function unlockUser(req, res) {
  try {
    const adminUserId = tokenUserId(req.user);
    const result = await userService.unlockUser(req.params.id, adminUserId, req.ip || null);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  listUsers,
  adminDashboardSummary,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  assignDoctor,
  unassignDoctorFromPatient,
  unlockUser,
};

