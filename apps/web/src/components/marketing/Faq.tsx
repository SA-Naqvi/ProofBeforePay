"use client";

import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal } from "@/components/motion/reveal";
import { cx } from "@/lib/cx";
import { Accent, SectionHeading } from "./Section";

const QUESTIONS = [
  {
    q: "What does it cost?",
    a: "Each check uses one credit. You buy credits in packs through PayPal, they never expire, and a check that fails is refunded automatically. In the test (sandbox) setup no real money moves.",
  },
  {
    q: "Can it prove a supplier is a fraud?",
    a: "No, and it never claims to. It finds risk signals in public evidence: registry records, customs logs, certificate directories, the map and the paperwork itself. That's why there are three answers, and why every report tells you what to check yourself.",
  },
  {
    q: "Do you keep the invoice I paste?",
    a: "It's saved so your report link keeps working. If you're signed in, it's tied to your account and you can delete it, with everything else, from Settings. Leave out your own passwords and bank details; they're never needed.",
  },
  {
    q: "Why did a genuine supplier get Verify first?",
    a: "Usually because something important couldn't be confirmed, like a certificate that isn't in any public directory. Verify first means \"probably fine, check this one thing\". The report's \"What would change this verdict\" section says exactly what.",
  },
  {
    q: "Which AI models does it use?",
    a: "Three NVIDIA Nemotron 3 models on Nebius Token Factory: Nano for reading the pages each lookup returns, Super for proposing extra lookups and for challenging the verdict, and Ultra once per check for the final judgement.",
  },
  {
    q: "Is a trading company treated as a fraud?",
    a: "No. Plenty of honest exporters are traders. The risk it looks for is a trader or middleman posing as a factory, a borrowed licence, borrowed photos, or a deposit going to someone other than the company.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading
          index="02"
          label="Questions"
          title={
            <>
              Asked <Accent>often.</Accent>
            </>
          }
          lede="If yours isn't here, the form above reaches a person."
        />
        <Reveal as="div" selector="[data-faq]" stagger={0.06} className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {QUESTIONS.map((item, i) => (
            <div key={item.q} data-faq>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="group flex w-full items-center justify-between gap-6 py-5 text-left"
              >
                <span className={cx("text-lg font-semibold tracking-[-0.02em] transition-colors", open === i ? "text-bone-50" : "text-bone-200 group-hover:text-bone-50")}>{item.q}</span>
                <motion.span animate={{ rotate: open === i ? 45 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 24 }} className="grid size-8 shrink-0 place-items-center rounded-full border border-white/[0.1] text-bone-300">
                  <Plus className="size-4" aria-hidden />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                    <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-bone-400">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
