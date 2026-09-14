"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "../../../components/DashboardShell";
import { AppIcon } from "../../../components/AppIcon";
import { api, getErrorMessage } from "../../../lib/api";
import type { WorkflowRun, Zap } from "../../../lib/types";
import { HOOKS_URL } from "../../config";

export default function ZapDetails() {
  const { zapId } = useParams<{ zapId: string }>();
  const [zap, setZap] = useState<Zap | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [versions, setVersions] = useState<
    { id: string; version: number; publishedAt: string }[]
  >([]);
  const [capture, setCapture] = useState<Record<string, unknown> | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runSummary, setRunSummary] = useState<Record<string, number>>({});
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState("");
  const router = useRouter();

  useEffect(() => {
    api
      .get(`/api/v1/zap/${zapId}`)
      .then((response) => {
        if (!response.data.zap) setError("Workflow not found.");
        else setZap(response.data.zap);
      })
      .catch((caught) => setError(getErrorMessage(caught)));
  }, [router, zapId]);

  useEffect(() => {
    if (!zap) return;
    setDraftName(zap.name);
    setDraftDescription(zap.description ?? "");
    api
      .get(`/api/v1/zap/${zapId}/versions`)
      .then((response) => setVersions(response.data.versions));
  }, [zap, zapId]);

  useEffect(() => {
    if (!zap) return;
    let active = true;
    const loadRuns = () => {
      const query = runFilter ? `?status=${runFilter}` : "";
      void api
        .get(`/api/v1/zap/${zapId}/runs${query}`)
        .then((response) => {
          if (!active) return;
          setRuns(response.data.runs);
          setRunSummary(response.data.summary);
        })
        .catch((caught) => active && setError(getErrorMessage(caught)));
    };
    loadRuns();
    const interval = window.setInterval(loadRuns, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [runFilter, zap, zapId]);

  const hookUrl = zap ? `${HOOKS_URL}/${zap.id}/${zap.webhookToken}` : "";
  const curl = `curl -X POST "${hookUrl}" -H "Content-Type: application/json" -d '{"customer":{"name":"Ada","email":"ada@example.com"},"payment":{"amount":"0.01"}}'`;
  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(""), 1600);
  }

  async function lifecycle(action: "publish" | "pause" | "resume" | "archive") {
    setBusyAction(action);
    setError("");
    try {
      const response = await api.post(`/api/v1/zap/${zapId}/${action}`);
      setZap(response.data.zap);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function duplicate() {
    setBusyAction("duplicate");
    try {
      const response = await api.post(`/api/v1/zap/${zapId}/duplicate`);
      router.push(`/zap/${response.data.zapId}`);
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusyAction("");
    }
  }

  async function saveDetails() {
    setBusyAction("save");
    try {
      const response = await api.patch(`/api/v1/zap/${zapId}`, {
        name: draftName,
        description: draftDescription || null,
      });
      setZap(response.data.zap);
      setEditing(false);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function moveAction(actionIndex: number, direction: -1 | 1) {
    if (!zap) return;
    const ordered = [...zap.actions].sort(
      (a, b) => a.sortingOrder - b.sortingOrder,
    );
    const target = actionIndex + direction;
    if (target < 0 || target >= ordered.length) return;
    const current = ordered[actionIndex]!;
    ordered[actionIndex] = ordered[target]!;
    ordered[target] = current;
    setBusyAction("order");
    try {
      const response = await api.put(`/api/v1/zap/${zapId}/actions/order`, {
        actionIds: ordered.map((action) => action.id),
      });
      setZap(response.data.zap);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function captureTestPayload() {
    if (!zap) return;
    setBusyAction("capture");
    try {
      const testUrl = `${HOOKS_URL.replace("/hooks/catch", "/hooks/test")}/${zap.id}/${zap.webhookToken}`;
      await fetch(testUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: "Ada", email: "ada@example.com" },
          payment: { amount: "0.01" },
        }),
      });
      const response = await api.get(
        `/api/v1/zap/${zapId}/test-captures/latest`,
      );
      setCapture(response.data.capture?.payload ?? null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function replayRun(runId: string) {
    setBusyAction(`replay:${runId}`);
    setError("");
    try {
      const response = await api.post(
        `/api/v1/zap/${zapId}/runs/${runId}/replay`,
      );
      setRuns((current) => [response.data.run, ...current]);
      setExpandedRun(response.data.run.id);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-5xl p-5 md:p-8 lg:p-10">
        <Link
          href="/dashboard"
          className="text-sm font-bold text-[#6d6660] hover:text-black"
        >
          ← All workflows
        </Link>
        {error && (
          <div className="mt-8 rounded-xl bg-red-50 p-5 text-red-700">
            {error}
          </div>
        )}
        {!zap && !error && (
          <div className="mt-8 h-72 animate-pulse rounded-2xl bg-white" />
        )}
        {zap && (
          <>
            <div className="mt-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-black tracking-[-0.045em]">
                    {editing ? (
                      <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        className="rounded-md border border-[#d8d1ca] px-2 py-1 text-3xl font-black"
                      />
                    ) : (
                      zap.name
                    )}
                  </h1>
                  <span className="rounded-full bg-[#eee9ff] px-3 py-1 text-xs font-bold text-[#503eb6]">
                    {zap.status}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-[#8d8580]">
                  {zap.id}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <button
                    onClick={saveDetails}
                    disabled={!!busyAction}
                    className="rounded-xl bg-[#503eb6] px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Save changes
                  </button>
                ) : (
                  zap.status !== "ARCHIVED" && (
                    <button
                      onClick={() => lifecycle("publish")}
                      disabled={!!busyAction}
                      className="rounded-xl bg-[#ff4f00] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busyAction === "publish"
                        ? "Publishing…"
                        : "Publish version"}
                    </button>
                  )
                )}
                {!editing && zap.status !== "ARCHIVED" && (
                  <button
                    onClick={() => router.push(`/zap/create?edit=${zap.id}`)}
                    className="rounded-xl border border-[#bdb5ae] bg-white px-4 py-2.5 text-sm font-bold"
                  >
                    Edit
                  </button>
                )}
                {zap.status === "PUBLISHED" && (
                  <button
                    onClick={() => lifecycle("pause")}
                    disabled={!!busyAction}
                    className="rounded-xl border border-[#bdb5ae] bg-white px-4 py-2.5 text-sm font-bold"
                  >
                    Pause
                  </button>
                )}
                {zap.status === "PAUSED" && (
                  <button
                    onClick={() => lifecycle("resume")}
                    disabled={!!busyAction}
                    className="rounded-xl border border-[#bdb5ae] bg-white px-4 py-2.5 text-sm font-bold"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={duplicate}
                  disabled={!!busyAction}
                  className="rounded-xl border border-[#bdb5ae] bg-white px-4 py-2.5 text-sm font-bold"
                >
                  Duplicate
                </button>
                {zap.status !== "ARCHIVED" && (
                  <button
                    onClick={() => lifecycle("archive")}
                    disabled={!!busyAction}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700"
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
            <section className="mt-8 rounded-2xl border border-[#e3ded8] bg-white p-5 sm:p-7">
              {editing && (
                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="Describe what this workflow does"
                  className="mb-5 w-full rounded-lg border border-[#d8d1ca] p-3 text-sm"
                  rows={2}
                />
              )}
              <div className="flex items-center gap-3">
                <AppIcon app={zap.trigger?.type} />
                <div>
                  <h2 className="font-bold">Webhook endpoint</h2>
                  <p className="text-xs text-[#7d756f]">
                    POST JSON here to start this workflow.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-[#f7f5f2] px-4 py-3 text-xs">
                  {hookUrl}
                </code>
                <button
                  onClick={() => copy(hookUrl, "url")}
                  className="rounded-xl bg-[#503eb6] px-5 py-3 text-sm font-bold text-white"
                >
                  {copied === "url" ? "Copied!" : "Copy URL"}
                </button>
              </div>
            </section>
            <div className="mt-8 grid gap-7 lg:grid-cols-[0.9fr_1.1fr]">
              <section>
                <h2 className="text-xl font-black">Workflow steps</h2>
                <div className="mt-4">
                  <ReadOnlyStep
                    number={1}
                    label="Trigger"
                    title={zap.trigger?.type.name || "Webhook"}
                    app={zap.trigger?.type}
                  />
                  {[...zap.actions]
                    .sort((a, b) => a.sortingOrder - b.sortingOrder)
                    .map((action, index) => (
                      <div key={action.id}>
                        <div className="ml-7 h-7 w-0.5 bg-[#bdb5ae]" />
                        <div className="flex items-stretch gap-2">
                          <div className="min-w-0 flex-1">
                            <ReadOnlyStep
                              number={index + 2}
                              label="Action"
                              title={action.type.name}
                              app={action.type}
                              detail={describeMetadata(action.metadata)}
                            />
                          </div>
                          {editing && (
                            <div className="flex flex-col justify-center gap-1">
                              <button
                                disabled={index === 0 || !!busyAction}
                                onClick={() => moveAction(index, -1)}
                                className="rounded border px-2 text-xs"
                              >
                                ↑
                              </button>
                              <button
                                disabled={
                                  index === zap.actions.length - 1 ||
                                  !!busyAction
                                }
                                onClick={() => moveAction(index, 1)}
                                className="rounded border px-2 text-xs"
                              >
                                ↓
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
              <section>
                <h2 className="text-xl font-black">Test the workflow</h2>
                <div className="mt-4 rounded-2xl bg-[#2d2525] p-5 text-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/50">
                      Terminal
                    </span>
                    <button
                      onClick={() => copy(curl, "curl")}
                      className="text-xs font-bold text-[#ff9b70]"
                    >
                      {copied === "curl" ? "Copied!" : "Copy command"}
                    </button>
                  </div>
                  <button
                    onClick={captureTestPayload}
                    disabled={!!busyAction}
                    className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20"
                  >
                    {busyAction === "capture"
                      ? "Capturing…"
                      : "Capture test payload"}
                  </button>
                  {capture && (
                    <div className="mt-3">
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {flattenFields(capture).map((path) => (
                          <button
                            key={path}
                            onClick={() => copy(`{${path}}`, "field")}
                            className="rounded bg-white/10 px-2 py-1 font-mono text-[11px] text-[#ffcfbd] hover:bg-white/20"
                          >
                            {copied === "field" ? "Copied" : `{${path}}`}
                          </button>
                        ))}
                      </div>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/10 p-3 font-mono text-xs text-white/80">
                        {JSON.stringify(capture, null, 2)}
                      </pre>
                    </div>
                  )}
                  <pre className="mt-5 whitespace-pre-wrap break-all font-mono text-xs leading-6 text-white/80">
                    {curl}
                  </pre>
                </div>
                <div className="mt-4 rounded-xl border border-[#e3ded8] bg-white p-4 text-sm leading-6 text-[#6d6660]">
                  <strong className="text-[#2d2525]">Template tip</strong>
                  <br />
                  Fields such as{" "}
                  <code className="rounded bg-[#f1eeea] px-1">
                    {"{customer.email}"}
                  </code>{" "}
                  are replaced using values from this webhook JSON.
                </div>
              </section>
            </div>
            <section className="mt-8 rounded-2xl border border-[#e3ded8] bg-white p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-black">Run history</h2>
                  <p className="mt-1 text-xs text-[#7d756f]">
                    Durable runs, step attempts, retries, and replay status
                    refresh every five seconds.
                  </p>
                </div>
                <select
                  value={runFilter}
                  onChange={(event) => setRunFilter(event.target.value)}
                  className="rounded-lg border border-[#d8d1ca] bg-white px-3 py-2 text-xs font-bold"
                  aria-label="Filter runs by status"
                >
                  <option value="">All runs</option>
                  {[
                    "QUEUED",
                    "RUNNING",
                    "SUCCEEDED",
                    "FAILED",
                    "DEAD_LETTER",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {status.replace("_", " ")} ({runSummary[status] ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              {runs.length === 0 ? (
                <div className="mt-5 rounded-xl bg-[#f7f5f2] p-5 text-sm text-[#6d6660]">
                  No workflow runs match this filter yet.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {runs.map((run) => (
                    <article
                      key={run.id}
                      className="overflow-hidden rounded-xl border border-[#e3ded8]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRun((current) =>
                            current === run.id ? null : run.id,
                          )
                        }
                        className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-[#faf8f5]"
                      >
                        <RunStatus status={run.status} />
                        <span className="font-mono text-xs text-[#6d6660]">
                          {run.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-[#7d756f]">
                          Version {run.workflowVersion?.version ?? "legacy"}
                        </span>
                        <span className="ml-auto text-xs text-[#7d756f]">
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                      </button>
                      {expandedRun === run.id && (
                        <div className="border-t border-[#e3ded8] bg-[#faf8f5] p-4">
                          {run.lastError && (
                            <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
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
                                  {step.sortingOrder + 1}. {step.actionType} —{" "}
                                  {step.status.replace("_", " ")} (
                                  {step.attemptCount}/{step.maxAttempts}{" "}
                                  attempts)
                                </summary>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <JsonPanel
                                    label="Resolved input template"
                                    value={step.input}
                                  />
                                  <JsonPanel
                                    label="Output"
                                    value={step.output}
                                  />
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
                                        <span>
                                          {attempt.status.replace("_", " ")}
                                        </span>
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
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-bold text-[#503eb6]">
                              View webhook payload
                            </summary>
                            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[#2d2525] p-3 font-mono text-xs text-white/80">
                              {JSON.stringify(run.metadata, null, 2)}
                            </pre>
                          </details>
                          {["FAILED", "DEAD_LETTER"].includes(run.status) && (
                            <button
                              type="button"
                              onClick={() => replayRun(run.id)}
                              disabled={busyAction === `replay:${run.id}`}
                              className="mt-4 rounded-lg bg-[#ff4f00] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              {busyAction === `replay:${run.id}`
                                ? "Replaying…"
                                : "Replay failed run"}
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            {versions.length > 0 && (
              <section className="mt-8 rounded-2xl border border-[#e3ded8] bg-white p-5 sm:p-7">
                <h2 className="text-xl font-black">Published versions</h2>
                <div className="mt-3 space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex justify-between rounded-lg bg-[#f7f5f2] px-3 py-2 text-sm"
                    >
                      <span>Version {version.version}</span>
                      <span className="text-[#7d756f]">
                        {new Date(version.publishedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </DashboardShell>
  );
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
      {status.replace("_", " ")}
    </span>
  );
}

function JsonPanel({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8d8580]">
        {label}
      </div>
      <pre className="max-h-44 overflow-auto rounded-lg bg-[#2d2525] p-3 font-mono text-[11px] text-white/80">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ReadOnlyStep({
  number,
  label,
  title,
  app,
  detail,
}: {
  number: number;
  label: string;
  title: string;
  app?: { id: string; name: string } | null;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#d8d1ca] bg-white p-4">
      <AppIcon app={app} />
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8d8580]">
          {number}. {label}
        </div>
        <div className="font-bold">{title}</div>
        {detail && (
          <div className="mt-0.5 truncate text-xs text-[#7d756f]">{detail}</div>
        )}
      </div>
      <span className="ml-auto text-[#168047]">✓</span>
    </div>
  );
}
function describeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function flattenFields(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenFields(child, prefix ? `${prefix}.${key}` : key),
  );
}
