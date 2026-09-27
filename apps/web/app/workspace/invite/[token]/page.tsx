"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import { Brand } from "../../../../components/Brand";
import { api, getErrorMessage } from "../../../../lib/api";

export default function WorkspaceInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [message, setMessage] = useState(
    "You’ve been invited to join a workspace.",
  );
  const [busy, setBusy] = useState(false);
  const returnPath = `/workspace/invite/${params.token}`;
  async function accept() {
    setBusy(true);
    try {
      await api.post(
        `/api/v1/organizations/invitations/${params.token}/accept`,
      );
      setMessage("Invitation accepted. Welcome to the workspace!");
      setTimeout(() => router.push("/workspace"), 700);
    } catch (caught) {
      if (axios.isAxiosError(caught) && caught.response?.status === 401) {
        router.push(`/login?next=${encodeURIComponent(returnPath)}`);
        return;
      }
      setMessage(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] p-5">
      <section className="w-full max-w-md rounded-2xl border border-[#e3ded8] bg-white p-8 text-center shadow-sm">
        <Brand compact />
        <h1 className="mt-8 text-2xl font-black">Join workspace</h1>
        <p className="mt-3 text-sm leading-6 text-[#6d6660]">{message}</p>
        <button
          onClick={() => void accept()}
          disabled={busy}
          className="mt-7 w-full rounded-xl bg-[#503eb6] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Accepting…" : "Accept invitation"}
        </button>
        <p className="mt-4 text-xs text-[#8d8580]">
          You must be signed in with the invited email address.
        </p>
        <div className="mt-4 flex justify-center gap-4 text-xs font-bold text-[#503eb6]">
          <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>
            Sign in
          </Link>
          <Link href={`/signup?next=${encodeURIComponent(returnPath)}`}>
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
