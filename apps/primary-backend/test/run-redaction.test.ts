import { describe, expect, it } from "vitest";
import { redactRun, redactRunData } from "../src/run-redaction";

describe("run response redaction", () => {
  it("redacts sensitive keys recursively without mutating the source", () => {
    const source = {
      customer: { email: "ada@example.com", password: "hidden" },
      authorization: "Bearer abc",
      nested: [{ api_key: "key", clientSecret: "secret", amount: 2 }],
    };
    expect(redactRunData(source)).toEqual({
      customer: { email: "ada@example.com", password: "[REDACTED]" },
      authorization: "[REDACTED]",
      nested: [
        { api_key: "[REDACTED]", clientSecret: "[REDACTED]", amount: 2 },
      ],
    });
    expect(source.customer.password).toBe("hidden");
  });

  it("sanitizes run payloads, step data, and attempt outputs", () => {
    const run = {
      metadata: { token: "one" },
      definitionSnapshot: { webhook_secret: "two" },
      steps: [
        {
          input: { password: "three" },
          output: { ok: true },
          attempts: [{ output: { privateKey: "four" } }],
        },
      ],
    };
    expect(redactRun(run)).toEqual({
      metadata: { token: "[REDACTED]" },
      definitionSnapshot: { webhook_secret: "[REDACTED]" },
      steps: [
        {
          input: { password: "[REDACTED]" },
          output: { ok: true },
          attempts: [{ output: { privateKey: "[REDACTED]" } }],
        },
      ],
    });
  });
});
