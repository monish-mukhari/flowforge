"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "../../components/AuthLayout";
import { FormField } from "../../components/FormField";
import { api, getErrorMessage } from "../../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get(
      "verificationToken",
    );
    if (token)
      api
        .post("/api/v1/user/verify-email", { token })
        .then(() => setError("Email verified. You can now log in."))
        .catch((caught) => setError(getErrorMessage(caught)));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/v1/user/signin", { username: email, password });
      router.push("/dashboard");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout mode="login">
      <div className="fade-up">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
          Welcome back
        </p>
        <h2 className="mt-2 text-4xl font-black tracking-[-0.045em]">
          Log in to your workspace
        </h2>
        <p className="mt-3 text-[#6d6660]">
          Pick up where your automations left off.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <FormField
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <FormField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
          {error && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {error}
            </div>
          )}
          <div className="text-right">
            <a
              href="/forgot-password"
              className="text-sm font-semibold text-[#503eb6] hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <button
            disabled={loading}
            className="w-full rounded-xl bg-[#503eb6] px-5 py-3.5 font-bold text-white hover:bg-[#42319f] disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
