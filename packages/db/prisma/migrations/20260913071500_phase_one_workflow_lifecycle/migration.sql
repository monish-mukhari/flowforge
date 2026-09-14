CREATE TYPE "ZapStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

ALTER TABLE "Action" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "Zap"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "description" TEXT,
  ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Untitled workflow',
  ADD COLUMN "paused_at" TIMESTAMP(3),
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "published_version" INTEGER,
  ADD COLUMN "require_signature" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status" "ZapStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "webhook_secret" TEXT;

UPDATE "Zap"
SET
  "status" = 'PUBLISHED',
  "published_version" = 1,
  "published_at" = "updated_at",
  "webhook_secret" = gen_random_uuid()::text;

ALTER TABLE "Zap"
  ALTER COLUMN "webhook_secret" SET NOT NULL,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "ZapRun"
  ADD COLUMN "definition_snapshot" JSONB,
  ADD COLUMN "workflow_version_id" TEXT;

CREATE TABLE "WorkflowVersion" (
  "id" TEXT NOT NULL,
  "zap_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestTriggerCapture" (
  "id" TEXT NOT NULL,
  "zap_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestTriggerCapture_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WorkflowVersion" ("id", "zap_id", "version", "definition", "published_at")
SELECT
  gen_random_uuid()::text,
  z."id",
  1,
  jsonb_build_object(
    'name', z."name",
    'description', z."description",
    'trigger', jsonb_build_object('availableTriggerId', t."trigger_id"),
    'actions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'availableActionId', a."action_id",
            'actionMetadata', a."metadata",
            'sortingOrder', a."sorting_order"
          )
          ORDER BY a."sorting_order"
        )
        FROM "Action" a
        WHERE a."zap_id" = z."id"
      ),
      '[]'::jsonb
    )
  ),
  COALESCE(z."published_at", CURRENT_TIMESTAMP)
FROM "Zap" z
LEFT JOIN "Trigger" t ON t."zap_id" = z."id";

UPDATE "ZapRun" run
SET
  "workflow_version_id" = version."id",
  "definition_snapshot" = version."definition"
FROM "WorkflowVersion" version
WHERE version."zap_id" = run."zap_id" AND version."version" = 1;

CREATE INDEX "WorkflowVersion_zap_id_published_at_idx" ON "WorkflowVersion"("zap_id", "published_at");
CREATE UNIQUE INDEX "WorkflowVersion_zap_id_version_key" ON "WorkflowVersion"("zap_id", "version");
CREATE INDEX "TestTriggerCapture_zap_id_created_at_idx" ON "TestTriggerCapture"("zap_id", "created_at");
CREATE INDEX "TestTriggerCapture_expires_at_idx" ON "TestTriggerCapture"("expires_at");
CREATE INDEX "Zap_user_id_status_updated_at_idx" ON "Zap"("user_id", "status", "updated_at");
CREATE INDEX "ZapRun_workflow_version_id_idx" ON "ZapRun"("workflow_version_id");

ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_zap_id_fkey"
  FOREIGN KEY ("zap_id") REFERENCES "Zap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestTriggerCapture" ADD CONSTRAINT "TestTriggerCapture_zap_id_fkey"
  FOREIGN KEY ("zap_id") REFERENCES "Zap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZapRun" ADD CONSTRAINT "ZapRun_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
