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
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    api.get("/api/v1/zap").then(response => setZaps(response.data.zaps)).catch(caught => {
      if (caught.response?.status === 401) router.replace("/login");
      else setError(getErrorMessage(caught));
    }).finally(() => setLoading(false));
  }, [router]);

  async function copyHook(zap: Zap) {
    await navigator.clipboard.writeText(`${HOOKS_URL}/${zap.userId}/${zap.id}`);
    setCopied(zap.id); setTimeout(() => setCopied(null), 1600);
  }

  return <DashboardShell><main className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">Workspace</p><h1 className="mt-1 text-4xl font-black tracking-[-0.045em]">My workflows</h1><p className="mt-2 text-[#6d6660]">Build, share and monitor your automated flows.</p></div><Link href="/zap/create" className="rounded-xl bg-[#ff4f00] px-5 py-3 text-center text-sm font-bold text-white hover:bg-[#d94100]">+ Create workflow</Link></div>
    {!loading && !error && zaps.length > 0 && <div className="mt-8 grid gap-4 sm:grid-cols-3"><Stat value={String(zaps.length)} label="Published workflows"/><Stat value={String(zaps.reduce((count,zap) => count + zap.actions.length, 0))} label="Configured actions"/><Stat value="Live" label="Webhook endpoint" green/></div>}
    <section className="mt-8 overflow-hidden rounded-2xl border border-[#e3ded8] bg-white">
      <div className="flex items-center justify-between border-b border-[#e3ded8] px-5 py-4"><h2 className="font-bold">All workflows</h2><span className="text-xs text-[#7d756f]">{zaps.length} total</span></div>
      {loading && <div className="space-y-3 p-5">{[1,2,3].map(n => <div key={n} className="h-20 animate-pulse rounded-xl bg-[#f1eeea]" />)}</div>}
      {error && <div className="m-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!loading && !error && zaps.length === 0 && <div className="p-12 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0e8] text-2xl">⚡</div><h3 className="mt-5 text-xl font-bold">No workflows yet</h3><p className="mt-2 text-sm text-[#6d6660]">Create a webhook workflow and add your first action.</p><Link href="/zap/create" className="mt-6 inline-block rounded-xl bg-[#503eb6] px-5 py-3 text-sm font-bold text-white">Build a workflow</Link></div>}
      {!loading && zaps.map(zap => <div key={zap.id} className="lift grid gap-4 border-b border-[#eee9e4] p-5 last:border-0 lg:grid-cols-[1fr_1.2fr_auto] lg:items-center">
        <Link href={`/zap/${zap.id}`} className="flex min-w-0 items-center gap-3"><div className="flex -space-x-2">{zap.trigger && <span className="z-10 rounded-xl ring-2 ring-white"><AppIcon app={zap.trigger.type}/></span>}{zap.actions.slice(0,2).map(action => <span key={action.id} className="rounded-xl ring-2 ring-white"><AppIcon app={action.type}/></span>)}</div><div className="min-w-0"><div className="truncate font-bold">Webhook workflow</div><div className="mt-1 truncate font-mono text-xs text-[#8d8580]">{zap.id}</div></div></Link>
        <div className="min-w-0"><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#8d8580]">Webhook URL</div><div className="truncate rounded-lg bg-[#f7f5f2] px-3 py-2 font-mono text-xs">{HOOKS_URL}/{zap.userId}/{zap.id}</div></div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-[#dff7e8] px-3 py-1.5 text-xs font-bold text-[#126b38]">● Published</span><button onClick={() => copyHook(zap)} className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold hover:bg-[#f7f5f2]">{copied === zap.id ? "Copied!" : "Copy URL"}</button><Link href={`/zap/${zap.id}`} className="rounded-lg px-2 py-2 font-bold hover:bg-[#f7f5f2]">→</Link></div>
      </div>)}
    </section>
  </main></DashboardShell>;
}

function Stat({ value, label, green = false }: { value: string; label: string; green?: boolean }) { return <div className="rounded-2xl border border-[#e3ded8] bg-white p-5"><div className={`text-2xl font-black ${green ? "text-[#168047]" : ""}`}>{value}</div><div className="mt-1 text-xs text-[#7d756f]">{label}</div></div>; }
