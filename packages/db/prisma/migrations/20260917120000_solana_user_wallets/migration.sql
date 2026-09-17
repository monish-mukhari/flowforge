CREATE TABLE "SolanaWallet" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "public_key" TEXT NOT NULL,
  "encrypted_secret_key" TEXT NOT NULL,
  "network" TEXT NOT NULL DEFAULT 'devnet',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolanaWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SolanaWallet_user_id_key" ON "SolanaWallet"("user_id");
CREATE UNIQUE INDEX "SolanaWallet_public_key_key" ON "SolanaWallet"("public_key");
ALTER TABLE "SolanaWallet" ADD CONSTRAINT "SolanaWallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
