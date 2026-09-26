CREATE TABLE "ConnectorDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "image" TEXT NOT NULL,
  "auth_type" TEXT NOT NULL,
  "action_schema" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectorDefinition_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ZapRunStep" ADD COLUMN "connector_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "AppConnection" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "connector_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encrypted_credentials" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "external_account_id" TEXT,
  "external_account_name" TEXT,
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "expires_at" TIMESTAMP(3),
  "last_tested_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthState" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "connector_key" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "code_verifier" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectorDefinition_key_version_key" ON "ConnectorDefinition"("key", "version");
CREATE INDEX "ConnectorDefinition_key_active_idx" ON "ConnectorDefinition"("key", "active");
CREATE INDEX "AppConnection_user_id_connector_key_status_idx" ON "AppConnection"("user_id", "connector_key", "status");
CREATE UNIQUE INDEX "OAuthState_token_hash_key" ON "OAuthState"("token_hash");
CREATE INDEX "OAuthState_user_id_connector_key_idx" ON "OAuthState"("user_id", "connector_key");
CREATE INDEX "OAuthState_expires_at_idx" ON "OAuthState"("expires_at");

ALTER TABLE "AppConnection" ADD CONSTRAINT "AppConnection_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
