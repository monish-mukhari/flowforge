"use client";

import Link from "next/link";
import { Brand } from "./Brand";

export function Appbar() {
  return (
    <header className="relative z-20 border-b border-[#e7e2dd] bg-[#fbfaf8]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-5">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-medium text-[#5f5752] md:flex">
          <a href="#how-it-works" className="hover:text-black">
            How it works
          </a>
          <a href="#reliability" className="hover:text-black">
            Reliability
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#f1eeea] sm:block"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-[#2d2525] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#171313]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
