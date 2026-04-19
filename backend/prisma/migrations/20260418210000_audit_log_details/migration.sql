-- Optional JSON context for audit rows (e.g. break-glass reason).
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "details" JSONB;

CREATE OR REPLACE VIEW "audit_logs_with_user_details" AS
SELECT
  al."id",
  al."timestamp",
  al."user_id",
  u."username",
  u."email",
  al."action",
  al."resource_id",
  al."decision",
  al."trust_score",
  al."ip_address",
  al."details"
FROM "audit_logs" al
LEFT JOIN "users" u ON u."id" = al."user_id";
