ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "department" VARCHAR(120);

DROP VIEW IF EXISTS "users_with_role_names";

CREATE VIEW "users_with_role_names" AS
SELECT
  u."id",
  u."username",
  u."email",
  u."first_name",
  u."last_name",
  u."department",
  u."password_hash",
  u."role_id",
  r."role_name",
  u."mfa_secret",
  u."mfa_enabled",
  u."created_at",
  u."status"
FROM "users" u
INNER JOIN "roles" r ON r."id" = u."role_id";
