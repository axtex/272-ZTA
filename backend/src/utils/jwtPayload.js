/**
 * Normalize access-token payloads from both issuers:
 * - /auth (auth.service): { userId, role } — role matches DB casing (e.g. Doctor)
 * - /api/auth (routes/auth.js): { sub, role } — role lowercased
 */
function tokenUserId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.userId ?? payload.sub ?? null;
}

function tokenRoleKey(payload) {
  const r = payload?.role ?? payload?.roleName;
  return typeof r === 'string' ? r.toLowerCase() : '';
}

module.exports = { tokenUserId, tokenRoleKey };
