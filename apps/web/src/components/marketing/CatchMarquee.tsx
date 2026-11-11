"use client";

import { VelocityMarquee } from "@/components/motion/interactive";

const PATTERNS = [
  "Someone else's licence number",
  "Stolen ISO certificates",
  "Photos from another factory",
  "A trader posing as a factory",
  "Payment to a personal account",
  "100% upfront",
  "A flat posing as a plant",
  "Domains registered last week",
  "Crypto and wire services",
];

const CHECKS = [
  "Corporate registries",
  "Customs and trade logs",
  "Certificate directories",
  "Map survey of the address",
  "Reverse-image search",
  "Who really owns the website",
  "Public complaints",
];

function Item({ text, tone }: { text: string; tone: "risk" | "check" }) {
  return (
    <span className="flex items-center gap-6 pr-6">
      <span className="text-[clamp(1.4rem,2.6vw,2.2rem)] font-semibold tracking-[-0.035em] whitespace-nowrap text-bone-100">{text}</span>
      <span className={tone === "risk" ? "size-2 rotate-45 bg-stop-400" : "size-2 rounded-full bg-brand-400"} aria-hidden />
    </span>
  );
}

/** Two counter-running rows: what fraudulent suppliers do, and what ProofBeforePay checks. They speed up with scrolling. */
export function CatchMarquee() {
  return (
    <section className="relative border-y border-white/[0.06] bg-ink-900/40 py-8" aria-label="What ProofBeforePay looks for">
      <div className="mask-fade-x space-y-5">
        <VelocityMarquee seconds={60}>
          {PATTERNS.map((text) => (
            <Item key={text} text={text} tone="risk" />
          ))}
        </VelocityMarquee>
        <VelocityMarquee seconds={70} reverse className="opacity-60">
          {CHECKS.map((text) => (
            <Item key={text} text={text} tone="check" />
          ))}
        </VelocityMarquee>
      </div>
    </section>
  );
}
