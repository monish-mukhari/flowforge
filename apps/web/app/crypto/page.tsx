"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/DashboardShell";
import { api, getErrorMessage } from "../../lib/api";

type Wallet = { publicKey: string; network: string; balanceSol: number };

export default function CryptoPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/v1/user/solana-wallet")
      .then((response) => setWallet(response.data.wallet))
      .catch((caught) => setError(getErrorMessage(caught)));
  }, []);

  async function createWallet() {
    setBusy(true);
    setError("");
    try {
      const response = await api.post("/api/v1/user/solana-wallet");
      setWallet({ ...response.data.wallet, balanceSol: 0 });
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 md:px-8 md:py-10">
        <header className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7c3aed]">
            Crypto settings
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
            Solana wallet
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6660] sm:text-base">
            Manage the dedicated devnet wallet used by your Solana workflow
            actions. Signing credentials always remain encrypted server-side.
          </p>
        </header>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!wallet ? (
          <section className="relative mt-8 overflow-hidden rounded-3xl border border-[#ddd3f5] bg-white p-7 shadow-[0_12px_40px_rgba(50,35,65,0.06)] sm:p-10">
            <div className="pointer-events-none absolute right-[-80px] top-[-100px] h-72 w-72 rounded-full bg-[#eadcff] blur-3xl" />
            <div className="relative max-w-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#17131d] text-lg font-bold text-white">
                S
              </div>
              <h2 className="mt-6 text-2xl font-bold tracking-[-0.03em]">
                Create your execution wallet
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#6d6660]">
                Create a dedicated devnet wallet to enable SOL transfers in
                automations. Fund it with devnet SOL before publishing a
                transfer workflow.
              </p>
              <button
                type="button"
                onClick={() => void createWallet()}
                disabled={busy}
                className="mt-7 rounded-xl bg-[#2d2525] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#171313] disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create Solana wallet"}
              </button>
            </div>
          </section>
        ) : (
          <section className="mt-8 grid gap-5 lg:grid-cols-[1.45fr_0.75fr]">
            <div className="rounded-2xl border border-[#e3ded8] bg-white p-6 shadow-[0_3px_14px_rgba(45,37,37,0.035)] sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8d8580]">
                    Execution wallet
                  </p>
                  <h2 className="mt-1 text-xl font-bold">Wallet details</h2>
                </div>
                <span className="rounded-full bg-[#e3f8eb] px-3 py-1 text-xs font-semibold capitalize text-[#168047]">
                  {wallet.network}
                </span>
              </div>
              <p className="mt-7 text-xs font-bold uppercase tracking-[0.12em] text-[#8d8580]">
                Public address
              </p>
              <div className="mt-2 break-all rounded-xl border border-[#ebe7e2] bg-[#f8f7f5] p-4 font-mono text-sm leading-6 text-[#4c3b71]">
                {wallet.publicKey}
              </div>
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#f4f1fa] p-4 text-xs leading-5 text-[#625571]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white font-bold text-[#6d28d9]">
                  i
                </span>
                Only the public address is shown. The encrypted signing key is
                managed securely by FlowForge.
              </div>
            </div>

            <div className="rounded-2xl bg-[#282123] p-6 text-white shadow-[0_12px_35px_rgba(45,37,37,0.14)] sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                Available balance
              </p>
              <div className="mt-4 text-4xl font-bold tracking-[-0.04em]">
                {wallet.balanceSol.toFixed(4)}
                <span className="ml-2 text-lg text-white/55">SOL</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Devnet funds available for workflow transfers.
              </p>
              <a
                href={`https://explorer.solana.com/address/${wallet.publicKey}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
              >
                View on Explorer ↗
              </a>
            </div>
          </section>
        )}
      </main>
    </DashboardShell>
  );
}
