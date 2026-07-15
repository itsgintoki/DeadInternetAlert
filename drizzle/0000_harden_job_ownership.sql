CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE "watchlist_type" AS ENUM ('url', 'repo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "checkjobs_status" AS ENUM ('WAITING', 'ACTIVE', 'DELAYED', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "first_name" varchar(255) NOT NULL,
  "last_name" varchar(255),
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" varchar(50) NOT NULL DEFAULT 'user',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "watch_list_table" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "watchlist_type" NOT NULL,
  "target" text NOT NULL,
  "last_status" text,
  "status_changed_at" timestamp,
  "last_digest_sent_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "checkjobs_table" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "watchlist_id" uuid NOT NULL REFERENCES "watch_list_table"("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "status" "checkjobs_status" NOT NULL DEFAULT 'WAITING',
  "result" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "notifications_table" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "watchlist_id" uuid NOT NULL REFERENCES "watch_list_table"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "refresh_token_table" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "watch_list_table" ADD COLUMN IF NOT EXISTS "last_digest_sent_at" timestamp;
ALTER TABLE "checkjobs_table" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "checkjobs_table" ADD COLUMN IF NOT EXISTS "watchlist_id" uuid;

UPDATE "checkjobs_table"
SET "watchlist_id" = ("payload" ->> 'watchlistId')::uuid
WHERE "watchlist_id" IS NULL
  AND "payload" ? 'watchlistId'
  AND ("payload" ->> 'watchlistId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE "checkjobs_table" AS job
SET "user_id" = watchlist."user_id"
FROM "watch_list_table" AS watchlist
WHERE job."user_id" IS NULL AND job."watchlist_id" = watchlist."id";

ALTER TABLE "checkjobs_table" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "checkjobs_table" ALTER COLUMN "watchlist_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "checkjobs_table" ADD CONSTRAINT "checkjobs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "checkjobs_table" ADD CONSTRAINT "checkjobs_watchlist_id_watch_list_id_fk"
    FOREIGN KEY ("watchlist_id") REFERENCES "watch_list_table"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "watch_list_user_id_idx" ON "watch_list_table" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "watch_list_user_type_target_unique" ON "watch_list_table" ("user_id", "type", "target");
CREATE INDEX IF NOT EXISTS "check_jobs_user_id_idx" ON "checkjobs_table" ("user_id");
CREATE INDEX IF NOT EXISTS "check_jobs_status_idx" ON "checkjobs_table" ("status");
CREATE INDEX IF NOT EXISTS "check_jobs_watchlist_id_idx" ON "checkjobs_table" ("watchlist_id");
CREATE INDEX IF NOT EXISTS "refresh_token_user_id_idx" ON "refresh_token_table" ("user_id");
CREATE INDEX IF NOT EXISTS "refresh_token_expires_at_idx" ON "refresh_token_table" ("expires_at");
CREATE INDEX IF NOT EXISTS "notifications_user_created_at_idx" ON "notifications_table" ("user_id", "created_at");
