"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { TierBadge } from "@/components/ui";
import { cx } from "@/lib/cx";
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { STAGES } from "@/lib/stages";
import { Accent, SectionHeading } from "@/components/marketing/Section";
import { StageVisual } from "@/components/marketing/StageVisual";

/**
 * Scroll story: the steps scroll past on the right while a sticky screen on the left flips to the matching visual.
 * A beam down the step list fills with scroll progress.
 */
export function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const stage = STAGES[active] ?? STAGES[0]!;

  useGSAP(
    () => {
      const steps = gsap.utils.toArray<HTMLElement>("[data-step]");
      steps.forEach((step, i) => {
        ScrollTrigger.create({
          trigger: step,
          start: "top 58%",
          end: "bottom 58%",
          onToggle: (self) => self.isActive && setActive(i),
        });
      });
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.fromTo(
          "[data-beam-fill]",
          { scaleY: 0 },
          { scaleY: 1, ease: "none", scrollTrigger: { trigger: "[data-steps]", start: "top 58%", end: "bottom 58%", scrub: 0.4 } },
        );
        steps.forEach((step) => {
          gsap.from(step.querySelectorAll("[data-step-copy]"), {
            autoAlpha: 0,
            y: 30,
            duration: 1.1,
            ease: "expo.out",
            stagger: 0.07,
            scrollTrigger: { trigger: step, start: "top 80%", once: true },
          });
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" className="relative scroll-mt-20 py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="03"
          label="How it works"
          title={
            <>
              Five steps, three Nemotron models, and a verdict that has to <Accent>survive</Accent> an argument.
            </>
          }
          lede="Each investigation runs the same five steps, and the middle one loops. Code decides whether sources agree, Tavily and the other lookups bring in the evidence, each Nemotron model gets the work that fits its size, and a second model tries to prove the first one wrong."
        />

        <div className="mt-20 grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div className="hidden min-w-0 lg:block">
            <div className="sticky top-[16vh]">
              <div className="mb-5 flex items-center justify-between font-mono text-[11px] tracking-[0.14em] text-bone-500 uppercase">
                <span>
                  Step <span className="text-bone-50">{String(active + 1).padStart(2, "0")}</span> / {String(STAGES.length).padStart(2, "0")}
                </span>
                <span>{stage.engine}</span>
              </div>
              <div className="relative [perspective:1400px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={stage.key}
                    initial={{ opacity: 0, rotateX: -14, y: 40 }}
                    animate={{ opacity: 1, rotateX: 0, y: 0 }}
                    exit={{ opacity: 0, rotateX: 12, y: -30 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: "50% 100%" }}
                  >
                    <StageVisual stage={stage.key} />
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="mt-6 flex gap-1.5">
                {STAGES.map((s, i) => (
                  <span
                    key={s.key}
                    className={cx("h-1 flex-1 rounded-full transition-colors duration-500", i <= active ? "bg-brand-400" : "bg-white/[0.08]")}
                  />
                ))}
              </div>
            </div>
          </div>

          <ol data-steps className="relative min-w-0">
            <span className="absolute top-3 bottom-3 left-[17px] w-px bg-white/[0.07]" aria-hidden>
              <span
                data-beam-fill
                className="block h-full w-full origin-top bg-gradient-to-b from-brand-300 via-brand-500 to-brand-600 shadow-[0_0_12px_rgba(56,189,248,0.7)]"
              />
            </span>
            {STAGES.map((s, i) => (
              <li key={s.key} data-step className="relative flex min-h-0 flex-col justify-center py-10 pl-16 lg:min-h-[56vh]">
                <span
                  className={cx(
                    "absolute top-1/2 left-0 grid size-9 -translate-y-1/2 place-items-center rounded-full border font-mono text-[11px] transition-all duration-500 max-lg:top-14",
                    i <= active ? "border-brand-400 bg-brand-500 text-ink-950 shadow-[0_0_24px_rgba(14,165,233,0.5)]" : "border-white/[0.1] bg-ink-900 text-bone-500",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div data-step-copy className="flex flex-wrap items-center gap-2">
                  {s.tier ? (
                    <TierBadge tier={s.tier} />
                  ) : (
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-bone-300 ring-1 ring-white/[0.08] ring-inset">
                      {s.engine}
                    </span>
                  )}
                  {s.key === "investigate" && <TierBadge tier="super" />}
                </div>
                <h3 data-step-copy className="mt-4 text-[clamp(1.7rem,3vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-bone-50">
                  {s.title}
                </h3>
                <p data-step-copy className="mt-3 max-w-md text-[16px] leading-relaxed text-bone-400">
                  {s.detail}
                </p>
                <div data-step-copy className="mt-8 lg:hidden">
                  <StageVisual stage={s.key} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
