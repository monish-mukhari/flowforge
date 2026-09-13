"use client";

import Link from "next/link";
import { Brand } from "./Brand";

export function Appbar() {
  return (
    <header className="border-b border-[#e3ded8] bg-[#fffdf9]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Brand />
        <nav className="hidden items-center gap-7 text-sm font-semibold text-[#4f4945] md:flex">
          <a href="#how-it-works" className="hover:text-black">
            How it works
          </a>
          <a href="#apps" className="hover:text-black">
            Apps
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#f1eeea]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-[#ff4f00] px-4 py-2 text-sm font-bold text-white hover:bg-[#d94100]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
