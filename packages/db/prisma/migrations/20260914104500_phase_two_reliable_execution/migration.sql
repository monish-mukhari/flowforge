CREATE TYPE "ZapRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "RunStepStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY_SCHEDULED', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "RunAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

ALTER TABLE "ZapRun"
  ADD COLUMN "status" "ZapRunStatus" NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "replay_of_id" TEXT,
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ZapRunOutbox"
  ADD COLUMN "stage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ZapRunStep" (
  "id" TEXT NOT NULL,
  "zap_run_id" TEXT NOT NULL,
  "sorting_order" INTEGER NOT NULL,
  "action_type" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "status" "RunStepStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_owner" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "idempotency_key" TEXT NOT NULL,
  "last_error" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZapRunStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZapRunAttempt" (
  "id" TEXT NOT NULL,
  "zap_run_step_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "RunAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "worker_id" TEXT NOT NULL,
  "error_code" TEXT,
  "error_message" TEXT,
  "output" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "ZapRunAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZapRunStep_idempotency_key_key" ON "ZapRunStep"("idempotency_key");
CREATE UNIQUE INDEX "ZapRunStep_zap_run_id_sorting_order_key" ON "ZapRunStep"("zap_run_id", "sorting_order");
CREATE INDEX "ZapRunStep_status_next_attempt_at_idx" ON "ZapRunStep"("status", "next_attempt_at");
CREATE INDEX "ZapRunStep_status_lease_expires_at_idx" ON "ZapRunStep"("status", "lease_expires_at");
CREATE UNIQUE INDEX "ZapRunAttempt_zap_run_step_id_attempt_number_key" ON "ZapRunAttempt"("zap_run_step_id", "attempt_number");
CREATE INDEX "ZapRunAttempt_status_started_at_idx" ON "ZapRunAttempt"("status", "started_at");
CREATE INDEX "ZapRun_zap_id_status_created_at_idx" ON "ZapRun"("zap_id", "status", "created_at");
CREATE INDEX "ZapRun_replay_of_id_idx" ON "ZapRun"("replay_of_id");
CREATE INDEX "ZapRunOutbox_available_at_created_at_idx" ON "ZapRunOutbox"("available_at", "created_at");
DROP INDEX IF EXISTS "ZapRunOutbox_created_at_idx";

ALTER TABLE "ZapRun" ADD CONSTRAINT "ZapRun_replay_of_id_fkey" FOREIGN KEY ("replay_of_id") REFERENCES "ZapRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ZapRunStep" ADD CONSTRAINT "ZapRunStep_zap_run_id_fkey" FOREIGN KEY ("zap_run_id") REFERENCES "ZapRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZapRunAttempt" ADD CONSTRAINT "ZapRunAttempt_zap_run_step_id_fkey" FOREIGN KEY ("zap_run_step_id") REFERENCES "ZapRunStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "ZapRun"
SET "status" = 'SUCCEEDED', "started_at" = "created_at", "completed_at" = "created_at"
WHERE "definition_snapshot" IS NOT NULL;
