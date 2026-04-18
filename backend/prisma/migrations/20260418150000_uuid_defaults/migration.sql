-- Ensure UUID defaults exist for direct SQL inserts.
-- Prisma Client can generate UUIDs itself, but adding DB defaults makes
-- manual inserts (e.g. via Supabase SQL editor) work without specifying `id`.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE IF EXISTS "roles"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "users"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "permissions"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "role_permissions"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "patients"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "devices"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "ehr"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "audit_logs"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE IF EXISTS "refresh_tokens"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

