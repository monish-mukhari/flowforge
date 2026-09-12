import type { ChangeEvent } from "react";

export function FormField({ label, value, onChange, type = "text", placeholder, hint }: { label: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder: string; hint?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span><input required value={value} onChange={onChange} type={type} placeholder={placeholder} className="w-full rounded-xl border border-[#cfc8c1] bg-white px-4 py-3.5 outline-none transition focus:border-[#503eb6] focus:ring-4 focus:ring-[#ebe8ff]" />{hint && <span className="mt-1.5 block text-xs text-[#7d756f]">{hint}</span>}</label>;
}
