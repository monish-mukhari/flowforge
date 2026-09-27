"use client";

import Link from "next/link";
import { DashboardShell } from "../../components/DashboardShell";
import { AppIcon } from "../../components/AppIcon";
import { starterTemplates } from "../../lib/templates";

export default function TemplatesPage() {
  return <DashboardShell><main className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
    <div className="max-w-2xl"><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">Template library</p><h1 className="mt-1 text-4xl font-black tracking-[-0.045em]">Start with a proven workflow</h1><p className="mt-3 text-[#6d6660]">Choose a trigger and action pattern, then customize it in the builder before publishing.</p></div>
    <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{starterTemplates.map((template) => <article key={template.id} className={`group overflow-hidden rounded-2xl border border-[#e3ded8] bg-gradient-to-br ${template.accent} shadow-sm transition hover:-translate-y-1 hover:shadow-lg`}>
      <div className="p-6"><div className="flex items-center justify-between"><span className="rounded-full bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#6d6660]">Starter</span><div className="flex -space-x-2"><AppIcon app={{ id: template.trigger, name: template.trigger, image: "" }} size="sm" />{template.actions.slice(0, 2).map((action) => <span key={action.id} className="rounded-xl ring-2 ring-white"><AppIcon app={{ id: action.id, name: action.id, image: "" }} size="sm" /></span>)}</div></div><h2 className="mt-8 text-xl font-black">{template.name}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-[#5f5852]">{template.description}</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-md bg-white/70 px-2 py-1 text-xs font-bold">{template.trigger}</span>{template.actions.map((action) => <span key={action.id} className="rounded-md bg-white/70 px-2 py-1 text-xs font-bold">{action.id}</span>)}</div><Link href={`/zap/create?template=${template.id}`} className="mt-7 flex items-center justify-center rounded-xl bg-[#2d2525] px-4 py-3 text-sm font-bold text-white transition group-hover:bg-[#503eb6]">Use this template <span className="ml-2">→</span></Link></div>
    </article>)}</div>
  </main></DashboardShell>;
}
