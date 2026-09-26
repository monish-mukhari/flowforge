export type MetricRun = {
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
};

export function calculateRunMetrics(runs: MetricRun[]) {
  const terminal = runs.filter((run) =>
    ["SUCCEEDED", "FAILED", "DEAD_LETTER"].includes(run.status),
  );
  const successful = runs.filter((run) => run.status === "SUCCEEDED").length;
  const failed = runs.filter((run) =>
    ["FAILED", "DEAD_LETTER"].includes(run.status),
  ).length;
  const durations = runs
    .filter((run) => run.startedAt && run.completedAt)
    .map((run) => run.completedAt!.getTime() - run.startedAt!.getTime())
    .sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
  return {
    total: runs.length,
    successful,
    failed,
    active: runs.length - terminal.length,
    successRate: terminal.length
      ? Math.round((successful / terminal.length) * 1000) / 10
      : null,
    averageDurationMs: durations.length
      ? Math.round(
          durations.reduce((sum, value) => sum + value, 0) / durations.length,
        )
      : null,
    p95DurationMs: durations.length ? durations[p95Index] : null,
  };
}
