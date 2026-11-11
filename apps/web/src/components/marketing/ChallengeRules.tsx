"use client";

import { ArrowRight, Ban, CircleCheck, Link2Off, Quote, ShieldOff, Swords, TriangleAlert, Undo2 } from "lucide-react";
import { Tilt } from "@/components/motion/interactive";
import { Reveal } from "@/components/motion/reveal";
import { Accent, SectionHeading } from "./Section";

const OUTCOMES = [
  {
    icon: CircleCheck,
    tone: "text-brand-300 border-brand-500/25 bg-brand-500/[0.06]",
    title: "Super agrees",
    rule: "The verdict stands as it is.",
    body: "It still lists what would change the answer and how you can check that yourself.",
  },
  {
    icon: TriangleAlert,
    tone: "text-caution-300 border-caution-400/25 bg-caution-400/[0.06]",
    title: "Super has serious doubt",
    rule: "Confidence drops by 15.",
    body: "The decision stays, but the report says why the challenger isn't sure, with citations.",
  },
  {
    icon: Undo2,
    tone: "text-sand-200 border-sand-300/25 bg-sand-300/[0.06]",
    title: "The models disagree",
    rule: "The answer becomes Verify first.",
    body: "When two models looking at the same evidence disagree, the safe answer is to check before acting.",
  },
  {
    icon: Ban,
    tone: "text-stop-300 border-stop-500/25 bg-stop-500/[0.06]",
    title: "…but hard red flags keep a Stop",
    rule: "A licence that belongs to someone else is a fact, not an opinion.",
    body: "No web page or second opinion can argue away a payment to a personal account, a mismatched registration or a borrowed certificate.",
  },
];

const GUARDRAILS = [
  { icon: ShieldOff, title: "No Proceed with a hard red flag", body: "Payment to the wrong account, a mismatched licence or certificate, a factory in a residential block, or text that tries to instruct an AI checker." },
  { icon: Quote, title: "Quotes must be real", body: "A quote only appears if it's found word for word in the page it cites. Made-up citations are dropped." },
  { icon: Swords, title: "Findings get audited", body: "Super checks each of Ultra's findings against its sources and marks any that claim more than they say." },
  { icon: Link2Off, title: "Pages are never opened here", body: "Listing links are read through Tavily and photos are traced by Google, so neither you nor our server ever loads them." },
];

/** The second-opinion step and the rules that code enforces on the models. */
export function ChallengeRules() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="05"
          label="The challenge"
          title={
            <>
              Every verdict has to <Accent>survive</Accent> a second opinion.
            </>
          }
          lede="After Nemotron Ultra decides, Nemotron Super runs its own searches to prove it wrong. Super names the decision it thinks is right; plain code, not either model, decides what that changes."
        />
        <Reveal as="div" selector="[data-rule]" stagger={0.1} className="mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {OUTCOMES.map(({ icon: Icon, tone, title, rule, body }, i) => (
            <div key={title} data-rule className="relative">
              <Tilt max={5} className="spot panel h-full p-6">
                <span className={`grid size-11 place-items-center rounded-2xl border ${tone}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="mt-5 font-mono text-[10.5px] tracking-[0.16em] text-bone-500 uppercase">Case {i + 1}</p>
                <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-bone-50">{title}</h3>
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-bone-100">
                  <ArrowRight className="size-3.5 text-brand-300" aria-hidden />
                  {rule}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-bone-400">{body}</p>
              </Tilt>
            </div>
          ))}
        </Reveal>

        <div className="mt-24">
          <SectionHeading
            index="06"
            label="Rules in code"
            title={
              <>
                Where the models <Accent>don&apos;t</Accent> get the last word.
              </>
            }
          />
          <Reveal as="div" selector="[data-guard]" stagger={0.08} className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.06] md:grid-cols-2">
            {GUARDRAILS.map(({ icon: Icon, title, body }) => (
              <div key={title} data-guard className="group bg-ink-950 p-7 transition-colors duration-500 hover:bg-ink-900">
                <Icon className="size-5 text-bone-500 transition-colors duration-500 group-hover:text-brand-300" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-bone-50">{title}</h3>
                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-bone-400">{body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
