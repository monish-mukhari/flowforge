"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "./Brand";
import { api } from "../lib/api";

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  kind: "workflow" | "run";
};

function NavIcon({
  name,
}: {
  name:
    | "workflow"
    | "connections"
    | "history"
    | "templates"
    | "crypto"
    | "workspace"
    | "menu"
    | "search"
    | "sun"
    | "moon";
}) {
  const common = {
    className: "h-[19px] w-[19px] shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2.25,
    viewBox: "0 0 24 24",
  };
  if (name === "workflow")
    return (
      <svg {...common}>
        <path
          d="m13.2 2.8-8 10.1h6.3l-.7 8.3 8-10.1h-6.3l.7-8.3Z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    );
  if (name === "connections")
    return (
      <svg {...common}>
        <path d="M8.5 14.5 6.8 16.2a3.1 3.1 0 1 1-4.4-4.4l2.8-2.8a3.1 3.1 0 0 1 4.4 0" />
        <path d="m15.5 9.5 1.7-1.7a3.1 3.1 0 1 1 4.4 4.4l-2.8 2.8a3.1 3.1 0 0 1-4.4 0" />
        <path d="m8.5 15.5 7-7" />
      </svg>
    );
  if (name === "history")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.5 2.2" />
        <path d="M4 5.5 2.8 8.8l3.4.2" />
      </svg>
    );
  if (name === "templates")
    return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" /><path d="M4 5.5V19M8 7h8M8 11h8" /></svg>;
  if (name === "crypto")
    return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M9 8.5h4.2a2 2 0 0 1 0 4H9m0 0h4.8a2 2 0 0 1 0 4H9m0-9v9m-1.5-9H14m-6.5 9H14" /></svg>;
  if (name === "workspace")
    return <svg {...common}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 16.5a4.2 4.2 0 0 1 5.5 2.5" /></svg>;
  if (name === "menu")
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  if (name === "sun")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5" />
      </svg>
    );
  if (name === "moon")
    return (
      <svg {...common}>
        <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 4.2 4.2" />
    </svg>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userInitial, setUserInitial] = useState("?");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("flowforge-sidebar-collapsed") === "true",
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(
      "flowforge-sidebar-collapsed",
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);
  useEffect(() => {
    setDarkMode(window.localStorage.getItem("flowforge-dark-mode") === "true");
  }, []);
  useEffect(() => {
    window.localStorage.setItem("flowforge-dark-mode", String(darkMode));
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    let active = true;
    setSearchLoading(true);
    void Promise.all([api.get("/api/v1/zap"), api.get("/api/v1/zap/runs")])
      .then(([zapsResponse, runsResponse]) => {
        if (!active) return;
        const workflows: SearchItem[] = (zapsResponse.data.zaps ?? []).map(
          (zap: { id: string; name: string; status: string }) => ({
            id: zap.id,
            title: zap.name,
            subtitle: `Workflow · ${zap.status.toLowerCase()}`,
            href: `/zap/${zap.id}`,
            kind: "workflow",
          }),
        );
        const runs: SearchItem[] = (runsResponse.data.runs ?? []).map(
          (run: {
            id: string;
            status: string;
            zap?: { id: string; name: string };
          }) => ({
            id: run.id,
            title: run.zap?.name ?? "Workflow run",
            subtitle: `Run · ${run.status.toLowerCase()} · ${run.id.slice(0, 8)}`,
            href: run.zap ? `/zap/${run.zap.id}` : "/runs",
            kind: "run",
          }),
        );
        setSearchItems([...workflows, ...runs]);
      })
      .catch(() => {
        if (active) setSearchItems([]);
      })
      .finally(() => {
        if (active) setSearchLoading(false);
      });
    return () => {
      active = false;
    };
  }, [searchOpen]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchingItems = searchItems
    .filter(
      (item) =>
        !normalizedSearch ||
        `${item.title} ${item.subtitle}`
          .toLowerCase()
          .includes(normalizedSearch),
    )
    .slice(0, 8);
  useEffect(() => {
    let active = true;
    void api
      .get("/api/v1/user/")
      .then((response) => {
        if (!active) return;
        const name = String(response.data.user?.name ?? "").trim();
        const email = String(response.data.user?.email ?? "").trim();
        const identity = name || email;
        if (identity) setUserInitial(identity.charAt(0).toUpperCase());
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <aside
        className={`fixed inset-y-0 left-0 z-20 hidden border-r border-[#e3ded8] bg-white transition-[width] duration-200 md:flex md:flex-col ${sidebarCollapsed ? "w-20 p-3" : "w-60 p-5"}`}
      >
        <div
          className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between gap-3"}`}
        >
          {!sidebarCollapsed && <Brand compact />}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6d6660] hover:bg-[#f7f5f2] hover:text-[#2d2525]"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <NavIcon name="menu" />
          </button>
        </div>
        <Link
          href="/zap/create"
          className={`mt-8 flex items-center justify-center gap-2 rounded-lg bg-[#ff4f00] py-3 text-sm font-bold text-white hover:bg-[#d94100] ${sidebarCollapsed ? "px-0" : "px-4"}`}
          title={sidebarCollapsed ? "Create workflow" : undefined}
        >
          <span className="text-xl leading-none">+</span>
          {!sidebarCollapsed && "Create workflow"}
        </Link>
        <nav className="mt-7 space-y-1 text-sm font-semibold">
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 rounded-lg py-2.5 ${sidebarCollapsed ? "justify-center px-0" : "px-3"} ${pathname === "/dashboard" ? "bg-[#f1eeea]" : "hover:bg-[#f7f5f2]"}`}
            title={sidebarCollapsed ? "My workflows" : undefined}
          >
            <NavIcon name="workflow" />
            {!sidebarCollapsed && "My workflows"}
          </Link>
          <Link
            href="/runs"
            className={`flex items-center gap-3 rounded-lg py-2.5 ${sidebarCollapsed ? "justify-center px-0" : "px-3"} ${pathname === "/runs" ? "bg-[#f1eeea]" : "hover:bg-[#f7f5f2]"}`}
            title={sidebarCollapsed ? "Run history" : undefined}
          >
            <NavIcon name="history" />
            {!sidebarCollapsed && "Run history"}
          </Link>
          <Link
            href="/connections"
            className={`flex items-center gap-3 rounded-lg py-2.5 ${sidebarCollapsed ? "justify-center px-0" : "px-3"} ${pathname === "/connections" ? "bg-[#f1eeea]" : "hover:bg-[#f7f5f2]"}`}
            title={sidebarCollapsed ? "Connections" : undefined}
          >
            <NavIcon name="connections" />
            {!sidebarCollapsed && "Connections"}
          </Link>
          <Link href="/templates" className={`flex items-center gap-3 rounded-lg py-2.5 ${sidebarCollapsed ? "justify-center px-0" : "px-3"} ${pathname === "/templates" ? "bg-[#f1eeea]" : "hover:bg-[#f7f5f2]"}`} title={sidebarCollapsed ? "Templates" : undefined}>
            <NavIcon name="templates" />{!sidebarCollapsed && "Templates"}
          </Link>
          <Link href="/crypto" className={`flex items-center gap-3 rounded-lg py-2.5 ${sidebarCollapsed ? "justify-center px-0" : "px-3"} ${pathname === "/crypto" ? "bg-[#f1eeea]" : "hover:bg-[#f7f5f2]"}`} title={sidebarCollapsed ? "Crypto settings" : undefined}>
            <NavIcon name="crypto" />{!sidebarCollapsed && "Crypto settings"}
          </Link>
          <Link href="/workspace" className={`flex items-center gap-3 rounded-lg py-2.5 ${sidebarCollapsed ? "justify-center px-0" : "px-3"} ${pathname === "/workspace" ? "bg-[#f1eeea]" : "hover:bg-[#f7f5f2]"}`} title={sidebarCollapsed ? "Workspace" : undefined}>
            <NavIcon name="workspace" />{!sidebarCollapsed && "Workspace"}
          </Link>
        </nav>
        <div
          className={`mt-auto rounded-xl bg-[#f7f5f2] text-xs leading-5 text-[#6d6660] ${sidebarCollapsed ? "p-2 text-center" : "p-4"}`}
          title={sidebarCollapsed ? "Versioned connector platform" : undefined}
        >
          <strong className="block text-sm text-[#2d2525]">
            {sidebarCollapsed ? "•••" : "Connector platform"}
          </strong>
          {!sidebarCollapsed &&
            "HTTP, Email, Slack, Sheets and Solana are ready."}
        </div>
        <button
          onClick={() => {
            void api
              .post("/api/v1/user/logout")
              .finally(() => router.push("/login"));
          }}
          className={`mt-3 rounded-lg py-2 text-sm font-semibold text-[#6d6660] hover:bg-[#f7f5f2] ${sidebarCollapsed ? "px-0 text-center" : "px-3 text-left"}`}
          title={sidebarCollapsed ? "Sign out" : undefined}
        >
          {sidebarCollapsed ? "↪" : "Sign out"}
        </button>
      </aside>
      <div
        className={`transition-[padding] duration-200 ${sidebarCollapsed ? "md:pl-20" : "md:pl-60"}`}
      >
        <header className="relative sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#e3ded8] bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="md:hidden">
            <Brand compact />
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="absolute left-1/2 hidden h-10 w-[min(380px,42vw)] -translate-x-1/2 items-center gap-2 rounded-lg border border-[#d9d3cc] bg-[#faf9f7] px-3 text-left text-sm text-[#817972] shadow-sm transition hover:border-[#aaa19a] hover:bg-white md:flex"
            aria-label="Search workspace"
          >
            <NavIcon name="search" />
            <span className="flex-1">Search</span>
            <kbd className="rounded border border-[#d9d3cc] bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#817972]">
              Ctrl K
            </kbd>
          </button>
          <Link
            href="/zap/create"
            className="rounded-lg bg-[#2d2525] px-4 py-2 text-sm font-bold text-white md:hidden"
          >
            Create
          </Link>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6d6660] hover:bg-[#f7f5f2] hover:text-[#2d2525]"
              aria-label={
                darkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              title={darkMode ? "Light mode" : "Dark mode"}
            >
              <NavIcon name={darkMode ? "sun" : "moon"} />
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff0e8] text-center text-sm font-bold leading-none text-[#d94100]">
              {userInitial}
            </div>
          </div>
        </header>
        {searchOpen && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center bg-[#2d2525]/20 px-4 pt-24"
            onClick={() => setSearchOpen(false)}
          >
            <div
              className="w-full max-w-xl overflow-hidden rounded-xl border border-[#d9d3cc] bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-[#ebe7e2] px-4 py-3">
                <NavIcon name="search" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#a39a92]"
                  placeholder="Search workflows, runs, and settings"
                />
                <kbd className="rounded border border-[#d9d3cc] px-1.5 py-0.5 text-[11px] text-[#817972]">
                  ESC
                </kbd>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {searchLoading && (
                  <p className="px-3 py-4 text-sm text-[#817972]">
                    Loading workspace search…
                  </p>
                )}
                {!searchLoading && matchingItems.length === 0 && (
                  <p className="px-3 py-4 text-sm text-[#817972]">
                    {normalizedSearch
                      ? "No matching workflows or runs."
                      : "No workflows or runs found."}
                  </p>
                )}
                {!searchLoading &&
                  matchingItems.map((item) => (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(item.href);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-[#f7f5f2]"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff0e8] text-[#ff4f00]">
                        {item.kind === "workflow" ? "⚡" : "◷"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[#2d2525]">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs capitalize text-[#817972]">
                          {item.subtitle}
                        </span>
                      </span>
                      <span className="text-[#aaa19a]">→</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
