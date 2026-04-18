-- Read-only view: patient rows plus login username/email from users (for DBeaver / Studio).
CREATE OR REPLACE VIEW "patients_with_user_details" AS
SELECT
  p."id",
  p."user_id",
  u."username",
  u."email",
  p."medical_record_number",
  p."assigned_doctor_id",
  p."created_at"
FROM "patients" p
INNER JOIN "users" u ON u."id" = p."user_id";
