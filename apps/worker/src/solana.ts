import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  Connection,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import crypto from "node:crypto";

function decryptSecretKey(payload: string) {
  const [version, ivText, tagText, ciphertextText] = payload.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText)
    throw new Error("Invalid encrypted Solana wallet key");
  const key = crypto
    .createHash("sha256")
    .update(process.env.SOLANA_WALLET_ENCRYPTION_KEY ?? "local-devnet-wallet-encryption-key-change-me")
    .digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function sendSol(to: string, amount: string, encryptedSecretKey: string) {
  if (!process.env.SOLANA_RPC_URL)
    throw new Error("Solana RPC is not configured");
  if (!process.env.SOLANA_RPC_URL.includes("devnet"))
    throw new Error("Only Solana devnet transfers are enabled");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0)
    throw new Error("Solana amount must be a positive number");
  const connection = new Connection(process.env.SOLANA_RPC_URL, "finalized");
  const keypair = Keypair.fromSecretKey(
    Buffer.from(decryptSecretKey(encryptedSecretKey), "base64"),
  );
  const transferTransaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(to),
      lamports: Math.round(numericAmount * LAMPORTS_PER_SOL),
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, transferTransaction, [keypair]);
  return {
    signature,
    sender: keypair.publicKey.toBase58(),
    network: process.env.SOLANA_RPC_URL.includes("devnet") ? "devnet" : "custom",
  };
}
