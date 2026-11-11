"use client";

import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Accent, SectionHeading } from "@/components/marketing/Section";

const PRINCIPLES = [
  {
    title: "Missing evidence isn't proof of fraud.",
    body: "If a registry, customs log or certificate directory has nothing on a company, the claim is marked inconclusive. A lookup that couldn't run is shown as not checked. Neither is ever counted as contradicted.",
  },
  {
    title: "Quotes are checked against the page.",
    body: "A quote only appears in the report if those exact words are on the source it cites.",
  },
  {
    title: "Hard red flags can't get a green light.",
    body: "If the deposit goes to a personal account, or a licence or certificate belongs to someone else, a rule in code blocks a Proceed verdict, whatever the model says.",
  },
  {
    title: "Signals, not accusations.",
    body: "It never calls a company or a person a fraud. When a real factory's licence or photos are being borrowed, that factory isn't the one at fault.",
  },
];

/** Editorial list; on hover a green panel wipes up behind the row and the text flips to ink. */
export function Principles({ index = "06" }: { index?: string }) {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index={index}
          label="Honest by design"
          title={
            <>
              Built to be <Accent>careful</Accent>, not just confident.
            </>
          }
          lede="A wrong “this is a fraud” can cost you a good supplier. A wrong “looks fine” can cost you the deposit. These rules are enforced in code."
        />
        <Reveal as="ol" selector="li" stagger={0.08} className="mt-16 border-t border-white/[0.08]">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className="group relative overflow-hidden border-b border-white/[0.08]">
              <span
                className="absolute inset-0 origin-bottom scale-y-0 bg-brand-500 transition-transform duration-700 ease-out-expo group-hover:scale-y-100"
                aria-hidden
              />
              <div className="relative grid gap-3 px-2 py-8 transition-colors duration-500 sm:grid-cols-[90px_1.1fr_1fr_40px] sm:items-center sm:gap-8 sm:px-4">
                <span className="font-mono text-sm text-bone-600 transition-colors duration-500 group-hover:text-ink-900">0{i + 1}</span>
                <p className="text-[clamp(1.4rem,2.6vw,2.1rem)] leading-[1.1] font-semibold tracking-[-0.035em] text-bone-50 transition-colors duration-500 group-hover:text-ink-950">
                  {p.title}
                </p>
                <p className="text-[15px] leading-relaxed text-bone-400 transition-colors duration-500 group-hover:text-ink-900">{p.body}</p>
                <ArrowUpRight
                  className="hidden size-6 text-bone-600 transition-all duration-500 group-hover:rotate-45 group-hover:text-ink-950 sm:block"
                  aria-hidden
                />
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
