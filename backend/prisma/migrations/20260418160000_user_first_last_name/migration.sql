-- Optional given names on users (admin create + self-register).
ALTER TABLE "users"
  ADD COLUMN "first_name" VARCHAR(100),
  ADD COLUMN "last_name" VARCHAR(100);

-- Keep browse view aligned with users table columns.
CREATE OR REPLACE VIEW "users_with_role_names" AS
SELECT
  u."id",
  u."username",
  u."email",
  u."first_name",
  u."last_name",
  u."password_hash",
  u."role_id",
  r."role_name",
  u."mfa_secret",
  u."mfa_enabled",
  u."created_at",
  u."status"
FROM "users" u
INNER JOIN "roles" r ON r."id" = u."role_id";
