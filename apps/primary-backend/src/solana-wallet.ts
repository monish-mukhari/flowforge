import crypto from "node:crypto";
import { Keypair } from "@solana/web3.js";

function encryptionKey() {
  return crypto
    .createHash("sha256")
    .update(process.env.SOLANA_WALLET_ENCRYPTION_KEY ?? "local-devnet-wallet-encryption-key-change-me")
    .digest();
}

export function createEncryptedWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    encryptedSecretKey: encryptSecretKey(Buffer.from(keypair.secretKey).toString("base64")),
  };
}

export function encryptSecretKey(secretKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secretKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecretKey(payload: string) {
  const [version, ivText, tagText, ciphertextText] = payload.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText)
    throw new Error("Invalid encrypted Solana wallet key");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
