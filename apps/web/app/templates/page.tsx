"use client";

import Link from "next/link";
import { DashboardShell } from "../../components/DashboardShell";
import { AppIcon } from "../../components/AppIcon";
import { starterTemplates } from "../../lib/templates";

export default function TemplatesPage() {
  return (
    <DashboardShell>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 md:px-8 md:py-10">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7c3aed]">
              Template library
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
              Start with a proven workflow
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#6d6660] sm:text-base">
              Pick a reliable starting point, then tailor every trigger and
              action to your process.
            </p>
          </div>
          <Link
            href="/zap/create"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8d1ca] bg-white px-5 text-sm font-semibold shadow-sm transition hover:border-[#bdb4ad] hover:bg-[#faf9f7]"
          >
            Start from scratch
          </Link>
        </header>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {starterTemplates.map((template) => (
            <article
              key={template.id}
              className="group flex min-h-[340px] flex-col overflow-hidden rounded-2xl border border-[#e3ded8] bg-white shadow-[0_3px_14px_rgba(45,37,37,0.035)] transition duration-200 hover:-translate-y-1 hover:border-[#cfc6dc] hover:shadow-[0_18px_45px_rgba(50,35,65,0.09)]"
            >
              <div
                className={`flex h-28 items-center justify-between bg-gradient-to-br ${template.accent} px-6`}
              >
                <span className="rounded-full border border-white/60 bg-white/75 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6d6660] backdrop-blur">
                  Starter
                </span>
                <div className="flex items-center -space-x-2">
                  <span className="rounded-xl ring-2 ring-white">
                    <AppIcon
                      app={{ id: template.trigger, name: template.trigger }}
                      size="sm"
                    />
                  </span>
                  {template.actions.slice(0, 2).map((action) => (
                    <span key={action.id} className="rounded-xl ring-2 ring-white">
                      <AppIcon
                        app={{ id: action.id, name: action.id }}
                        size="sm"
                      />
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h2 className="text-xl font-bold tracking-[-0.025em]">
                  {template.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#6d6660]">
                  {template.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {[template.trigger, ...template.actions.map((action) => action.id)].map(
                    (step) => (
                      <span
                        key={step}
                        className="rounded-lg border border-[#e8e3de] bg-[#faf9f7] px-2.5 py-1 text-xs font-semibold capitalize text-[#625b56]"
                      >
                        {step}
                      </span>
                    ),
                  )}
                </div>
                <Link
                  href={`/zap/create?template=${template.id}`}
                  className="mt-auto flex items-center justify-between border-t border-[#eee9e4] pt-5 text-sm font-semibold text-[#6d28d9]"
                >
                  Use this template
                  <span className="transition group-hover:translate-x-1">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>
    </DashboardShell>
  );
}
