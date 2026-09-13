import { describe, expect, it } from "vitest";
import { SignupSchema, ZapCreateSchema } from "../src/types";

describe("HTTP boundary validation", () => {
  it("normalizes account email and rejects weak passwords", () => {
    expect(
      SignupSchema.parse({
        name: "Ada",
        username: " ADA@EXAMPLE.COM ",
        password: "long-password",
      }).username,
    ).toBe("ada@example.com");
    expect(
      SignupSchema.safeParse({
        name: "Ada",
        username: "ada@example.com",
        password: "short",
      }).success,
    ).toBe(false);
  });
  it("requires a bounded action list and object metadata", () => {
    expect(
      ZapCreateSchema.safeParse({ availableTriggerId: "webhook", actions: [] })
        .success,
    ).toBe(false);
    expect(
      ZapCreateSchema.safeParse({
        availableTriggerId: "webhook",
        actions: [
          {
            availableActionId: "email",
            actionMetadata: { email: "{user.email}" },
          },
        ],
      }).success,
    ).toBe(true);
  });
});
