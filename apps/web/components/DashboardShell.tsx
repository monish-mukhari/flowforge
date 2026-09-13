"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "./Brand";
import { api } from "../lib/api";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-[#e3ded8] bg-white p-5 md:flex md:flex-col">
        <Brand compact />
        <Link
          href="/zap/create"
          className="mt-8 flex items-center justify-center gap-2 rounded-lg bg-[#ff4f00] px-4 py-3 text-sm font-bold text-white hover:bg-[#d94100]"
        >
          <span className="text-xl leading-none">+</span> Create workflow
        </Link>
        <nav className="mt-7 space-y-1 text-sm font-semibold">
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${pathname === "/dashboard" ? "bg-[#f1eeea]" : "hover:bg-[#f7f5f2]"}`}
          >
            <span>⚡</span> My workflows
          </Link>
          <div
            className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-[#98908a]"
            title="Run history is not exposed by the backend yet"
          >
            <span>◷</span> Run history{" "}
            <span className="ml-auto text-[10px] uppercase">Soon</span>
          </div>
        </nav>
        <div className="mt-auto rounded-xl bg-[#f7f5f2] p-4 text-xs leading-5 text-[#6d6660]">
          <strong className="block text-sm text-[#2d2525]">
            Connected stack
          </strong>
          Webhooks, Email and Solana are ready to use.
        </div>
        <button
          onClick={() => {
            void api
              .post("/api/v1/user/logout")
              .finally(() => router.push("/login"));
          }}
          className="mt-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#6d6660] hover:bg-[#f7f5f2]"
        >
          Sign out
        </button>
      </aside>
      <div className="md:pl-60">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#e3ded8] bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="md:hidden">
            <Brand compact />
          </div>
          <div className="hidden text-sm text-[#6d6660] md:block">
            Automation workspace
          </div>
          <Link
            href="/zap/create"
            className="rounded-lg bg-[#2d2525] px-4 py-2 text-sm font-bold text-white md:hidden"
          >
            Create
          </Link>
          <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#fff0e8] text-sm font-bold text-[#d94100] md:flex">
            M
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
