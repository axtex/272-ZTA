-- Read-only view: same rows as users, plus role_name for tools like Prisma Studio.
CREATE OR REPLACE VIEW "users_with_role_names" AS
SELECT
  u."id",
  u."username",
  u."email",
  u."password_hash",
  u."role_id",
  r."role_name",
  u."mfa_secret",
  u."mfa_enabled",
  u."created_at",
  u."status"
FROM "users" u
INNER JOIN "roles" r ON r."id" = u."role_id";
