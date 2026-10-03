"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/DashboardShell";
import { api, getErrorMessage } from "../../lib/api";
import type { RunMetrics, RunNotification, WorkflowRun } from "../../lib/types";

const statuses = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "DEAD_LETTER",
] as const;
const emptyMetrics: RunMetrics = {
  total: 0,
  successful: 0,
  failed: 0,
  active: 0,
  successRate: null,
  averageDurationMs: null,
  p95DurationMs: null,
  retryingSteps: 0,
  unreadNotifications: 0,
};

export default function RunHistoryPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<RunMetrics>(emptyMetrics);
  const [notifications, setNotifications] = useState<RunNotification[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [busyRun, setBusyRun] = useState<string | null>(null);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      sort,
    });
    if (filter) params.set("status", filter);
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    return params.toString();
  }, [filter, from, page, search, sort, to]);

  useEffect(() => {
    let active = true;
    const loadOperations = () => {
      void Promise.all([
        api.get(`/api/v1/zap/runs?${query}`),
        api.get(`/api/v1/zap/runs/metrics?${query}`),
        api.get("/api/v1/zap/notifications?pageSize=5"),
      ])
        .then(([runsResponse, metricsResponse, notificationResponse]) => {
          if (!active) return;
          setRuns(runsResponse.data.runs);
          setSummary(runsResponse.data.summary);
          setTotalPages(Math.max(1, runsResponse.data.pagination.totalPages));
          setMetrics(metricsResponse.data.metrics);
          setNotifications(notificationResponse.data.notifications);
          setError("");
        })
        .catch((caught) => active && setError(getErrorMessage(caught)));
    };
    loadOperations();
    const interval = window.setInterval(loadOperations, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [query]);

  function resetPage() {
    setPage(1);
  }

  async function replayRun(run: WorkflowRun) {
    if (!run.zap) return;
    setBusyRun(run.id);
    setError("");
    try {
      const response = await api.post(
        `/api/v1/zap/${run.zap.id}/runs/${run.id}/replay`,
      );
      setRuns((current) => [
        { ...response.data.run, zap: run.zap },
        ...current,
      ]);
      setExpandedRun(response.data.run.id);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusyRun(null);
    }
  }

  async function markAllRead() {
    try {
      await api.post("/api/v1/zap/notifications/read-all");
      const now = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt ?? now })),
      );
      setMetrics((current) => ({ ...current, unreadNotifications: 0 }));
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 md:px-8 md:py-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7c3aed]">
              Operations
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
              Run history
            </h1>
            <p className="mt-2 text-[#6d6660]">
              Monitor performance, inspect safe execution data, and recover
              failed workflows.
            </p>
          </div>
          <div className="rounded-xl border border-[#d8d1ca] bg-[#fff8ef] px-4 py-3 text-xs text-[#6d4b2d]">
            Sensitive keys in payloads and action data are automatically
            redacted.
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Success rate"
            value={
              metrics.successRate == null ? "--" : `${metrics.successRate}%`
            }
            detail={`${metrics.successful} succeeded`}
          />
          <Metric
            label="Failed runs"
            value={String(metrics.failed)}
            detail={`${metrics.unreadNotifications} unread alerts`}
            tone={metrics.failed ? "danger" : "default"}
          />
          <Metric
            label="Average duration"
            value={formatDuration(metrics.averageDurationMs)}
            detail={`p95 ${formatDuration(metrics.p95DurationMs)}`}
          />
          <Metric
            label="In progress"
            value={String(metrics.active)}
            detail={`${metrics.retryingSteps} steps retrying`}
          />
        </section>

        <section className="mt-6 rounded-2xl border border-[#e3ded8] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-black">Failure notifications</h2>
              <p className="text-xs text-[#7d756f]">
                Created when a run exhausts its retries.
              </p>
            </div>
            {metrics.unreadNotifications > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="mt-4 text-sm text-[#7d756f]">
              No failure notifications.
            </p>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={`/zap/${notification.zap.id}`}
                  className={`rounded-xl border p-3 ${notification.readAt ? "border-[#e3ded8] bg-[#faf8f5]" : "border-red-200 bg-red-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">{notification.title}</strong>
                    {!notification.readAt && (
                      <span
                        className="h-2 w-2 rounded-full bg-red-500"
                        aria-label="Unread"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#6d6660]">
                    {notification.message}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-3 rounded-2xl border border-[#e3ded8] bg-white p-4 md:grid-cols-5">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            placeholder="Search workflow name"
            aria-label="Search runs"
            className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-sm"
          />
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              resetPage();
            }}
            className="rounded-lg border border-[#d8d1ca] bg-white px-3 py-2 text-sm font-bold"
            aria-label="Filter runs by status"
          >
            <option value="">All statuses ({totalRuns(summary)})</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)} ({summary[status] ?? 0})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              resetPage();
            }}
            aria-label="Runs from date"
            className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              resetPage();
            }}
            aria-label="Runs to date"
            className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-sm"
          />
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as "newest" | "oldest");
              resetPage();
            }}
            aria-label="Sort runs"
            className="rounded-lg border border-[#d8d1ca] bg-white px-3 py-2 text-sm font-bold"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </section>

        {runs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[#e3ded8] bg-white p-12 text-center">
            <h2 className="text-xl font-black">No matching runs</h2>
            <p className="mt-2 text-sm text-[#6d6660]">
              Adjust the filters or trigger a published workflow.
            </p>
          </div>
        ) : (
          <section className="mt-6 space-y-3">
            {runs.map((run) => (
              <article
                key={run.id}
                className="overflow-hidden rounded-2xl border border-[#e3ded8] bg-white"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedRun((current) =>
                      current === run.id ? null : run.id,
                    )
                  }
                  className="flex w-full flex-wrap items-center gap-3 p-5 text-left hover:bg-[#faf8f5]"
                >
                  <RunStatus status={run.status} />
                  <span className="font-bold">
                    {run.zap?.name ?? "Workflow"}
                  </span>
                  <span className="font-mono text-xs text-[#6d6660]">
                    {run.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-[#7d756f]">
                    Version {run.workflowVersion?.version ?? "legacy"}
                  </span>
                  {run.replayOfId && (
                    <span className="rounded-full bg-[#eee9ff] px-2 py-1 text-[10px] font-bold text-[#503eb6]">
                      Replay
                    </span>
                  )}
                  <span className="ml-auto text-xs text-[#7d756f]">
                    {new Date(run.createdAt).toLocaleString()} ·{" "}
                    {formatRunDuration(run)}
                  </span>
                </button>
                {expandedRun === run.id && (
                  <div className="border-t border-[#e3ded8] bg-[#faf8f5] p-5">
                    {run.lastError && (
                      <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                        {run.lastError}
                      </div>
                    )}
                    <JsonPanel label="Trigger payload" value={run.metadata} />
                    <div className="mt-4 space-y-2">
                      {run.steps.map((step) => (
                        <details
                          key={step.id}
                          className="rounded-lg border border-[#e3ded8] bg-white p-3"
                        >
                          <summary className="cursor-pointer text-sm font-bold">
                            {step.sortingOrder + 1}. {step.actionType} -{" "}
                            {formatStatus(step.status)} ({step.attemptCount}/
                            {step.maxAttempts} attempts)
                          </summary>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <JsonPanel
                              label="Input template"
                              value={step.input}
                            />
                            <JsonPanel label="Output" value={step.output} />
                          </div>
                          {step.attempts.length > 0 && (
                            <div className="mt-3 space-y-1 text-xs text-[#6d6660]">
                              {step.attempts.map((attempt) => (
                                <div
                                  key={attempt.id}
                                  className="flex flex-wrap gap-2"
                                >
                                  <strong>
                                    Attempt {attempt.attemptNumber}
                                  </strong>
                                  <span>{formatStatus(attempt.status)}</span>
                                  {attempt.errorMessage && (
                                    <span className="text-red-700">
                                      {attempt.errorMessage}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </details>
                      ))}
                    </div>
                    {run.zap && (
                      <Link
                        href={`/zap/${run.zap.id}`}
                        className="mt-4 inline-block text-xs font-bold text-[#503eb6] hover:underline"
                      >
                        Open workflow
                      </Link>
                    )}
                    {["FAILED", "DEAD_LETTER"].includes(run.status) &&
                      run.zap && (
                        <button
                          type="button"
                          onClick={() => replayRun(run)}
                          disabled={busyRun === run.id}
                          className="ml-4 rounded-lg bg-[#ff4f00] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {busyRun === run.id
                            ? "Replaying..."
                            : "Replay from saved snapshot"}
                        </button>
                      )}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-[#6d6660]">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </main>
    </DashboardShell>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${tone === "danger" ? "border-red-200 bg-red-50" : "border-[#e3ded8] bg-white"}`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-[#7d756f]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs text-[#7d756f]">{detail}</p>
    </div>
  );
}
function totalRuns(summary: Record<string, number>) {
  return Object.values(summary).reduce((total, value) => total + value, 0);
}
function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}
function formatDuration(value: number | null) {
  if (value == null) return "--";
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}
function formatRunDuration(run: WorkflowRun) {
  if (!run.startedAt) return "not started";
  return run.completedAt
    ? formatDuration(
        new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
      )
    : "running";
}
function RunStatus({ status }: { status: WorkflowRun["status"] }) {
  const styles: Record<WorkflowRun["status"], string> = {
    QUEUED: "bg-amber-100 text-amber-800",
    RUNNING: "bg-blue-100 text-blue-800",
    SUCCEEDED: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-red-100 text-red-800",
    DEAD_LETTER: "bg-rose-950 text-white",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-black ${styles[status]}`}
    >
      {formatStatus(status)}
    </span>
  );
}
function JsonPanel({ label, value }: { label: string; value: unknown }) {
  const signature =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { signature?: unknown }).signature === "string"
      ? (value as { signature: string }).signature
      : null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8d8580]">
        {label}
      </div>
      <pre className="max-h-44 overflow-auto rounded-lg bg-[#2d2525] p-3 font-mono text-[11px] text-white/80">
        {value == null ? "--" : JSON.stringify(value, null, 2)}
      </pre>
      {signature && (
        <a
          href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs font-bold text-[#503eb6] hover:underline"
        >
          View transfer on Solana Explorer
        </a>
      )}
    </div>
  );
}
