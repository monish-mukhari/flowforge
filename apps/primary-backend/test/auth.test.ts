import { describe, expect, it } from "vitest";
import { hashOpaqueToken, hashPassword, verifyPassword } from "../src/auth";

describe("authentication primitives", () => {
  it("hashes passwords with Argon2id and verifies them", async () => {
    const digest = await hashPassword("a-secure-password");
    expect(digest).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(digest, "a-secure-password")).resolves.toBe(
      true,
    );
    await expect(verifyPassword(digest, "wrong-password")).resolves.toBe(false);
  });
  it("supports legacy plaintext only for migration", async () => {
    await expect(
      verifyPassword("legacy-password", "legacy-password"),
    ).resolves.toBe(true);
    await expect(verifyPassword("legacy-password", "different")).resolves.toBe(
      false,
    );
  });
  it("hashes opaque tokens deterministically without retaining them", () => {
    expect(hashOpaqueToken("secret-token")).toHaveLength(64);
    expect(hashOpaqueToken("secret-token")).not.toContain("secret-token");
  });
});
