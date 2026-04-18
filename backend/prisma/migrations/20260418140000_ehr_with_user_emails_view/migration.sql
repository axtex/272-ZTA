-- Read-only view: EHR rows plus patient & doctor username/email for easier browsing.
CREATE OR REPLACE VIEW "ehr_with_user_emails" AS
SELECT
  e."id",
  e."patient_id",
  e."doctor_id",
  pu."username" AS "patient_username",
  pu."email"    AS "patient_email",
  du."username" AS "doctor_username",
  du."email"    AS "doctor_email",
  e."diagnosis",
  e."vitals",
  e."s3_file_key",
  e."updated_at"
FROM "ehr" e
INNER JOIN "patients" p ON p."id" = e."patient_id"
INNER JOIN "users" pu ON pu."id" = p."user_id"
INNER JOIN "users" du ON du."id" = e."doctor_id";

