import api from './axios';

/**
 * Convert a browser `File` to a base64 string (no data-url prefix).
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

// -------------------------
// EHR API (mounted at /api/v2)
// -------------------------

/**
 * GET /api/v2/ehr/:ehrId
 * @param {string} ehrId
 * @returns {Promise<any>} record
 */
export async function getEhrRecord(ehrId) {
  const response = await api.get(`/api/v2/ehr/${ehrId}`);
  return response.data.record;
}

/**
 * PATCH /api/v2/ehr/:ehrId
 * @param {string} ehrId
 * @param {any} data
 * @returns {Promise<any>} updated record
 */
export async function updateEhrRecord(ehrId, data) {
  const response = await api.patch(`/api/v2/ehr/${ehrId}`, data);
  return response.data.record;
}

/**
 * GET /api/v2/patients/:patientId/ehr
 * @param {string} patientId
 * @returns {Promise<any[]>} records
 */
export async function getPatientEhr(patientId) {
  const response = await api.get(`/api/v2/patients/${patientId}/ehr`);
  return response.data.records;
}

/**
 * POST /api/v2/ehr
 * @param {any} data
 * @returns {Promise<any>} created record
 */
export async function createEhrRecord(data) {
  const response = await api.post('/api/v2/ehr', data);
  return response.data.record;
}

/**
 * POST /api/v2/patients/:patientId/break-glass
 * @param {string} patientId
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function breakGlassAccess(patientId) {
  const response = await api.post(`/api/v2/patients/${patientId}/break-glass`);
  return response.data;
}

/**
 * POST /api/v2/ehr/:ehrId/files
 * Backend currently expects JSON: { filename, mimetype, contentBase64 }.
 * @param {string} ehrId
 * @param {File} file
 * @returns {Promise<{s3Key: string, filename: string}>}
 */
export async function uploadEhrFile(ehrId, file) {
  const contentBase64 = await fileToBase64(file);
  const payload = {
    filename: file?.name ?? 'upload',
    mimetype: file?.type || 'application/octet-stream',
    contentBase64,
  };

  const response = await api.post(`/api/v2/ehr/${ehrId}/files`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  return { s3Key: response.data.s3Key, filename: payload.filename };
}

/**
 * GET /api/v2/ehr/:ehrId/files/url
 * @param {string} ehrId
 * @returns {Promise<{url: string}>}
 */
export async function getEhrFileUrl(ehrId) {
  const response = await api.get(`/api/v2/ehr/${ehrId}/files/url`);
  return response.data;
}

// -------------------------
// User API (mounted at /users) - admin only
// -------------------------

/**
 * GET /users?role=:roleFilter
 * @param {string | undefined} roleFilter
 * @returns {Promise<any[]>} users
 */
export async function getUsers(roleFilter) {
  const response = await api.get('/users', {
    params: roleFilter ? { role: roleFilter } : undefined,
  });
  return response.data.users;
}

/**
 * GET /users/summary (admin) — dashboard stat card aggregates.
 * @returns {Promise<{
 *   totalUsers: number,
 *   lockedAccounts: number,
 *   activeSessionsApprox: number,
 *   deniedRequestsToday: number,
 *   breakGlassEventsToday: number,
 *   auditEventsToday: number
 * }>}
 */
export async function getAdminDashboardSummary() {
  const response = await api.get('/users/summary');
  return response.data;
}

/**
 * POST /users
 * @param {any} data
 * @returns {Promise<any>} created user
 */
export async function createUser(data) {
  const response = await api.post('/users', data);
  return response.data.user;
}

/**
 * PATCH /users/:userId
 * @param {string} userId
 * @param {any} data
 * @returns {Promise<any>} updated user
 */
export async function updateUser(userId, data) {
  const response = await api.patch(`/users/${userId}`, data);
  return response.data.user;
}

/**
 * DELETE /users/:userId
 * @param {string} userId
 * @returns {Promise<{success: boolean}>}
 */
export async function deactivateUser(userId) {
  const response = await api.delete(`/users/${userId}`);
  return response.data;
}

/**
 * POST /users/:userId/assign
 * @param {string} userId
 * @param {string} patientId
 * @returns {Promise<{success: boolean}>}
 */
export async function assignDoctor(userId, patientId) {
  const response = await api.post(`/users/${userId}/assign`, { patientId });
  return response.data;
}

/**
 * POST /users/assignments/unassign (admin)
 * @param {string} patientId Patient profile id (Patient.id)
 * @returns {Promise<{success: boolean}>}
 */
export async function unassignDoctor(patientId) {
  const response = await api.post('/users/assignments/unassign', { patientId });
  return response.data;
}

/**
 * POST /users/:userId/unlock
 * @param {string} userId
 * @returns {Promise<{success: boolean}>}
 */
export async function unlockUser(userId) {
  const response = await api.post(`/users/${userId}/unlock`);
  return response.data;
}

// -------------------------
// Audit API
// -------------------------

/**
 * GET /audit/logs
 * @param {{ decision?: string; action?: string; range?: string; take?: number; skip?: number }} [params]
 * @returns {Promise<{ logs: any[]; total: number; take: number; skip: number }>}
 */
export async function getAuditLogs(params = {}) {
  const response = await api.get('/audit/logs', { params });
  const body = response.data ?? {};
  const logs = Array.isArray(body.logs) ? body.logs : [];
  const total = typeof body.total === 'number' ? body.total : logs.length;
  const take = typeof body.take === 'number' ? body.take : logs.length;
  const skip = typeof body.skip === 'number' ? body.skip : 0;
  return { logs, total, take, skip };
}

