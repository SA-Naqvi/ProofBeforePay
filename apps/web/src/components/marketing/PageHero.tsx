"use client";

import { useRef, type ReactNode } from "react";
import { Reveal, SplitReveal } from "@/components/motion/reveal";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

/** Opening section for the inner marketing pages: a headline that rises in, a glow that drifts with scroll. */
export function PageHero({ eyebrow, title, lede, children }: { eyebrow: string; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.to("[data-hero-glow]", { yPercent: 40, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } });
        gsap.to("[data-hero-grid]", { yPercent: 18, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative overflow-hidden pt-40 pb-20 sm:pt-48 sm:pb-28">
      <div data-hero-grid className="bg-grid mask-radial pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div data-hero-glow className="pointer-events-none absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-brand-500/[0.1] blur-[140px]" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
        <Reveal y={10}>
          <p className="inline-flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 font-mono text-[11px] tracking-[0.18em] text-bone-400 uppercase backdrop-blur">
            <span className="size-1.5 rounded-full bg-brand-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
            {eyebrow}
          </p>
        </Reveal>
        <SplitReveal as="h1" trigger="intro" className="mt-7 text-[clamp(2.6rem,7vw,5.8rem)] leading-[0.95] font-semibold tracking-[-0.055em] text-balance text-bone-50">
          {title}
        </SplitReveal>
        {lede && (
          <Reveal delay={0.25} y={16}>
            <p className="mx-auto mt-7 max-w-2xl text-[18px] leading-relaxed text-pretty text-bone-400">{lede}</p>
          </Reveal>
        )}
        {children && (
          <Reveal delay={0.4} y={16}>
            <div className="mt-10 flex flex-wrap justify-center gap-3">{children}</div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
