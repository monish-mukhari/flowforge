"use client";

import { FormEvent, useState } from "react";
import { AuthLayout } from "../../components/AuthLayout";
import { FormField } from "../../components/FormField";
import { api, getErrorMessage } from "../../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.post("/api/v1/user/forgot-password", {
        username: email,
      });
      setMessage(response.data.message);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthLayout mode="login">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
          Account recovery
        </p>
        <h2 className="mt-2 text-4xl font-black">Reset your password</h2>
        <p className="mt-3 text-[#6d6660]">
          We will send a one-hour reset link if the account exists.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <FormField
            label="Email address"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
          {message && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {message}
            </div>
          )}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-[#503eb6] px-5 py-3.5 font-bold text-white disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
