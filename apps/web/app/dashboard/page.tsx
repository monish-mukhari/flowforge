"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "../../components/DashboardShell";
import { AppIcon } from "../../components/AppIcon";
import { api, getErrorMessage } from "../../lib/api";
import type { Zap } from "../../lib/types";
import { HOOKS_URL } from "../config";

export default function Dashboard() {
  const [zaps, setZaps] = useState<Zap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [solanaWallet, setSolanaWallet] = useState<{
    publicKey: string;
    network: string;
    balanceSol: number;
  } | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Zap | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.all([api.get("/api/v1/zap"), api.get("/api/v1/user/solana-wallet")])
      .then(([zapsResponse, walletResponse]) => {
        setZaps(zapsResponse.data.zaps);
        setSolanaWallet(walletResponse.data.wallet);
      })
      .catch((caught) => {
        if (caught.response?.status === 401) router.replace("/login");
        else setError(getErrorMessage(caught));
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function copyHook(zap: Zap) {
    await navigator.clipboard.writeText(
      `${HOOKS_URL}/${zap.id}/${zap.webhookToken}`,
    );
    setCopied(zap.id);
    setTimeout(() => setCopied(null), 1600);
  }

  async function createWallet() {
    setWalletBusy(true);
    try {
      const response = await api.post("/api/v1/user/solana-wallet");
      setSolanaWallet({ ...response.data.wallet, balanceSol: 0 });
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setWalletBusy(false);
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
      <main className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
              Workspace
            </p>
            <h1 className="mt-1 text-4xl font-black tracking-[-0.045em]">
              My workflows
            </h1>
            <p className="mt-2 text-[#6d6660]">
              Build, share and monitor your automated flows.
            </p>
          </div>
          <Link
            href="/zap/create"
            className="rounded-xl bg-[#ff4f00] px-5 py-3 text-center text-sm font-bold text-white hover:bg-[#d94100]"
          >
            + Create workflow
          </Link>
        </div>
        {!loading && !error && zaps.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat
              value={String(
                zaps.filter((zap) => zap.status === "PUBLISHED").length,
              )}
              label="Published workflows"
            />
            <Stat
              value={String(
                zaps.reduce((count, zap) => count + zap.actions.length, 0),
              )}
              label="Configured actions"
            />
            <Stat value="Live" label="Webhook endpoint" green />
          </div>
        )}
        {!loading && (
          <section className="mt-5 rounded-2xl border border-[#ddd3f5] bg-gradient-to-r from-[#f6f0ff] to-[#fff1fa] p-5">
            {!solanaWallet ? (
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#7c3aed]">Solana transfers</div>
                  <p className="mt-1 text-sm font-bold">Set up a wallet when you are ready to send SOL.</p>
                  <p className="mt-1 text-xs text-[#6d6660]">You can also create it while configuring a Solana action.</p>
                </div>
                <button type="button" onClick={createWallet} disabled={walletBusy} className="shrink-0 rounded-lg bg-[#503eb6] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  {walletBusy ? "Creating…" : "Set up Solana wallet"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#7c3aed]">
                  Solana devnet wallet
                </div>
                <div className="mt-1 font-mono text-xs text-[#4c3b71]">{solanaWallet.publicKey}</div>
                <p className="mt-2 text-xs text-[#6d6660]">Fund this address with devnet SOL to run webhook transfers.</p>
              </div>
              <div className="shrink-0 rounded-xl bg-white/80 px-4 py-3 text-right">
                <div className="text-2xl font-black text-[#503eb6]">{solanaWallet.balanceSol.toFixed(4)}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#7d756f]">SOL balance</div>
              </div>
              </div>
            )}
          </section>
        )}
        <section className="mt-8 overflow-hidden rounded-2xl border border-[#e3ded8] bg-white">
          <div className="flex items-center justify-between border-b border-[#e3ded8] px-5 py-4">
            <h2 className="font-bold">All workflows</h2>
            <span className="text-xs text-[#7d756f]">{zaps.length} total</span>
          </div>
          {loading && (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-20 animate-pulse rounded-xl bg-[#f1eeea]"
                />
              ))}
            </div>
          )}
          {error && (
            <div className="m-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {!loading && !error && zaps.length === 0 && (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0e8] text-2xl">
                ⚡
              </div>
              <h3 className="mt-5 text-xl font-bold">No workflows yet</h3>
              <p className="mt-2 text-sm text-[#6d6660]">
                Create a webhook workflow and add your first action.
              </p>
              <Link
                href="/zap/create"
                className="mt-6 inline-block rounded-xl bg-[#503eb6] px-5 py-3 text-sm font-bold text-white"
              >
                Build a workflow
              </Link>
            </div>
          )}
          {!loading &&
            zaps.map((zap) => (
              <div
                key={zap.id}
                className="lift grid gap-4 border-b border-[#eee9e4] p-5 last:border-0 lg:grid-cols-[1fr_1.2fr_auto] lg:items-center"
              >
                <Link
                  href={`/zap/${zap.id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <div className="flex -space-x-2">
                    {zap.trigger && (
                      <span className="z-10 rounded-xl ring-2 ring-white">
                        <AppIcon app={zap.trigger.type} />
                      </span>
                    )}
                    {zap.actions.slice(0, 2).map((action) => (
                      <span
                        key={action.id}
                        className="rounded-xl ring-2 ring-white"
                      >
                        <AppIcon app={action.type} />
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{zap.name}</div>
                    <div className="mt-1 truncate font-mono text-xs text-[#8d8580]">
                      {zap.id}
                    </div>
                  </div>
                </Link>
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#8d8580]">
                    Webhook URL
                  </div>
                  <div className="truncate rounded-lg bg-[#f7f5f2] px-3 py-2 font-mono text-xs">
                    {HOOKS_URL}/{zap.id}/{zap.webhookToken}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusStyle(zap.status)}`}
                  >
                    {zap.status}
                  </span>
                  <button
                    onClick={() => copyHook(zap)}
                    className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold hover:bg-[#f7f5f2]"
                  >
                    {copied === zap.id ? "Copied!" : "Copy URL"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(zap)}
                    disabled={deletingId === zap.id}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === zap.id ? "Deleting…" : "Delete"}
                  </button>
                  <Link
                    href={`/zap/${zap.id}`}
                    className="rounded-lg px-2 py-2 font-bold hover:bg-[#f7f5f2]"
                  >
                    →
                  </Link>
                </div>
              </div>
            ))}
        </section>
      </main>
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2d2525]/35 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-workflow-title">
          <div className="w-full max-w-md rounded-2xl border border-[#e3ded8] bg-white p-6 shadow-2xl">
            <h2 id="delete-workflow-title" className="text-xl font-black">Delete workflow?</h2>
            <p className="mt-2 text-sm leading-6 text-[#6d6660]">
              This permanently deletes <strong className="text-[#2d2525]">{pendingDelete.name}</strong> and its run history. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={deletingId !== null} className="rounded-lg border border-[#d8d1ca] px-4 py-2.5 text-sm font-bold hover:bg-[#f7f5f2] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void deleteWorkflow(pendingDelete)} disabled={deletingId !== null} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">{deletingId ? "Deleting…" : "Delete workflow"}</button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function statusStyle(status: Zap["status"]) {
  if (status === "PUBLISHED") return "bg-[#dff7e8] text-[#126b38]";
  if (status === "PAUSED") return "bg-amber-100 text-amber-800";
  if (status === "ARCHIVED") return "bg-slate-200 text-slate-700";
  return "bg-[#eee9ff] text-[#503eb6]";
}

function Stat({
  value,
  label,
  green = false,
}: {
  value: string;
  label: string;
  green?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e3ded8] bg-white p-5">
      <div className={`text-2xl font-black ${green ? "text-[#168047]" : ""}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-[#7d756f]">{label}</div>
    </div>
  );
}
