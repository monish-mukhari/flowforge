"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "../../components/DashboardShell";
import { AppIcon } from "../../components/AppIcon";
import { api, getErrorMessage } from "../../lib/api";
import type { Zap } from "../../lib/types";
import { HOOKS_URL } from "../config";

type StatusFilter = "ALL" | Zap["status"];

export default function Dashboard() {
  const [zaps, setZaps] = useState<Zap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Zap | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const router = useRouter();

  useEffect(() => {
    api
      .get("/api/v1/zap")
      .then((response) => setZaps(response.data.zaps))
      .catch((caught) => {
        if (caught.response?.status === 401) router.replace("/login");
        else setError(getErrorMessage(caught));
      })
      .finally(() => setLoading(false));
  }, [router]);

  const summary = useMemo(
    () => ({
      total: zaps.length,
      published: zaps.filter((zap) => zap.status === "PUBLISHED").length,
      drafts: zaps.filter((zap) => zap.status === "DRAFT").length,
      actions: zaps.reduce((count, zap) => count + zap.actions.length, 0),
    }),
    [zaps],
  );

  const visibleZaps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return zaps.filter((zap) => {
      const matchesStatus =
        statusFilter === "ALL" || zap.status === statusFilter;
      const searchable =
        `${zap.name} ${zap.description ?? ""} ${zap.trigger?.type.name ?? ""}`.toLowerCase();
      return (
        matchesStatus &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [query, statusFilter, zaps]);

  async function copyHook(zap: Zap) {
    try {
      await navigator.clipboard.writeText(webhookUrl(zap));
      setCopied(zap.id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Could not copy the webhook URL. Please copy it manually.");
    }
  }

  async function deleteWorkflow(zap: Zap) {
    setDeletingId(zap.id);
    setError("");
    try {
      await api.delete(`/api/v1/zap/${zap.id}`);
      setZaps((current) => current.filter((item) => item.id !== zap.id));
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 md:px-8 md:py-9">
        <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7c3aed]">
              Workspace overview
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
              Your workflows
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#6d6660] sm:text-base">
              Create automations, check what is live, and jump back into any
              workflow.
            </p>
          </div>
          <Link
            href="/zap/create"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ff4f00] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#d94100]"
          >
            <span className="text-lg leading-none">+</span>
            Create workflow
          </Link>
        </header>

        {error && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="font-black"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <section
          className="mt-7 grid gap-px overflow-hidden rounded-2xl border border-[#e3ded8] bg-[#e3ded8] sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Workflow summary"
        >
          {loading ? (
            [1, 2, 3, 4].map((item) => (
              <div key={item} className="h-20 animate-pulse bg-white" />
            ))
          ) : (
            <>
              <StatCard
                value={summary.total}
                label="Total workflows"
                icon="workflow"
              />
              <StatCard
                value={summary.published}
                label="Published"
                icon="published"
                accent
              />
              <StatCard value={summary.drafts} label="Drafts" icon="draft" />
              <StatCard
                value={summary.actions}
                label="Configured actions"
                icon="action"
              />
            </>
          )}
        </section>

        <div className="mt-6">
          <section className="overflow-hidden rounded-2xl border border-[#e3ded8] bg-white">
            <div className="border-b border-[#e3ded8] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-black">All workflows</h2>
                  <p className="mt-1 text-xs text-[#7d756f]">
                    {loading
                      ? "Loading your workspace…"
                      : `${visibleZaps.length} of ${zaps.length} shown`}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative block">
                    <span className="sr-only">Search workflows</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d8580]"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="m16 16 4 4" strokeLinecap="round" />
                    </svg>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search workflows"
                      className="h-10 w-full rounded-lg border border-[#d8d1ca] bg-[#faf9f7] pl-9 pr-3 text-sm outline-none transition placeholder:text-[#9a928c] focus:border-[#7c3aed] focus:bg-white sm:w-56"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filter by status</span>
                    <select
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as StatusFilter)
                      }
                      className="h-10 w-full rounded-lg border border-[#d8d1ca] bg-[#faf9f7] px-3 text-sm font-semibold outline-none focus:border-[#7c3aed] sm:w-36"
                    >
                      <option value="ALL">All statuses</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="DRAFT">Draft</option>
                      <option value="PAUSED">Paused</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            {loading && <WorkflowSkeleton />}
            {!loading && zaps.length === 0 && <EmptyState />}

            {!loading && zaps.length > 0 && visibleZaps.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#f1eeea] text-xl">
                  ⌕
                </div>
                <h3 className="mt-4 font-black">No matching workflows</h3>
                <p className="mt-2 text-sm text-[#6d6660]">
                  Try another search or status filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("ALL");
                  }}
                  className="mt-5 text-sm font-bold text-[#7c3aed] hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}

            {!loading && visibleZaps.length > 0 && (
              <div className="grid gap-4 bg-[#faf9f7] p-4 sm:p-5 lg:grid-cols-2">
                {visibleZaps.map((zap) => (
                  <WorkflowCard
                    key={zap.id}
                    zap={zap}
                    copied={copied === zap.id}
                    deleting={deletingId === zap.id}
                    onCopy={() => void copyHook(zap)}
                    onDelete={() => setPendingDelete(zap)}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="hidden">
            <section className="rounded-2xl border border-[#e3ded8] bg-white p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#7c3aed]">
                Quick actions
              </p>
              <div className="mt-4 space-y-2">
                <QuickLink
                  href="/templates"
                  icon="template"
                  title="Start from a template"
                  copy="Use a ready-made workflow"
                />
                <QuickLink
                  href="/connections"
                  icon="connection"
                  title="Connect an app"
                  copy="Add OAuth or SMTP access"
                />
                <QuickLink
                  href="/runs"
                  icon="run"
                  title="View run history"
                  copy="Inspect attempts and errors"
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#dcd2f7] bg-gradient-to-br from-[#f5efff] to-[#fff7fb] p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#7c3aed] shadow-sm">
                <DashboardIcon name="spark" />
              </div>
              <h2 className="mt-4 text-lg font-black">Build your next flow</h2>
              <p className="mt-2 text-sm leading-6 text-[#6d6660]">
                Combine webhooks, schedules, or polling with integrations and
                logic blocks.
              </p>
              <Link
                href="/zap/create"
                className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#6d28d9] hover:underline"
              >
                Open the builder <span aria-hidden="true">→</span>
              </Link>
            </section>
          </aside>
        </div>
      </main>

      {pendingDelete && (
        <DeleteDialog
          zap={pendingDelete}
          deleting={deletingId !== null}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void deleteWorkflow(pendingDelete)}
        />
      )}
    </DashboardShell>
  );
}

function WorkflowCard({
  zap,
  copied,
  deleting,
  onCopy,
  onDelete,
}: {
  zap: Zap;
  copied: boolean;
  deleting: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const isWebhook = zap.trigger?.type.id === "webhook";
  const canDelete = zap.accessRole === "OWNER" || zap.accessRole === "ADMIN";

  return (
    <article className="group flex min-h-64 flex-col rounded-2xl border border-[#e3ded8] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#cfc5da] hover:shadow-[0_12px_30px_rgba(52,40,33,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/zap/${zap.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <AppIcon app={zap.trigger?.type} />
            <div className="min-w-0">
              <h3 className="truncate font-black tracking-[-0.015em] group-hover:text-[#6d28d9]">
                {zap.name}
              </h3>
              <p className="mt-0.5 truncate text-xs text-[#7d756f]">
                {zap.trigger?.type.name ?? "No trigger"} · {zap.actions.length}{" "}
                {zap.actions.length === 1 ? "action" : "actions"}
              </p>
            </div>
          </div>
        </Link>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusStyle(zap.status)}`}
        >
          {zap.status}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-[#6d6660]">
        {zap.description || "No description added yet."}
      </p>

      <div className="mt-4 flex min-h-10 items-center">
        <div className="flex -space-x-2">
          {zap.actions.slice(0, 4).map((action) => (
            <span key={action.id} className="rounded-lg ring-2 ring-white">
              <AppIcon app={action.type} size="sm" />
            </span>
          ))}
          {zap.actions.length > 4 && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f1eeea] text-[10px] font-black text-[#6d6660] ring-2 ring-white">
              +{zap.actions.length - 4}
            </span>
          )}
          {zap.actions.length === 0 && (
            <span className="text-xs text-[#8d8580]">
              No actions configured
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#eee9e4] bg-[#faf9f7] p-3">
        {isWebhook ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-wide text-[#8d8580]">
                Webhook endpoint
              </span>
              <button
                type="button"
                onClick={onCopy}
                className="text-[11px] font-black text-[#6d28d9] hover:underline"
              >
                {copied ? "Copied" : "Copy URL"}
              </button>
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-[#5f5853]">
              {webhookUrl(zap)}
            </p>
          </>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wide text-[#8d8580]">
                Trigger
              </span>
              <p className="mt-1 text-xs font-bold">
                {triggerDescription(zap)}
              </p>
            </div>
            <AppIcon app={zap.trigger?.type} size="sm" />
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="truncate text-[11px] text-[#8d8580]">
          Updated {formatDate(zap.updatedAt)}
        </span>
        <div className="flex items-center gap-1">
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-lg px-2.5 py-2 text-xs font-bold text-[#8b4b4b] transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <Link
            href={`/zap/${zap.id}`}
            className="rounded-lg bg-[#2d2525] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#503eb6]"
          >
            Open
          </Link>
        </div>
      </div>
    </article>
  );
}

function StatCard({
  value,
  label,
  icon,
  accent = false,
}: {
  value: number;
  label: string;
  icon: "workflow" | "published" | "draft" | "action";
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-4 sm:px-5">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent ? "bg-[#e4f7eb] text-[#168047]" : "bg-[#f2ecff] text-[#6d28d9]"}`}
      >
        <DashboardIcon name={icon} />
      </span>
      <div>
        <div className="text-2xl font-black leading-none">{value}</div>
        <div className="mt-1.5 text-xs text-[#7d756f]">{label}</div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  copy,
}: {
  href: string;
  icon: "template" | "connection" | "run";
  title: string;
  copy: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-[#f7f5f2]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f2ecff] text-[#6d28d9]">
        <DashboardIcon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block truncate text-[11px] text-[#7d756f]">
          {copy}
        </span>
      </span>
      <span className="text-[#aaa19a] transition group-hover:translate-x-0.5 group-hover:text-[#6d28d9]">
        →
      </span>
    </Link>
  );
}

function WorkflowSkeleton() {
  return (
    <div className="grid gap-4 bg-[#faf9f7] p-4 sm:p-5 lg:grid-cols-2">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="h-64 animate-pulse rounded-2xl border border-[#e3ded8] bg-white p-5"
        >
          <div className="h-10 w-3/5 rounded-lg bg-[#f1eeea]" />
          <div className="mt-5 h-4 w-full rounded bg-[#f1eeea]" />
          <div className="mt-2 h-4 w-2/3 rounded bg-[#f1eeea]" />
          <div className="mt-8 h-16 rounded-xl bg-[#f1eeea]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-16 text-center sm:py-20">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f2ecff] text-[#6d28d9]">
        <DashboardIcon name="spark" />
      </div>
      <h3 className="mt-5 text-xl font-black">Create your first workflow</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6d6660]">
        Start with a webhook, schedule, or polling trigger and connect the apps
        you need.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <Link
          href="/zap/create"
          className="rounded-xl bg-[#503eb6] px-5 py-3 text-sm font-bold text-white hover:bg-[#42319f]"
        >
          Build from scratch
        </Link>
        <Link
          href="/templates"
          className="rounded-xl border border-[#d8d1ca] px-5 py-3 text-sm font-bold hover:bg-[#f7f5f2]"
        >
          Browse templates
        </Link>
      </div>
    </div>
  );
}

function DeleteDialog({
  zap,
  deleting,
  onCancel,
  onConfirm,
}: {
  zap: Zap;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2d2525]/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-workflow-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#e3ded8] bg-white p-6 shadow-2xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <DashboardIcon name="trash" />
        </div>
        <h2 id="delete-workflow-title" className="mt-5 text-xl font-black">
          Delete workflow?
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#6d6660]">
          This permanently deletes{" "}
          <strong className="text-[#2d2525]">{zap.name}</strong> and its run
          history. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-[#d8d1ca] px-4 py-2.5 text-sm font-bold hover:bg-[#f7f5f2] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardIcon({
  name,
}: {
  name:
    | "workflow"
    | "published"
    | "draft"
    | "action"
    | "template"
    | "connection"
    | "run"
    | "spark"
    | "trash";
}) {
  const common = {
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "published")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.5 12 2.3 2.3 4.8-5" />
      </svg>
    );
  if (name === "draft")
    return (
      <svg {...common}>
        <path d="M5 19h4l10-10-4-4L5 15v4Z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    );
  if (name === "action")
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
        <path d="M10 7h3a4 4 0 0 1 4 4v3" />
      </svg>
    );
  if (name === "template")
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  if (name === "connection")
    return (
      <svg {...common}>
        <path d="m9 15-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M15 9l2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0M9 15l6-6" />
      </svg>
    );
  if (name === "run")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    );
  if (name === "spark")
    return (
      <svg {...common}>
        <path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3ZM18.5 15l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
      </svg>
    );
  if (name === "trash")
    return (
      <svg {...common}>
        <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="m13.2 2.8-8 10.1h6.3l-.7 8.3 8-10.1h-6.3l.7-8.3Z" />
    </svg>
  );
}

function webhookUrl(zap: Zap) {
  return `${HOOKS_URL}/${zap.id}/${zap.webhookToken}`;
}

function triggerDescription(zap: Zap) {
  const metadata = zap.trigger?.metadata ?? {};
  const seconds = Number(metadata.intervalSeconds ?? 60);
  if (zap.trigger?.type.id === "schedule")
    return `Runs every ${formatInterval(seconds)}`;
  if (zap.trigger?.type.id === "polling")
    return `Checks for changes every ${formatInterval(seconds)}`;
  return zap.trigger?.type.name ?? "Trigger not configured";
}

function formatInterval(seconds: number) {
  if (seconds >= 3600 && seconds % 3600 === 0)
    return `${seconds / 3600} ${seconds === 3600 ? "hour" : "hours"}`;
  if (seconds >= 60 && seconds % 60 === 0)
    return `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}`;
  return `${seconds} seconds`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year:
      new Date(value).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(new Date(value));
}

function statusStyle(status: Zap["status"]) {
  if (status === "PUBLISHED") return "bg-[#dff7e8] text-[#126b38]";
  if (status === "PAUSED") return "bg-amber-100 text-amber-800";
  if (status === "ARCHIVED") return "bg-slate-200 text-slate-700";
  return "bg-[#eee9ff] text-[#503eb6]";
}
