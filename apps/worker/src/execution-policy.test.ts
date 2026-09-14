import { describe, expect, it } from "vitest";
import {
  executionErrorMessage,
  retryDelayMs,
  shouldRetry,
} from "./execution-policy";

describe("reliable execution policy", () => {
  it("uses bounded exponential retry backoff", () => {
    expect(retryDelayMs(1, 1000)).toBe(1000);
    expect(retryDelayMs(2, 1000)).toBe(2000);
    expect(retryDelayMs(20, 1000)).toBe(60 * 60_000);
  });

  it("stops retrying when the attempt budget is exhausted", () => {
    expect(shouldRetry(2, 3)).toBe(true);
    expect(shouldRetry(3, 3)).toBe(false);
  });

  it("bounds and flattens persisted error messages", () => {
    expect(executionErrorMessage(new Error("bad\nsecret\tvalue"))).toBe(
      "bad secret value",
    );
    expect(executionErrorMessage(new Error("x".repeat(800)))).toHaveLength(500);
  });
});
