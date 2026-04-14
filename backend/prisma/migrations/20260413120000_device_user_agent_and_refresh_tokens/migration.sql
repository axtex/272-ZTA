-- Clear devices so we can reshape columns (dev seed will repopulate).
DELETE FROM "devices";

DROP INDEX IF EXISTS "devices_device_fingerprint_key";

ALTER TABLE "devices" DROP COLUMN "device_fingerprint",
DROP COLUMN "is_trusted",
DROP COLUMN "last_ip_address",
DROP COLUMN "last_active";

ALTER TABLE "devices"
ADD COLUMN "user_agent" VARCHAR(1024) NOT NULL,
ADD COLUMN "ip" VARCHAR(100),
ADD COLUMN "timezone" VARCHAR(100),
ADD COLUMN "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "devices_user_id_user_agent_key" ON "devices"("user_id", "user_agent");

ALTER TABLE "devices" DROP CONSTRAINT "devices_user_id_fkey";

ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
