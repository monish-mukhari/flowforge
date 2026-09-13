"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "../../components/AuthLayout";
import { FormField } from "../../components/FormField";
import { api, getErrorMessage } from "../../lib/api";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) throw new Error("Missing reset token");
      await api.post("/api/v1/user/reset-password", { token, password });
      router.push("/login?reset=1");
    } catch (caught) {
      setError(getErrorMessage(caught));
      setLoading(false);
    }
  }
  return (
    <AuthLayout mode="login">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
          Account recovery
        </p>
        <h2 className="mt-2 text-4xl font-black">Choose a new password</h2>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <FormField
            label="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 10 characters"
            hint="Use 10 or more characters."
          />
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-[#503eb6] px-5 py-3.5 font-bold text-white disabled:opacity-60"
          >
            {loading ? "Resetting…" : "Reset password"}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
