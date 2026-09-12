import Link from "next/link";
import { Appbar } from "../components/Appbar";
import { AppIcon } from "../components/AppIcon";

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fffdf9]">
      <Appbar />
      <section className="relative border-b border-[#e3ded8] px-5 pb-24 pt-20 text-center">
        <div className="absolute left-[-90px] top-20 h-64 w-64 rounded-full bg-[#ffe6d8] blur-3xl" />
        <div className="absolute right-[-80px] top-10 h-72 w-72 rounded-full bg-[#e6e0ff] blur-3xl" />
        <div className="relative mx-auto max-w-4xl">
          <span className="inline-flex rounded-full border border-[#d8d1ca] bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em]">Automation that keeps moving</span>
          <h1 className="mt-7 text-5xl font-black leading-[0.98] tracking-[-0.055em] sm:text-7xl">Turn every webhook into work that gets done.</h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#6d6660]">Build dependable workflows in minutes. Catch an event, send an email, transfer SOL—and let the system handle every step in order.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="rounded-xl bg-[#ff4f00] px-7 py-4 font-bold text-white shadow-lg shadow-orange-200 hover:bg-[#d94100]">Build your first workflow →</Link>
            <Link href="/login" className="rounded-xl border border-[#bdb5ae] bg-white px-7 py-4 font-bold hover:bg-[#f7f5f2]">Open workspace</Link>
          </div>
        </div>
        <div className="soft-shadow relative mx-auto mt-16 max-w-3xl rounded-2xl border border-[#d8d1ca] bg-white p-5 sm:p-8">
          <div className="mb-7 flex items-center justify-between border-b border-[#eee9e4] pb-4 text-left"><div><div className="font-bold">Payment follow-up</div><div className="text-xs text-[#7d756f]">A simple 3-step workflow</div></div><span className="rounded-full bg-[#dff7e8] px-3 py-1 text-xs font-bold text-[#126b38]">Live</span></div>
          <div className="flex flex-col items-center sm:flex-row sm:justify-center"><WorkflowPreview id="webhook" name="Webhook" label="When this happens" /><Connector /><WorkflowPreview id="email" name="Email" label="Then do this" /><Connector /><WorkflowPreview id="solana" name="Solana" label="And finally" /></div>
        </div>
      </section>
      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">How it works</p><h2 className="mt-3 text-4xl font-black tracking-[-0.045em]">From event to outcome, without the busywork.</h2></div>
          <div className="grid gap-4 sm:grid-cols-3">{[["01","Catch","Receive JSON from any app using your unique webhook URL."],["02","Configure","Map payload values into email or Solana action fields."],["03","Run","Kafka workers process every action asynchronously and in order."]].map(([n,title,copy]) => <div key={n} className="rounded-2xl border border-[#e3ded8] bg-white p-6"><span className="text-xs font-bold text-[#ff4f00]">{n}</span><h3 className="mt-8 text-xl font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#6d6660]">{copy}</p></div>)}</div>
        </div>
      </section>
      <section id="apps" className="bg-[#2d2525] px-5 py-20 text-white">
        <div className="mx-auto max-w-6xl text-center"><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff8b58]">Available now</p><h2 className="mt-3 text-4xl font-black tracking-[-0.04em]">Three focused building blocks.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">{[{id:"webhook",name:"Webhooks",text:"Trigger workflows from any JSON POST request."},{id:"email",name:"Email",text:"Send a templated message through your SMTP account."},{id:"solana",name:"Solana",text:"Transfer SOL to a payload-driven wallet address."}].map(app => <div key={app.id} className="rounded-2xl border border-white/15 bg-white/5 p-7 text-left"><AppIcon app={app} size="lg"/><h3 className="mt-5 text-xl font-bold">{app.name}</h3><p className="mt-2 text-sm leading-6 text-white/65">{app.text}</p></div>)}</div>
        </div>
      </section>
      <footer className="flex flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-[#6d6660] sm:flex-row"><strong className="text-[#2d2525]">flowforge</strong><span>Webhook automation, built for this stack.</span></footer>
    </main>
  );
}

function WorkflowPreview({ id, name, label }: { id: string; name: string; label: string }) { return <div className="flex w-full items-center gap-3 rounded-xl border border-[#e3ded8] p-4 text-left sm:w-48"><AppIcon app={{ id, name }} /><div><div className="text-[10px] font-bold uppercase tracking-wide text-[#8d8580]">{label}</div><div className="mt-1 font-bold">{name}</div></div></div>; }
function Connector() { return <div className="h-7 w-px bg-[#bdb5ae] sm:h-px sm:w-8" />; }
