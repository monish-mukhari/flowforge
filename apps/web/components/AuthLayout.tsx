import Link from "next/link";
import { Brand } from "./Brand";

export function AuthLayout({
  mode,
  children,
}: {
  mode: "login" | "signup";
  children: React.ReactNode;
}) {
  const login = mode === "login";
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#2d2525] p-12 text-white lg:flex lg:flex-col">
        <Brand inverse />
        <div className="my-auto max-w-xl">
          <span className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff8b58]">
            Build once. Run automatically.
          </span>
          <h1 className="mt-5 text-5xl font-black leading-[1.02] tracking-[-0.05em]">
            Your next repetitive task should be your last.
          </h1>
          <p className="mt-6 text-lg leading-8 text-white/65">
            Connect webhooks to real actions with a visual workflow builder and
            a durable event pipeline underneath.
          </p>
        </div>
        <div className="flex gap-6 text-sm text-white/55">
          <span>Webhook triggers</span>
          <span>Ordered actions</span>
          <span>Durable delivery</span>
        </div>
      </section>
      <section className="flex flex-col bg-[#fffdf9] p-5 sm:p-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden">
            <Brand />
          </div>
          <p className="text-sm text-[#6d6660]">
            {login ? "New here?" : "Already have an account?"}{" "}
            <Link
              className="font-bold text-[#503eb6] hover:underline"
              href={login ? "/signup" : "/login"}
            >
              {login ? "Create an account" : "Log in"}
            </Link>
          </p>
        </div>
        <div className="m-auto w-full max-w-md py-12">{children}</div>
      </section>
    </main>
  );
}
