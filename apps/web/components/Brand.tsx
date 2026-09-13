import Link from "next/link";

export function Brand({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-black tracking-[-0.04em] ${inverse ? "text-white" : "text-[#2d2525]"}`}
    >
      <span className="h-2.5 w-7 rounded-full bg-[#ff4f00]" />
      <span className={compact ? "text-xl" : "text-2xl"}>flowforge</span>
    </Link>
  );
}
