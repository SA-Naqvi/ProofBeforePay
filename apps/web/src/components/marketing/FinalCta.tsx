"use client";

import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { SectionLink } from "@/components/layout/Nav";
import { Magnetic, RollText, trackFillOrigin } from "@/components/motion/interactive";
import { SplitReveal } from "@/components/motion/reveal";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

export function FinalCta() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.fromTo(
          "[data-seal]",
          { rotate: -40, scale: 0.7 },
          { rotate: 40, scale: 1.08, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true } },
        );
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative overflow-hidden py-32 sm:py-44">
      <div className="bg-grid mask-radial pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/[0.09] blur-[130px]" aria-hidden />
      <div data-seal className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.07]" aria-hidden>
        <LogoMark className="size-[34rem] text-bone-50" />
      </div>
      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <SplitReveal className="text-[clamp(2.6rem,6.5vw,5.6rem)] leading-[0.95] font-semibold tracking-[-0.055em] text-balance text-bone-50">
          Got a supplier that feels a bit <span className="font-serif font-normal tracking-[-0.02em] text-brand-400 italic">off?</span>
        </SplitReveal>
        <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-bone-400">
          Check it before you send a deposit, sign a contract or book a shipment. It shows its work.
        </p>
        <div className="mt-10 flex justify-center">
          <Magnetic>
            <SectionLink
              hash="#try"
              onPointerEnter={trackFillOrigin}
              className="btn roll-host inline-flex h-14 items-center gap-3 rounded-2xl bg-brand-500 px-8 text-base font-semibold text-ink-950 shadow-[0_0_0_1px_rgba(118,185,0,0.5),0_24px_60px_-18px_rgba(118,185,0,0.8)] [--btn-fill:var(--color-bone-50)]"
            >
              <span data-magnetic-inner className="inline-flex items-center gap-3">
                <RollText text="Check a supplier" />
                <ArrowRight className="size-5" aria-hidden />
              </span>
            </SectionLink>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
