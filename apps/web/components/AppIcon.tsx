import type { AppOption } from "../lib/types";

const colors: Record<string, string> = {
  webhook: "bg-[#6e52ff]",
  email: "bg-[#e84d3c]",
  solana: "bg-[#171717]",
};

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
  const label =
    app?.id === "webhook"
      ? "↗"
      : app?.id === "email"
        ? "✉"
        : app?.id === "solana"
          ? "S"
          : "+";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white ${dimension} ${colors[app?.id || ""] || "bg-[#8d8580]"}`}
      aria-label={app?.name || "App"}
    >
      {label}
    </span>
  );
}
