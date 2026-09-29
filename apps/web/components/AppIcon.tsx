import type { AppOption } from "../lib/types";

const colors: Record<string, string> = {
  webhook: "bg-gradient-to-br from-[#7c3aed] via-[#c026d3] to-[#ec4899]",
  email: "bg-white ring-1 ring-[#ea4335]/25",
  solana: "bg-[#111111]",
  http: "bg-[#2563eb]",
  slack: "bg-[#4a154b]",
  "google-sheets": "bg-white ring-1 ring-[#34a853]/25",
  schedule: "bg-[#0f766e]",
  polling: "bg-[#1d4ed8]",
  filter: "bg-[#7c3aed]",
  branch: "bg-[#be185d]",
  transform: "bg-[#0f766e]",
  delay: "bg-[#b45309]",
  loop: "bg-[#0369a1]",
};

const assets: Record<string, string> = {
  email: "/connectors/gmail.svg",
  "google-sheets": "/connectors/googlesheets.svg",
  slack: "/connectors/slack.svg",
  webhook: "/connectors/webhook.svg",
  http: "/connectors/http.svg",
};

function SolanaIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[64%] w-[64%]"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="solana-icon-gradient" x1="4" y1="20" x2="20" y2="4">
          <stop stopColor="#9945FF" />
          <stop offset="0.5" stopColor="#14F195" />
          <stop offset="1" stopColor="#00D1FF" />
        </linearGradient>
      </defs>
      <path d="M7 4h13l-3 3H4l3-3Z" fill="url(#solana-icon-gradient)" />
      <path d="M4 10.5h13l3 3H7l-3-3Z" fill="url(#solana-icon-gradient)" />
      <path d="M7 17h13l-3 3H4l3-3Z" fill="url(#solana-icon-gradient)" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[68%] w-[68%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2M8 3.8 6.3 2M16 3.8 17.7 2" strokeLinecap="round" />
    </svg>
  );
}

function PollingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[68%] w-[68%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 7.5h10M4 12h16M4 16.5h10" strokeLinecap="round" />
      <path
        d="m16 5 3 2.5-3 2.5M8 14l-3 2.5L8 19"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogicIcon({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    filter: (
      <path d="M5 6h14l-5.3 6.1V18l-3.4 1.5v-7.4L5 6Z" strokeLinejoin="round" />
    ),
    branch: (
      <path
        d="M7 5v5a3 3 0 0 0 3 3h7m-4-4 4 4-4 4M7 10V7m0 10v2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    transform: (
      <path
        d="m7 7 3-3m-3 3 3 3M17 17l-3 3m3-3-3-3M10 7h3a4 4 0 0 1 4 4v1M14 17h-3a4 4 0 0 1-4-4v-1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    delay: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    loop: (
      <path
        d="M17.5 8A7 7 0 0 0 6 6.5L4 9m2.5 7A7 7 0 0 0 18 17.5l2-2.5M4 5v4h4m12 10v-4h-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[64%] w-[64%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {paths[id]}
    </svg>
  );
}

export function AppIcon({
  app,
  size = "md",
}: {
  app?: (Pick<AppOption, "id" | "name"> & { image?: string }) | null;
  size?: "sm" | "md" | "lg";
}) {
  const dimension =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : size === "lg"
        ? "h-14 w-14 text-xl"
        : "h-10 w-10 text-sm";
  const icon = assets[app?.id || ""] ? (
    <img
      src={assets[app?.id || ""]}
      alt=""
      className="h-[68%] w-[68%] object-contain"
    />
  ) : app?.id === "solana" ? (
    <SolanaIcon />
  ) : app?.id === "schedule" ? (
    <ScheduleIcon />
  ) : app?.id === "polling" ? (
    <PollingIcon />
  ) : app?.id &&
    ["filter", "branch", "transform", "delay", "loop"].includes(app.id) ? (
    <LogicIcon id={app.id} />
  ) : (
    (app?.name?.charAt(0).toUpperCase() ?? "+")
  );
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white ${dimension} ${colors[app?.id || ""] || "bg-[#8d8580]"}`}
      aria-label={app?.name || "App"}
    >
      {icon}
    </span>
  );
}
