-- Read-only view: refresh tokens plus user username/email (for easier browsing).
CREATE OR REPLACE VIEW "refresh_tokens_with_user_details" AS
SELECT
  rt."id",
  rt."token",
  rt."user_id",
  u."username",
  u."email",
  rt."expires_at"
FROM "refresh_tokens" rt
INNER JOIN "users" u ON u."id" = rt."user_id";

