import { describe, expect, it } from "vitest";
import { parse } from "./parser";

describe("template parser", () => {
  it("resolves multiple nested scalar values", () =>
    expect(
      parse("Hi {customer.name}: {payment.amount}", {
        customer: { name: "Ada" },
        payment: { amount: 12 },
      }),
    ).toBe("Hi Ada: 12"));
  it("rejects missing and non-scalar values", () => {
    expect(() => parse("{customer.missing}", { customer: {} })).toThrow(
      "Template value not found",
    );
    expect(() => parse("{customer}", { customer: { name: "Ada" } })).toThrow(
      "must be scalar",
    );
  });
  it("leaves ordinary braces untouched", () =>
    expect(parse("JSON: {}", {})).toBe("JSON: {}"));
});
