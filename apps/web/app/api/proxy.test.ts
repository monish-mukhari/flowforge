import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./[...path]/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("same-origin API proxy", () => {
  it("resolves the backend at request time and preserves session cookies", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://primary-backend:3002");
    const upstreamHeaders = new Headers({ "content-type": "application/json" });
    upstreamHeaders.append(
      "set-cookie",
      "flowforge_access=access-token; Path=/; HttpOnly; SameSite=Lax",
    );
    upstreamHeaders.append(
      "set-cookie",
      "flowforge_refresh=refresh-token; Path=/api/v1/user; HttpOnly; SameSite=Strict",
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 1 } }), {
        status: 200,
        headers: upstreamHeaders,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://127.0.0.1:3000/api/v1/user/signin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          expect: "100-continue",
        },
        body: JSON.stringify({ username: "user@example.com", password: "x" }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://primary-backend:3002/api/v1/user/signin",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    const forwardedHeaders = fetchMock.mock.calls[0]![1].headers as Headers;
    expect(forwardedHeaders.has("expect")).toBe(false);
    const cookies = (
      response.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie?.();
    expect(cookies).toEqual([
      expect.stringContaining("flowforge_access=access-token"),
      expect.stringContaining("flowforge_refresh=refresh-token"),
    ]);
  });

  it("returns a stable 502 instead of proxying to localhost when production is misconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BACKEND_INTERNAL_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("https://app.example.com/api/v1/zap"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BACKEND_UNAVAILABLE" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a bodyless refresh response without turning it into a 502", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://primary-backend:3002");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          "set-cookie":
            "flowforge_refresh=rotated-token; Path=/api/v1/user; HttpOnly; SameSite=Strict",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://127.0.0.1:3000/api/v1/user/refresh", {
        method: "POST",
        headers: { cookie: "flowforge_refresh=old-token" },
      }),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("set-cookie")).toContain(
      "flowforge_refresh=rotated-token",
    );
  });
});
