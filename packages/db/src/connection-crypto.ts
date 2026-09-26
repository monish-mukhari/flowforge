import crypto from "node:crypto";

function keyMaterial() {
  const secret =
    process.env.CONNECTION_ENCRYPTION_KEY ??
    "local-connection-encryption-key-change-me";
  if (secret.length < 32)
    throw new Error(
      "CONNECTION_ENCRYPTION_KEY must contain at least 32 characters",
    );
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptConnectionCredentials(value: Record<string, unknown>) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptConnectionCredentials(payload: string) {
  const [version, iv, tag, ciphertext] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Invalid encrypted connection credentials");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    keyMaterial(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const cleartext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(cleartext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Connection credentials must be an object");
  return parsed as Record<string, unknown>;
}
