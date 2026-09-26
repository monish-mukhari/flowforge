import { describe, expect, it } from "vitest";
import {
  decryptConnectionCredentials,
  encryptConnectionCredentials,
} from "@repo/db/connection-crypto";

describe("connection credential encryption", () => {
  it("round-trips credentials without storing cleartext", () => {
    process.env.CONNECTION_ENCRYPTION_KEY =
      "test-connection-encryption-key-32-characters";
    const encrypted = encryptConnectionCredentials({
      token: "secret-token",
      nested: { value: 1 },
    });
    expect(encrypted).not.toContain("secret-token");
    expect(decryptConnectionCredentials(encrypted)).toEqual({
      token: "secret-token",
      nested: { value: 1 },
    });
  });

  it("rejects authenticated ciphertext tampering", () => {
    process.env.CONNECTION_ENCRYPTION_KEY =
      "test-connection-encryption-key-32-characters";
    const encrypted = encryptConnectionCredentials({ password: "secret" });
    expect(() =>
      decryptConnectionCredentials(`${encrypted.slice(0, -1)}x`),
    ).toThrow();
  });
});
