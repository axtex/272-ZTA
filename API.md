# API endpoints

Base URL (local): `http://localhost:4000` (or set `PORT` in `.env`).

API routes use the `/api` prefix with **no version segment** (e.g. `/api/users`, not `/api/v1/users`).

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness / basic status |

---

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | No | Credentials → access token (optional refresh token) |
| `POST` | `/api/auth/logout` | Yes | Invalidate session / refresh token (if implemented) |
| `GET` | `/api/auth/me` | Yes | Current user from JWT |

---

## Users

Maps to `users` (`User`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users` | Yes (privileged) | List users |
| `GET` | `/api/users/:id` | Yes | Get user by id |
| `POST` | `/api/users` | Yes (admin) | Create user |
| `PATCH` | `/api/users/:id` | Yes | Update user (e.g. status, MFA) |

---

## Roles and permissions (RBAC)

Maps to `roles`, `permissions`, `role_permissions` (`Role`, `Permission`, `RolePermission`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/roles` | Yes | List roles |
| `GET` | `/api/roles/:id` | Yes | Get role |
| `GET` | `/api/permissions` | Yes | List permissions |
| `GET` | `/api/roles/:id/permissions` | Yes | Permissions for a role |
| `PUT` | `/api/roles/:id/permissions` | Yes (admin) | Replace role permission set |

Optional later: `POST`/`PATCH`/`DELETE` on `/api/permissions` if admins manage the permission catalog in the DB (not required for read-only seeded permissions).

---

## Patients

Maps to `patients` (`Patient`). Links to `users` via `user_id` and optional `assigned_doctor_id` → `users`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/patients` | Yes | List patients (scope by role) |
| `GET` | `/api/patients/:id` | Yes | Get patient |
| `PATCH` | `/api/patients/:id` | Yes | Update patient (e.g. assigned doctor) |

---

## Devices

Maps to `devices` (`Device`); `user_id` → `users`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/:userId/devices` | Yes | List devices for user |
| `POST` | `/api/devices` | Yes | Register or upsert device fingerprint |
| `PATCH` | `/api/devices/:id` | Yes | Update device (e.g. trusted flag) |

---

## EHR (electronic health records)

Maps to `ehr` (`EHR`); `patient_id` → `patients`, `doctor_id` → `users`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/patients/:patientId/ehr` | Yes | List EHR records for patient |
| `GET` | `/api/ehr/:id` | Yes | Get one EHR record |
| `POST` | `/api/ehr` | Yes | Create EHR record |
| `PATCH` | `/api/ehr/:id` | Yes | Update EHR (diagnosis, vitals, file key) |

---

## Audit logs

Maps to `audit_logs` (`AuditLog`); optional `user_id` → `users`. Uses enum `DecisionType` in the DB.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/audit-logs` | Yes (auditor/admin) | Query logs (filters: user, action, date range, etc.) |

---

## Alignment with the database

Yes. Each resource section above corresponds to a Prisma model in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma):

| API area | DB tables |
|----------|-----------|
| Users | `users` |
| Roles / permissions | `roles`, `permissions`, `role_permissions` |
| Patients | `patients` |
| Devices | `devices` |
| EHR | `ehr` |
| Audit logs | `audit_logs` |

**Auth** routes are not tables: they use `users` (login, `me`) plus app-issued JWTs. **Enums** in API payloads should match `UserStatus` and `DecisionType` where applicable.

---

## Security notes

- Use **Bearer JWT** on protected routes once authentication is implemented.
- Request/response bodies and status codes can be frozen in OpenAPI when you add a formal spec.

---

## Implementation status

Only `GET /health` is implemented in the backend today. Other routes match the intended contract for the current schema.
