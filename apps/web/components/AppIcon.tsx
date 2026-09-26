import type { AppOption } from "../lib/types";

const colors: Record<string, string> = {
  webhook: "bg-gradient-to-br from-[#7c3aed] via-[#c026d3] to-[#ec4899]",
  email: "bg-white ring-1 ring-[#ea4335]/25",
  solana: "bg-[#111111]",
  http: "bg-[#2563eb]",
  slack: "bg-[#4a154b]",
  "google-sheets": "bg-white ring-1 ring-[#34a853]/25",
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

export function AppIcon({
  app,
  size = "md",
}: {
  app?: Pick<AppOption, "id" | "name"> | null;
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
