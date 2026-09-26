CREATE TABLE "RunNotification" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "zap_id" TEXT NOT NULL,
  "zap_run_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RunNotification_zap_run_id_key" ON "RunNotification"("zap_run_id");
CREATE INDEX "RunNotification_user_id_read_at_created_at_idx" ON "RunNotification"("user_id", "read_at", "created_at");
CREATE INDEX "RunNotification_zap_id_created_at_idx" ON "RunNotification"("zap_id", "created_at");

ALTER TABLE "RunNotification" ADD CONSTRAINT "RunNotification_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunNotification" ADD CONSTRAINT "RunNotification_zap_id_fkey"
  FOREIGN KEY ("zap_id") REFERENCES "Zap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunNotification" ADD CONSTRAINT "RunNotification_zap_run_id_fkey"
  FOREIGN KEY ("zap_run_id") REFERENCES "ZapRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "RunNotification" ("id", "user_id", "zap_id", "zap_run_id", "title", "message", "created_at")
SELECT run."id", zap."user_id", run."zap_id", run."id",
  'Workflow failed: ' || zap."name",
  'Run ' || LEFT(run."id", 8) || ' moved to dead letter and can be replayed.',
  COALESCE(run."completed_at", run."created_at")
FROM "ZapRun" run
JOIN "Zap" zap ON zap."id" = run."zap_id"
WHERE run."status" = 'DEAD_LETTER';
