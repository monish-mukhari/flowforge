import Link from "next/link";
import { Appbar } from "../components/Appbar";
import { AppIcon } from "../components/AppIcon";

const apps = [
  { id: "slack", name: "Slack" },
  { id: "email", name: "Gmail" },
  { id: "google-sheets", name: "Google Sheets" },
  { id: "http", name: "HTTP" },
  { id: "solana", name: "Solana" },
];

const features = [
  {
    number: "01",
    title: "Trigger on your terms",
    copy: "Start with a webhook, a schedule, or a changing API. FlowForge is ready the moment your work is.",
    icon: "webhook",
  },
  {
    number: "02",
    title: "Shape every step",
    copy: "Transform data, add conditions, branch paths, and connect the tools your process already uses.",
    icon: "branch",
  },
  {
    number: "03",
    title: "See what happened",
    copy: "Follow every run from trigger to result. Inspect attempts, retry failures, and replay with confidence.",
    icon: "polling",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfaf8] [font-family:var(--font-geist-sans)]">
      <Appbar />

      <section className="relative px-5 pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[520px] max-w-7xl bg-[radial-gradient(circle_at_72%_35%,rgba(192,38,211,0.12),transparent_35%),radial-gradient(circle_at_20%_15%,rgba(124,58,237,0.09),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20">
          <div className="max-w-2xl text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ded8d2] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#5f5752] shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7c3aed]" />
              Automation you can actually follow
            </div>
            <h1 className="mt-7 text-[3.25rem] font-semibold leading-[0.98] tracking-[-0.06em] text-[#241f20] sm:text-7xl lg:text-[5rem]">
              Move work forward, automatically.
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-lg leading-8 text-[#6d6660] lg:mx-0">
              Build reliable workflows from triggers, logic, and the apps you
              already use—then see every run from start to finish.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-[#2d2525] px-6 py-3.5 font-semibold text-white shadow-[0_8px_24px_rgba(45,37,37,0.16)] transition hover:-translate-y-0.5 hover:bg-[#171313]"
              >
                Start building free
                <ArrowRight />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-[#d8d1ca] bg-white px-6 py-3.5 font-semibold text-[#2d2525] transition hover:border-[#aaa19a] hover:bg-[#f7f5f2]"
              >
                See how it works
              </a>
            </div>
            <p className="mt-5 text-sm text-[#817972]">
              No credit card required · Set up in minutes
            </p>
          </div>

          <WorkflowPreview />
        </div>
      </section>

      <section className="border-y border-[#e7e2dd] bg-white px-5 py-7">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <p className="text-center text-sm font-medium text-[#817972] md:text-left">
            Connect the tools that keep your business moving
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            {apps.map((app) => (
              <div key={app.id} className="flex items-center gap-2.5">
                <AppIcon app={app} size="sm" />
                <span className="text-sm font-semibold text-[#4f4945]">
                  {app.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-5 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7c3aed]">
              One clear flow
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-[#241f20] sm:text-5xl">
              From signal to outcome.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#6d6660]">
              Everything you need to build, run, and understand your
              automations—without the usual operational fog.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.number}
                className="group rounded-2xl border border-[#e3ded8] bg-white p-7 transition duration-200 hover:-translate-y-1 hover:border-[#cfc6dc] hover:shadow-[0_16px_40px_rgba(50,35,65,0.08)] sm:p-8"
              >
                <div className="flex items-center justify-between">
                  <AppIcon
                    app={{ id: feature.icon, name: feature.title }}
                    size="lg"
                  />
                  <span className="text-sm font-semibold text-[#a39a94]">
                    {feature.number}
                  </span>
                </div>
                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.025em] text-[#2d2525]">
                  {feature.title}
                </h3>
                <p className="mt-3 leading-7 text-[#6d6660]">{feature.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="reliability" className="px-5 pb-20 sm:pb-24">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] bg-[#282123] text-white lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-center px-7 py-12 sm:px-12 lg:px-14 lg:py-16">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d9b8ff]">
              Built for real work
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Reliable when it matters.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-white/65">
              Publishing is only the beginning. FlowForge keeps execution
              ordered, failures visible, and every workflow recoverable.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex w-fit items-center font-semibold text-white underline decoration-white/30 underline-offset-8 transition hover:decoration-white"
            >
              Build your first workflow
              <ArrowRight />
            </Link>
          </div>

          <div className="grid gap-px bg-white/10 sm:grid-cols-2">
            {[
              ["01", "Automatic retries", "Temporary failures recover without manual work."],
              ["02", "Complete run history", "Inspect every step, input, attempt, and result."],
              ["03", "Version-safe replay", "Replay against the exact workflow that originally ran."],
              ["04", "Protected connections", "Credentials stay encrypted and sensitive data is redacted."],
            ].map(([number, title, copy]) => (
              <div key={number} className="bg-white/[0.045] p-7 sm:p-8 lg:p-9">
                <span className="text-xs font-semibold text-white/35">{number}</span>
                <h3 className="mt-8 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e7e2dd] bg-white px-5 py-20 text-center sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-4xl font-semibold tracking-[-0.045em] text-[#241f20] sm:text-5xl">
            Your next workflow starts here.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-[#6d6660]">
            Start from scratch or use a template. You can be running in minutes.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-[linear-gradient(115deg,#7c3aed,#c026d3_52%,#ec4899)] px-7 py-3.5 font-semibold text-white shadow-[0_10px_30px_rgba(124,58,237,0.22)] transition hover:-translate-y-0.5"
          >
            Get started free
            <ArrowRight />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#e7e2dd] bg-white px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-[#817972] sm:flex-row">
          <span className="font-semibold text-[#2d2525]">flowforge</span>
          <span>Reliable automation, from trigger to outcome.</span>
        </div>
      </footer>
    </main>
  );
}

function WorkflowPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[500px]">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-[linear-gradient(135deg,rgba(124,58,237,0.15),rgba(236,72,153,0.08))] blur-2xl" />
      <div className="relative rounded-[1.75rem] border border-[#ddd6d0] bg-white p-4 shadow-[0_24px_70px_rgba(54,38,47,0.14)] sm:p-5">
        <div className="flex items-center justify-between border-b border-[#eee9e4] px-1 pb-4">
          <div>
            <p className="text-sm font-semibold text-[#2d2525]">New lead routing</p>
            <p className="mt-1 text-xs text-[#8d8580]">Active · Updated 2m ago</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f8ef] px-2.5 py-1 text-xs font-semibold text-[#17733d]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22a258]" />
            Live
          </span>
        </div>

        <div className="py-5">
          <WorkflowStep id="webhook" name="Webhook" meta="New form submission" state="Trigger" />
          <Connector />
          <WorkflowStep id="filter" name="Qualified lead?" meta="Score is greater than 70" state="Condition" />
          <Connector />
          <WorkflowStep id="slack" name="Notify sales" meta="#new-leads" state="Action" />
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-[#eee9e4] pt-4 text-center">
          {[["1,284", "Runs"], ["99.7%", "Success"], ["1.2s", "Median"]].map(([value, label]) => (
            <div key={label} className="rounded-xl bg-[#f7f5f2] px-2 py-3">
              <p className="text-sm font-semibold text-[#2d2525]">{value}</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-[#938b85]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkflowStep({ id, name, meta, state }: { id: string; name: string; meta: string; state: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-[#e7e2dd] bg-white p-3.5 shadow-[0_3px_12px_rgba(45,37,37,0.04)] sm:p-4">
      <AppIcon app={{ id, name }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[#2d2525]">{name}</p>
        <p className="mt-0.5 truncate text-xs text-[#817972]">{meta}</p>
      </div>
      <span className="rounded-md bg-[#f3f0ed] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#817972]">{state}</span>
    </div>
  );
}

function Connector() {
  return <div className="ml-8 h-6 w-px bg-[#d5cec8]" />;
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="ml-2 h-4 w-4" aria-hidden="true">
      <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
