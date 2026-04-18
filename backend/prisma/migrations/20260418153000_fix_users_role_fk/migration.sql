-- Fix schema drift: some environments may have `users.role_name` instead of `users.role_id`.
-- Prisma expects `users.role_id` (FK to roles.id).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'role_name'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'role_id'
  )
  THEN
    ALTER TABLE "users" ADD COLUMN "role_id" UUID;

    -- Backfill from role_name text to roles.id (case-insensitive).
    UPDATE "users" u
    SET "role_id" = r."id"
    FROM "roles" r
    WHERE lower(u."role_name") = lower(r."role_name");

    -- If any rows couldn't be mapped, default them to Patient (best-effort).
    UPDATE "users"
    SET "role_id" = (SELECT "id" FROM "roles" WHERE lower("role_name") = 'patient' LIMIT 1)
    WHERE "role_id" IS NULL;

    ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

    -- Drop old column now that role_id exists.
    ALTER TABLE "users" DROP COLUMN "role_name";
  END IF;
END $$;

-- Ensure the FK exists (idempotent-ish).
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_id_fkey";
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

