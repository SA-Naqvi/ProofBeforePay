"use client";

import { ArrowDownRight, ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { SectionLink } from "@/components/layout/Nav";
import { Magnetic, RollText, trackFillOrigin } from "@/components/motion/interactive";
import { SplitReveal } from "@/components/motion/reveal";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import { onIntroDone } from "@/lib/intro";
import { ScannerScene } from "@/components/marketing/ScannerScene";

const SignalField = dynamic(() => import("@/components/marketing/SignalField"), { ssr: false });

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const intro = gsap
          .timeline({ paused: true, defaults: { ease: "expo.out" } })
          .from("[data-hero-field]", { autoAlpha: 0, duration: 2.4, ease: "power2.out" }, 0)
          .from("[data-hero-eyebrow]", { autoAlpha: 0, y: 18, duration: 1 }, 0.05)
          .from("[data-hero-scene]", { autoAlpha: 0, y: 60, rotationX: 22, scale: 0.9, transformPerspective: 1200, duration: 1.8 }, 0.15)
          .from("[data-hero-copy]", { autoAlpha: 0, y: 26, filter: "blur(10px)", duration: 1.2, stagger: 0.09, clearProps: "filter" }, 0.5)
          .from("[data-hero-cue]", { autoAlpha: 0, duration: 1 }, 1.2);
        const stop = onIntroDone(() => intro.play());

        // Scroll away: the copy drifts up faster than the scene, which tips back into the page.
        const scrub = { trigger: root.current, start: "top top", end: "bottom top", scrub: true } as const;
        gsap.to("[data-hero-text]", { yPercent: -22, autoAlpha: 0, ease: "none", scrollTrigger: scrub });
        gsap.to("[data-hero-scene-wrap]", { yPercent: 14, rotationX: -10, scale: 0.94, transformPerspective: 1400, ease: "none", scrollTrigger: scrub });
        gsap.to("[data-hero-field]", { yPercent: 18, ease: "none", scrollTrigger: scrub });
        return stop;
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative isolate flex min-h-[100svh] items-center overflow-x-clip pt-28 pb-24 lg:pt-24">
      <div data-hero-field className="mask-fade-top pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[68%]">
        <SignalField />
      </div>
      <div className="bg-grid mask-radial pointer-events-none absolute inset-0 -z-20 opacity-70" aria-hidden />
      <div
        className="pointer-events-none absolute top-[-25%] left-1/2 -z-20 h-[70vh] w-[90vw] -translate-x-1/2 rounded-full bg-brand-500/[0.07] blur-[140px]"
        aria-hidden
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
        <div data-hero-text className="relative z-10">
          <div data-hero-eyebrow className="beam inline-flex rounded-full">
            <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-bone-300">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-brand-400" />
              </span>
              NVIDIA Nemotron on Nebius Token Factory
            </span>
          </div>

          <SplitReveal
            as="h1"
            trigger="intro"
            delay={0.15}
            className="mt-7 text-[clamp(2.9rem,6.4vw,6rem)] leading-[0.93] font-semibold tracking-[-0.055em] text-balance text-bone-50"
          >
            Check the supplier <span className="font-serif font-normal tracking-[-0.02em] text-brand-400 italic">before</span> you pay.
          </SplitReveal>

          <p data-hero-copy className="mt-7 max-w-xl text-[17px] leading-relaxed text-pretty text-bone-400">
            Paste an invoice or a listing from Alibaba or IndiaMART. ProofBeforePay checks the registration, customs records, certificates,
            address and photos, and follows every inconsistency to the end, then tells you if it&apos;s safe to pay the deposit.
          </p>

          <div data-hero-copy className="mt-9 flex flex-wrap items-center gap-3">
            <Magnetic>
              <SectionLink
                hash="#try"
                onPointerEnter={trackFillOrigin}
                className="btn roll-host inline-flex h-13 items-center gap-2.5 rounded-2xl bg-brand-500 px-6 text-[15px] font-semibold text-ink-950 shadow-[0_0_0_1px_rgba(118,185,0,0.5),0_18px_40px_-14px_rgba(118,185,0,0.75)] [--btn-fill:var(--color-bone-50)]"
              >
                <span data-magnetic-inner className="inline-flex items-center gap-2.5">
                  <RollText text="Check a supplier" />
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </SectionLink>
            </Magnetic>
            <SectionLink
              hash="#how"
              onPointerEnter={trackFillOrigin}
              className="btn roll-host inline-flex h-13 items-center gap-2 rounded-2xl px-5 text-[15px] font-medium text-bone-200 ring-1 ring-white/10 ring-inset"
            >
              <RollText text="See how it works" />
              <ArrowDownRight className="size-4 text-bone-500" aria-hidden />
            </SectionLink>
          </div>

          <ul data-hero-copy className="mt-12 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[11px] tracking-[0.14em] text-bone-500 uppercase">
            {["No sign-up", "Every claim cited", "Open source, MIT"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-brand-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div data-hero-scene-wrap className="relative">
          <div data-hero-scene>
            <ScannerScene />
          </div>
        </div>
      </div>

      <div data-hero-cue className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 sm:flex" aria-hidden>
        <span className="font-mono text-[10px] tracking-[0.2em] text-bone-600 uppercase">Scroll</span>
        <span className="h-10 w-px overflow-hidden bg-white/[0.08]">
          <span className="block h-full w-full animate-scroll-cue bg-brand-400" />
        </span>
      </div>
    </section>
  );
}
