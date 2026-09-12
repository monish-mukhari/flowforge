"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "../../components/AuthLayout";
import { FormField } from "../../components/FormField";
import { api, getErrorMessage } from "../../lib/api";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await api.post("/api/v1/user/signup", { name, username: email, password }); router.push("/login?created=1"); }
    catch (caught) { setError(getErrorMessage(caught)); } finally { setLoading(false); }
  }

  return <AuthLayout mode="signup"><div className="fade-up"><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">Get started free</p><h2 className="mt-2 text-4xl font-black tracking-[-0.045em]">Create your workspace</h2><p className="mt-3 text-[#6d6660]">Your first automated workflow is a few clicks away.</p>
    <form onSubmit={submit} className="mt-8 space-y-5"><FormField label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Monish Mukhari" /><FormField label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /><FormField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" hint="Use 6 or more characters." />{error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}<button disabled={loading} className="w-full rounded-xl bg-[#ff4f00] px-5 py-3.5 font-bold text-white hover:bg-[#d94100] disabled:opacity-60">{loading ? "Creating account…" : "Create free account"}</button></form>
  </div></AuthLayout>;
}
