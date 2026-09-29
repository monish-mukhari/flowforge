import Link from "next/link";
import { Appbar } from "../components/Appbar";
import { AppIcon } from "../components/AppIcon";

const triggers = [
  {
    id: "webhook",
    name: "Webhook",
    text: "Start instantly from a secure JSON endpoint unique to each workflow.",
  },
  {
    id: "schedule",
    name: "Schedule",
    text: "Run recurring jobs on the interval that fits your process.",
  },
  {
    id: "polling",
    name: "Polling",
    text: "Watch an HTTPS API and continue only when its response changes.",
  },
];

const integrations = [
  {
    id: "email",
    name: "Email",
    text: "Send dynamic messages through a reusable SMTP connection.",
  },
  {
    id: "http",
    name: "HTTP Request",
    text: "Call external HTTPS APIs with mapped workflow data.",
  },
  {
    id: "slack",
    name: "Slack",
    text: "Post messages to channels through a connected workspace.",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    text: "Append structured workflow results to a spreadsheet.",
  },
  {
    id: "solana",
    name: "Solana",
    text: "Transfer devnet SOL from an encrypted per-account wallet.",
  },
];

const logicBlocks = [
  ["filter", "Filter", "Continue only when your condition is true."],
  ["branch", "Branch", "Choose a path from workflow data."],
  ["transform", "Transform", "Reshape values for the next action."],
  ["delay", "Delay", "Pause execution before continuing."],
  ["loop", "Loop", "Run an action for every item in a list."],
] as const;

const operations = [
  {
    eyebrow: "See every run",
    title: "Know what happened",
    text: "Filter runs by status, workflow, date, and order. Inspect every step, attempt, input, and sanitized output from one timeline.",
    tone: "bg-[#efeaff]",
  },
  {
    eyebrow: "Built to recover",
    title: "Retry with confidence",
    text: "Leased workers, exponential retries, transactional delivery, and a dead-letter queue keep failures visible and recoverable.",
    tone: "bg-[#e7f7f1]",
  },
  {
    eyebrow: "Safe changes",
    title: "Replay the right version",
    text: "Published definitions are snapshotted with every run, so a replay uses the exact workflow version that originally executed.",
    tone: "bg-[#fff0e8]",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fffdf9]">
      <Appbar />

      <section className="relative border-b border-[#e3ded8] px-5 pb-24 pt-16 sm:pt-20">
        <div className="pointer-events-none absolute left-[-100px] top-10 h-72 w-72 rounded-full bg-[#f0ddff] blur-3xl" />
        <div className="pointer-events-none absolute right-[-90px] top-20 h-80 w-80 rounded-full bg-[#ffddeb] blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="text-center lg:text-left">
            <span className="inline-flex rounded-full border border-[#d8d1ca] bg-white/80 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] backdrop-blur">
              Webhooks · schedules · polling
            </span>
            <h1 className="mt-7 text-5xl font-black leading-[0.98] tracking-[-0.055em] sm:text-7xl">
              Build workflows that keep moving.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#6d6660] lg:mx-0">
              Trigger work from an event, a schedule, or a changing API. Shape
              the data, connect your tools, and follow every step from first run
              to final result.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/signup"
                className="rounded-xl bg-[#ff4f00] px-7 py-4 font-bold text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5 hover:bg-[#d94100]"
              >
                Build your first workflow →
              </Link>
              <a
                href="#capabilities"
                className="rounded-xl border border-[#bdb5ae] bg-white px-7 py-4 font-bold transition hover:bg-[#f7f5f2]"
              >
                Explore capabilities
              </a>
            </div>
            <div className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-bold uppercase tracking-[0.11em] text-[#7d756f] lg:justify-start">
              <span>3 trigger types</span>
              <span>10 action blocks</span>
              <span>Replayable runs</span>
            </div>
          </div>

          <WorkflowCanvas />
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
              How it works
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              From signal to outcome, in one clear flow.
            </h2>
            <p className="mt-5 max-w-md leading-7 text-[#6d6660]">
              Start with a ready-made template or build from scratch. Dynamic
              fields carry data from one step into the next.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [
                "01",
                "Choose a trigger",
                "Receive a webhook, run on a schedule, or watch an API for changes.",
              ],
              [
                "02",
                "Build the flow",
                "Add integrations and logic, then map data with simple template fields.",
              ],
              [
                "03",
                "Publish and observe",
                "Run asynchronously, inspect each attempt, and replay when needed.",
              ],
            ].map(([number, title, copy]) => (
              <div
                key={number}
                className="lift rounded-2xl border border-[#e3ded8] bg-white p-6"
              >
                <span className="text-xs font-bold text-[#ff4f00]">
                  {number}
                </span>
                <h3 className="mt-8 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6d6660]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="capabilities"
        className="border-y border-[#e3ded8] bg-[#f7f5f2] px-5 py-24"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
              Start your way
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
              More than webhook automation.
            </h2>
            <p className="mt-4 leading-7 text-[#6d6660]">
              React instantly, run recurring work, or turn an API change into
              the beginning of a workflow.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {triggers.map((trigger) => (
              <div
                key={trigger.id}
                className="lift rounded-2xl border border-[#e3ded8] bg-white p-7"
              >
                <AppIcon app={trigger} size="lg" />
                <h3 className="mt-6 text-2xl font-bold">{trigger.name}</h3>
                <p className="mt-3 leading-7 text-[#6d6660]">{trigger.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="apps" className="bg-[#2d2525] px-5 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#d8a7ff]">
                Integrations and actions
              </p>
              <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                Connect the tools your workflow needs.
              </h2>
            </div>
            <p className="max-w-md leading-7 text-white/60">
              Reuse encrypted connections for SMTP and HTTP, or connect Slack
              and Google with OAuth.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {integrations.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl border border-white/15 bg-white/5 p-6 text-left transition hover:-translate-y-0.5 hover:bg-white/10"
              >
                <AppIcon app={app} size="lg" />
                <h3 className="mt-5 text-lg font-bold">{app.name}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  {app.text}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-white/15 bg-white/[0.04] p-6 sm:p-8">
            <div className="mb-7 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ffb693]">
                  Workflow logic
                </p>
                <h3 className="mt-2 text-2xl font-bold">
                  Shape what happens between apps.
                </h3>
              </div>
              <span className="text-sm text-white/50">
                Five built-in blocks
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {logicBlocks.map(([id, name, text]) => (
                <div
                  key={id}
                  className="rounded-xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="flex items-center gap-3">
                    <AppIcon app={{ id, name }} size="sm" />
                    <strong>{name}</strong>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-white/55">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="reliability" className="mx-auto max-w-6xl px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
            Operations included
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
            Built for the run after “publish.”
          </h2>
          <p className="mt-4 leading-7 text-[#6d6660]">
            Building is only half the job. FlowForge gives you the history and
            recovery tools to operate every workflow.
          </p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {operations.map((item) => (
            <article
              key={item.title}
              className={`rounded-3xl border border-[#e3ded8] p-7 sm:p-8 ${item.tone}`}
            >
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#6d6660]">
                {item.eyebrow}
              </span>
              <h3 className="mt-8 text-2xl font-black tracking-[-0.03em]">
                {item.title}
              </h3>
              <p className="mt-3 leading-7 text-[#6d6660]">{item.text}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-[#e3ded8] bg-[#e3ded8] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Encrypted", "Stored connection secrets"],
            ["Ordered", "Stage-by-stage execution"],
            ["Idempotent", "Duplicate-safe webhooks"],
            ["Redacted", "Sensitive run data"],
          ].map(([title, copy]) => (
            <div key={title} className="bg-white p-6">
              <strong className="text-lg">{title}</strong>
              <p className="mt-1 text-sm text-[#6d6660]">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#2d2525] px-6 py-14 text-center text-white sm:px-12 sm:py-16">
          <div className="absolute left-[-60px] top-[-80px] h-56 w-56 rounded-full bg-[#7c3aed] opacity-40 blur-3xl" />
          <div className="absolute bottom-[-100px] right-[-40px] h-64 w-64 rounded-full bg-[#ec4899] opacity-35 blur-3xl" />
          <div className="relative">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#d8a7ff]">
              Ready when you are
            </p>
            <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Turn the next signal into a workflow.
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-white/65">
              Start from a template, connect your apps, and publish a workflow
              you can actually observe.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex rounded-xl bg-white px-7 py-4 font-bold text-[#2d2525] transition hover:-translate-y-0.5 hover:bg-[#f5efff]"
            >
              Start building →
            </Link>
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#e3ded8] px-6 py-8 text-sm text-[#6d6660] sm:flex-row">
        <strong className="text-[#2d2525]">flowforge</strong>
        <span>Event-driven automation, from trigger to outcome.</span>
      </footer>
    </main>
  );
}

function WorkflowCanvas() {
  return (
    <div className="soft-shadow relative rounded-3xl border border-[#d8d1ca] bg-white/90 p-5 backdrop-blur sm:p-7">
      <div className="mb-6 flex items-center justify-between border-b border-[#eee9e4] pb-4">
        <div>
          <div className="font-bold">API change alert</div>
          <div className="mt-1 text-xs text-[#7d756f]">
            Published · Version 4
          </div>
        </div>
        <span className="rounded-full bg-[#dff7e8] px-3 py-1 text-xs font-bold text-[#126b38]">
          Live
        </span>
      </div>

      <div className="space-y-0">
        <WorkflowPreview
          id="polling"
          name="Polling"
          label="When the API changes"
          detail="Every 5 minutes"
        />
        <CanvasConnector label="response" />
        <WorkflowPreview
          id="transform"
          name="Transform"
          label="Shape the payload"
          detail="Map 4 fields"
        />
        <CanvasConnector label="result" />
        <WorkflowPreview
          id="slack"
          name="Slack"
          label="Notify the team"
          detail="#operations"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 border-t border-[#eee9e4] pt-5 text-center">
        {[
          ["248", "runs"],
          ["99.2%", "success"],
          ["1.4s", "median"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl bg-[#f7f5f2] px-2 py-3">
            <div className="font-black">{value}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-[#7d756f]">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowPreview({
  id,
  name,
  label,
  detail,
}: {
  id: string;
  name: string;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#e3ded8] bg-white p-4 text-left">
      <AppIcon app={{ id, name }} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#8d8580]">
          {label}
        </div>
        <div className="mt-1 font-bold">{name}</div>
      </div>
      <span className="text-xs text-[#7d756f]">{detail}</span>
    </div>
  );
}

function CanvasConnector({ label }: { label: string }) {
  return (
    <div className="ml-9 flex h-10 items-center gap-2">
      <span className="h-full w-px bg-[#cfc8c1]" />
      <span className="rounded-full bg-[#f1eeea] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#7d756f]">
        {label}
      </span>
    </div>
  );
}
