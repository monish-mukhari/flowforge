import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/index";

describe("primary API security contract", () => {
  it("returns health with security and correlation headers", async () => {
    const response = await request(app)
      .get("/health")
      .set("x-request-id", "test-request");
    expect(response.status).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-request-id"]).toBe("test-request");
  });
  it("returns a stable validation error", async () => {
    const response = await request(app)
      .post("/api/v1/user/signup")
      .send({ username: "not-an-email" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.requestId).toBeTruthy();
  });
  it("rejects protected routes without a session", async () => {
    const response = await request(app).get("/api/v1/zap");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
