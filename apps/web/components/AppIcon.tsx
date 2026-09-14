import type { AppOption } from "../lib/types";

const colors: Record<string, string> = {
  webhook: "bg-[#ff4f00]",
  email: "bg-[#e84d3c]",
  solana: "bg-[#111111]",
};

function WebhookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[62%] w-[62%]"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2.25" fill="currentColor" />
      <circle cx="6" cy="16.5" r="2.25" fill="currentColor" />
      <circle cx="18" cy="16.5" r="2.25" fill="currentColor" />
      <path
        d="M12 7.25v2.1m-1.35.8-3.2 4.15m5.9-4.15 3.2 4.15M8.25 17.15h7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[58%] w-[58%]"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m5 7 7 5.25L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  const icon =
    app?.id === "webhook" ? (
      <WebhookIcon />
    ) : app?.id === "email" ? (
      <EmailIcon />
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
