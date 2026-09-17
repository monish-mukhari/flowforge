"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/DashboardShell";
import { api, getErrorMessage } from "../../lib/api";
import type { WorkflowRun } from "../../lib/types";

const statuses = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "DEAD_LETTER",
] as const;

export default function RunHistoryPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [busyRun, setBusyRun] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadRuns = () => {
      const query = filter ? `?status=${filter}` : "";
      void api
        .get(`/api/v1/zap/runs${query}`)
        .then((response) => {
          if (!active) return;
          setRuns(response.data.runs);
          setSummary(response.data.summary);
          setError("");
        })
        .catch((caught) => active && setError(getErrorMessage(caught)));
    };
    loadRuns();
    const interval = window.setInterval(loadRuns, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [filter]);

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

  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
              Operations
            </p>
            <h1 className="mt-1 text-4xl font-black tracking-[-0.045em]">
              Run history
            </h1>
            <p className="mt-2 text-[#6d6660]">
              Monitor every workflow execution, retry, and replay in one place.
            </p>
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-lg border border-[#d8d1ca] bg-white px-3 py-2 text-xs font-bold"
            aria-label="Filter runs by status"
          >
            <option value="">All runs ({totalRuns(summary)})</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)} ({summary[status] ?? 0})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {runs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[#e3ded8] bg-white p-12 text-center">
            <div className="text-4xl">◷</div>
            <h2 className="mt-4 text-xl font-black">No runs yet</h2>
            <p className="mt-2 text-sm text-[#6d6660]">
              Trigger a published workflow to see its execution here.
            </p>
            <Link
              href="/dashboard"
              className="mt-5 inline-block rounded-lg bg-[#ff4f00] px-4 py-2 text-sm font-bold text-white"
            >
              View workflows
            </Link>
          </div>
        ) : (
          <section className="mt-8 space-y-3">
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
                  <span className="font-bold">{run.zap?.name ?? "Workflow"}</span>
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
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </button>
                {expandedRun === run.id && (
                  <div className="border-t border-[#e3ded8] bg-[#faf8f5] p-5">
                    {run.lastError && (
                      <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                        {run.lastError}
                      </div>
                    )}
                    <div className="space-y-2">
                      {run.steps.map((step) => (
                        <details
                          key={step.id}
                          className="rounded-lg border border-[#e3ded8] bg-white p-3"
                        >
                          <summary className="cursor-pointer text-sm font-bold">
                            {step.sortingOrder + 1}. {step.actionType} — {formatStatus(step.status)} ({step.attemptCount}/{step.maxAttempts} attempts)
                          </summary>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <JsonPanel label="Input template" value={step.input} />
                            <JsonPanel label="Output" value={step.output} />
                          </div>
                          {step.attempts.length > 0 && (
                            <div className="mt-3 space-y-1 text-xs text-[#6d6660]">
                              {step.attempts.map((attempt) => (
                                <div key={attempt.id} className="flex flex-wrap gap-2">
                                  <strong>Attempt {attempt.attemptNumber}</strong>
                                  <span>{formatStatus(attempt.status)}</span>
                                  {attempt.errorMessage && (
                                    <span className="text-red-700">{attempt.errorMessage}</span>
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
                    {["FAILED", "DEAD_LETTER"].includes(run.status) && run.zap && (
                      <button
                        type="button"
                        onClick={() => replayRun(run)}
                        disabled={busyRun === run.id}
                        className="ml-4 rounded-lg bg-[#ff4f00] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {busyRun === run.id ? "Replaying…" : "Replay run"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </main>
    </DashboardShell>
  );
}

function totalRuns(summary: Record<string, number>) {
  return Object.values(summary).reduce((total, value) => total + value, 0);
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
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
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${styles[status]}`}>
      {formatStatus(status)}
    </span>
  );
}

function JsonPanel({ label, value }: { label: string; value: unknown }) {
  const signature =
    value && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as { signature?: unknown }).signature === "string"
      ? (value as { signature: string }).signature
      : null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8d8580]">
        {label}
      </div>
      <pre className="max-h-44 overflow-auto rounded-lg bg-[#2d2525] p-3 font-mono text-[11px] text-white/80">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
      {signature && (
        <a href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-[#503eb6] hover:underline">
          View transfer on Solana Explorer ↗
        </a>
      )}
    </div>
  );
}
