"use client";

import { Reveal, TextScrub } from "@/components/motion/reveal";
import { cx } from "@/lib/cx";
import { SectionHeading } from "@/components/marketing/Section";

const HOPS = [
  { tag: "Registry", text: "The licence number on the invoice belongs to Dongguan Hengli Garments, not the supplier.", tone: "text-stop-300" },
  { tag: "Customs", text: "Hengli exports hoodies. Brightstar, the supplier, has no records at all.", tone: "text-caution-300" },
  { tag: "Photos", text: "The factory photos are on Hengli's website, and a map survey puts Brightstar's address in a block of flats.", tone: "text-stop-300" },
];

export function StatSection() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <div className="pointer-events-none absolute top-1/3 -left-40 size-[38rem] rounded-full bg-stop-500/[0.06] blur-[140px]" aria-hidden />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading index="02" label="Why it matters" title="One search can't catch a middleman. A chain of them can." />

        <Reveal as="ol" selector="li" stagger={0.1} className="mt-16 grid gap-4 lg:grid-cols-3">
          {HOPS.map((hop, i) => (
            <li key={hop.tag} className="panel p-7">
              <p className="font-mono text-[11px] tracking-[0.14em] text-bone-500 uppercase">
                Hop {i + 1} · {hop.tag}
              </p>
              <p className={cx("mt-4 text-lg leading-snug font-medium tracking-[-0.02em]", hop.tone)}>{hop.text}</p>
            </li>
          ))}
        </Reveal>
        <p className="mt-4 text-xs text-bone-500">An illustrative case with made-up companies. Each hop was opened by the finding before it.</p>

        <TextScrub
          className="mt-28 max-w-5xl text-[clamp(1.6rem,3.3vw,2.9rem)] leading-[1.15] font-medium tracking-[-0.035em] text-bone-50"
          text="Fraudsters don't need you to believe everything. They need *one small step:* a deposit by wire, to an account you can't check. ProofBeforePay checks the supplier before you take it."
        />
      </div>
    </section>
  );
}
