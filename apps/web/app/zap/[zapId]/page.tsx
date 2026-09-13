"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "../../../components/DashboardShell";
import { AppIcon } from "../../../components/AppIcon";
import { api, getErrorMessage } from "../../../lib/api";
import type { Zap } from "../../../lib/types";
import { HOOKS_URL } from "../../config";

export default function ZapDetails() {
  const { zapId } = useParams<{ zapId: string }>();
  const [zap, setZap] = useState<Zap | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
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

  const hookUrl = zap ? `${HOOKS_URL}/${zap.id}/${zap.webhookToken}` : "";
  const curl = `curl -X POST "${hookUrl}" -H "Content-Type: application/json" -d '{"customer":{"name":"Ada","email":"ada@example.com"},"payment":{"amount":"0.01"}}'`;
  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(""), 1600);
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
                    Webhook workflow
                  </h1>
                  <span className="rounded-full bg-[#dff7e8] px-3 py-1 text-xs font-bold text-[#126b38]">
                    ● Published
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-[#8d8580]">
                  {zap.id}
                </p>
              </div>
              <Link
                href="/zap/create"
                className="rounded-xl border border-[#bdb5ae] bg-white px-5 py-3 text-center text-sm font-bold hover:bg-[#f7f5f2]"
              >
                Create another
              </Link>
            </div>
            <section className="mt-8 rounded-2xl border border-[#e3ded8] bg-white p-5 sm:p-7">
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
                  {zap.actions
                    .sort((a, b) => a.sortingOrder - b.sortingOrder)
                    .map((action, index) => (
                      <div key={action.id}>
                        <div className="ml-7 h-7 w-0.5 bg-[#bdb5ae]" />
                        <ReadOnlyStep
                          number={index + 2}
                          label="Action"
                          title={action.type.name}
                          app={action.type}
                          detail={describeMetadata(action.metadata)}
                        />
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
          </>
        )}
      </main>
    </DashboardShell>
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
