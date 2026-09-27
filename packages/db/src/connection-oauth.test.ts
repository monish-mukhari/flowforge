import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptConnectionCredentials } from "./connection-crypto";
import { isRevokedOAuthError, revokeProviderAccess } from "./connection-oauth";

describe("OAuth connection lifecycle", () => {
  beforeEach(() => {
    process.env.CONNECTION_ENCRYPTION_KEY =
      "test-connection-encryption-key-32-characters";
  });

  it("recognizes provider responses that require reconnection", () => {
    expect(isRevokedOAuthError("slack", 200, { error: "token_revoked" })).toBe(
      true,
    );
    expect(
      isRevokedOAuthError("google-sheets", 400, { error: "invalid_grant" }),
    ).toBe(true);
    expect(isRevokedOAuthError("slack", 429, { error: "ratelimited" })).toBe(
      false,
    );
  });

  it("revokes Slack with the access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const credentials = encryptConnectionCredentials({
      accessToken: "xoxb-access",
      refreshToken: "xoxe-refresh",
    });

    await revokeProviderAccess("slack", credentials, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://slack.com/api/auth.revoke",
      expect.objectContaining({
        headers: { authorization: "Bearer xoxb-access" },
      }),
    );
  });

  it("revokes Google with the refresh token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null));
    const credentials = encryptConnectionCredentials({
      accessToken: "google-access",
      refreshToken: "google-refresh",
    });

    await revokeProviderAccess("google-sheets", credentials, fetchImpl);

    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(request.body)).toContain("token=google-refresh");
  });
});
