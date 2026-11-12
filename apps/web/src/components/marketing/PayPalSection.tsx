"use client";

import { Ban, Lock, PackageCheck, ScanSearch, Sparkles, Undo2, Wallet } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Accent, SectionHeading } from "@/components/marketing/Section";
import { cx } from "@/lib/cx";

const GATES = [
  {
    verdict: "Proceed",
    icon: Wallet,
    title: "Pay now",
    api: "Orders v2 · intent CAPTURE",
    body: "Paid straight to the supplier's own PayPal account, so the deposit keeps PayPal Purchase Protection. Add the shipment's tracking to the transaction later.",
    tone: "border-brand-500/30 bg-brand-500/[0.06] text-brand-200",
  },
  {
    verdict: "Verify first",
    icon: Lock,
    title: "Hold until proven",
    api: "Orders v2 · intent AUTHORIZE",
    body: "PayPal reserves the money in the buyer's account and sends nothing. The supplier's proof is reviewed by AI against the report's open questions before anything moves.",
    tone: "border-caution-400/35 bg-caution-400/[0.06] text-caution-200",
  },
  {
    verdict: "Stop",
    icon: Ban,
    title: "Payment blocked",
    api: "No order is ever created",
    body: "The server refuses to start a payment to a supplier the investigation stopped. Only a fresh check with new evidence can unlock it.",
    tone: "border-stop-500/30 bg-stop-500/[0.06] text-stop-200",
  },
] as const;

const FLOW = [
  { icon: Lock, title: "Hold placed", text: "Buyer approves on PayPal; funds are authorized, not sent" },
  { icon: ScanSearch, title: "Supplier sends proof", text: "Licence, bank letter, utility bill: pasted into the report" },
  { icon: Sparkles, title: "AI + rules review", text: "Nemotron Super checks each open question; payment rules have the last word" },
  { icon: PackageCheck, title: "Release or cancel", text: "Capture the authorization, or void it and the money never left" },
] as const;

/** How the verdict gates the deposit through PayPal: pay, hold or block, and the hold's release loop. */
export function PayPalSection() {
  return (
    <section id="paypal" className="relative scroll-mt-20 py-28 sm:py-36">
      <div className="pointer-events-none absolute inset-x-0 top-10 -z-10 mx-auto h-[60%] max-w-5xl rounded-full bg-sky-glow/10 blur-[120px]" aria-hidden />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="$"
          label="Pay with proof · PayPal"
          title={
            <>
              Your deposit only moves when the <Accent>proof</Accent> does.
            </>
          }
          lede="The verdict isn't advice you can ignore under deadline pressure. It decides what PayPal is allowed to do with your money, and the server enforces it."
        />

        <Reveal className="mt-14 grid gap-4 md:grid-cols-3" selector=":scope > *" stagger={0.12} y={30}>
          {GATES.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.verdict} className="panel spot flex flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", g.tone)}>
                    <Icon className="size-3.5" aria-hidden />
                    {g.verdict}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.12em] text-bone-500 uppercase">{g.api}</span>
                </div>
                <p className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-bone-50">{g.title}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-bone-400">{g.body}</p>
              </div>
            );
          })}
        </Reveal>

        <Reveal y={30} delay={0.1}>
          <div className="panel relative mt-6 overflow-hidden p-6 sm:p-8">
            <p className="font-mono text-[11px] tracking-[0.16em] text-bone-500 uppercase">The hold, step by step</p>
            <div className="relative mt-6">
              <div className="absolute top-6 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-brand-400/0 via-brand-400/50 to-brand-400/0 md:block" aria-hidden />
              <div className="pp-token absolute top-[18px] left-[12%] hidden size-3 rounded-full bg-sky-glow shadow-[0_0_0_6px_rgba(56,189,248,0.18),0_0_24px_rgba(14,165,233,0.8)] md:block" aria-hidden />
              <ol className="relative grid gap-6 md:grid-cols-4">
                {FLOW.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.title} className="flex flex-col items-start md:items-center md:text-center">
                      <span className="grid size-12 place-items-center rounded-2xl bg-ink-900 text-brand-300 shadow-[0_10px_30px_-16px_rgba(14,120,200,0.7)] ring-1 ring-white/[0.1]">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="mt-3 font-mono text-[10px] tracking-[0.14em] text-bone-500">0{i + 1}</span>
                      <p className="mt-1 text-[15px] font-semibold text-bone-50">{s.title}</p>
                      <p className="mt-1 max-w-[16rem] text-sm leading-relaxed text-bone-400">{s.text}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
            <p className="mt-8 flex items-start gap-2 rounded-xl bg-sky-mist/60 px-4 py-3 text-sm text-brand-200">
              <Undo2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              A reply that asks for Friends &amp; Family, a gift payment, crypto or a different account holder can never clear a release, whatever the
              model concludes. Code has the last word on money.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
