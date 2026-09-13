-- Existing values in User.password are intentionally retained. The application
-- recognizes legacy plaintext values and replaces them with Argon2id after a
-- successful login, providing a no-lockout migration path.
ALTER TABLE "User"
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Zap"
  ADD COLUMN "webhook_token" TEXT,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Zap" SET "webhook_token" = gen_random_uuid()::text WHERE "webhook_token" IS NULL;
ALTER TABLE "Zap" ALTER COLUMN "webhook_token" SET NOT NULL;

ALTER TABLE "Action"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ZapRun"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ZapRunOutbox"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Zap_webhook_token_key" ON "Zap"("webhook_token");
CREATE INDEX "Zap_user_id_idx" ON "Zap"("user_id");
CREATE INDEX "Action_zap_id_sorting_order_idx" ON "Action"("zap_id", "sorting_order");
CREATE UNIQUE INDEX "ZapRun_zap_id_idempotency_key_key" ON "ZapRun"("zap_id", "idempotency_key");
CREATE INDEX "ZapRun_zap_id_created_at_idx" ON "ZapRun"("zap_id", "created_at");
CREATE INDEX "ZapRunOutbox_created_at_idx" ON "ZapRunOutbox"("created_at");
CREATE UNIQUE INDEX "AuthSession_refresh_token_hash_key" ON "AuthSession"("refresh_token_hash");
CREATE INDEX "AuthSession_user_id_idx" ON "AuthSession"("user_id");
CREATE INDEX "AuthSession_expires_at_idx" ON "AuthSession"("expires_at");
CREATE UNIQUE INDEX "EmailVerificationToken_token_hash_key" ON "EmailVerificationToken"("token_hash");
CREATE INDEX "EmailVerificationToken_user_id_idx" ON "EmailVerificationToken"("user_id");
CREATE INDEX "EmailVerificationToken_expires_at_idx" ON "EmailVerificationToken"("expires_at");
CREATE UNIQUE INDEX "PasswordResetToken_token_hash_key" ON "PasswordResetToken"("token_hash");
CREATE INDEX "PasswordResetToken_user_id_idx" ON "PasswordResetToken"("user_id");
CREATE INDEX "PasswordResetToken_expires_at_idx" ON "PasswordResetToken"("expires_at");

ALTER TABLE "Zap" DROP CONSTRAINT "Zap_user_id_fkey";
ALTER TABLE "Trigger" DROP CONSTRAINT "Trigger_zap_id_fkey";
ALTER TABLE "Action" DROP CONSTRAINT "Action_zap_id_fkey";
ALTER TABLE "ZapRun" DROP CONSTRAINT "ZapRun_zap_id_fkey";
ALTER TABLE "ZapRunOutbox" DROP CONSTRAINT "ZapRunOutbox_zap_run_id_fkey";
ALTER TABLE "Zap" ADD CONSTRAINT "Zap_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_zap_id_fkey" FOREIGN KEY ("zap_id") REFERENCES "Zap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Action" ADD CONSTRAINT "Action_zap_id_fkey" FOREIGN KEY ("zap_id") REFERENCES "Zap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZapRun" ADD CONSTRAINT "ZapRun_zap_id_fkey" FOREIGN KEY ("zap_id") REFERENCES "Zap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZapRunOutbox" ADD CONSTRAINT "ZapRunOutbox_zap_run_id_fkey" FOREIGN KEY ("zap_run_id") REFERENCES "ZapRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
