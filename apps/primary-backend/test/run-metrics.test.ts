import { describe, expect, it } from "vitest";
import { calculateRunMetrics } from "../src/run-metrics";

describe("run metrics", () => {
  it("calculates terminal success, active work, and latency", () => {
    const start = new Date("2026-09-22T10:00:00.000Z");
    expect(
      calculateRunMetrics([
        {
          status: "SUCCEEDED",
          startedAt: start,
          completedAt: new Date(start.getTime() + 100),
        },
        {
          status: "SUCCEEDED",
          startedAt: start,
          completedAt: new Date(start.getTime() + 300),
        },
        {
          status: "DEAD_LETTER",
          startedAt: start,
          completedAt: new Date(start.getTime() + 200),
        },
        { status: "RUNNING", startedAt: start, completedAt: null },
      ]),
    ).toEqual({
      total: 4,
      successful: 2,
      failed: 1,
      active: 1,
      successRate: 66.7,
      averageDurationMs: 200,
      p95DurationMs: 300,
    });
  });

  it("returns null rates and latency when there are no completed runs", () => {
    expect(calculateRunMetrics([])).toEqual({
      total: 0,
      successful: 0,
      failed: 0,
      active: 0,
      successRate: null,
      averageDurationMs: null,
      p95DurationMs: null,
    });
  });
});
