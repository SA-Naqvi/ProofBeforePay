"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { markIntroDone } from "@/lib/intro";
import { LogoMark } from "@/components/layout/Logo";

const PHASES = ["Reading the paperwork", "Checking registries", "Following the evidence", "Testing every claim", "Weighing the evidence"];
const SEEN_KEY = "pbp:intro-seen";

/**
 * Landing-page curtain. It is in the server-rendered HTML, so it covers the page from the first paint,
 * counts up, then lifts in two layers and hands over to the hero's entrance.
 */
export function Preloader() {
  const pathname = usePathname();
  const active = pathname === "/";
  const [gone, setGone] = useState(!active);
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const phase = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!active) {
        markIntroDone();
        return;
      }
      let seen = false;
      try {
        seen = sessionStorage.getItem(SEEN_KEY) === "1";
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        // Storage can be blocked; the full intro is fine then.
      }
      const finish = () => setGone(true);

      if (prefersReducedMotion()) {
        markIntroDone();
        gsap.to(root.current, { autoAlpha: 0, duration: 0.3, onComplete: finish });
        return;
      }

      const tl = gsap.timeline({ onComplete: finish });
      if (!seen) {
        const state = { v: 0 };
        tl.to(state, {
          v: 100,
          duration: 1.5,
          ease: "power2.inOut",
          onUpdate: () => {
            const v = Math.round(state.v);
            if (count.current) count.current.textContent = String(v).padStart(3, "0");
            if (bar.current) bar.current.style.transform = `scaleX(${state.v / 100})`;
            if (phase.current) phase.current.textContent = PHASES[Math.min(PHASES.length - 1, Math.floor(state.v / 20))] ?? "";
          },
        }).to("[data-pl-out]", { yPercent: -110, autoAlpha: 0, duration: 0.55, ease: "expo.in", stagger: 0.035 }, "+=0.12");
      } else {
        tl.to("[data-pl-out]", { autoAlpha: 0, duration: 0.25 });
      }
      tl.to("[data-pl-panel='top']", { yPercent: -100, duration: 1, ease: "expo.inOut" }, seen ? "<" : "-=0.15")
        .add(markIntroDone, "-=0.55")
        .to("[data-pl-panel='under']", { yPercent: -100, duration: 1, ease: "expo.inOut" }, "<0.1");
    },
    { scope: root },
  );

  if (gone) return null;

  return (
    <div ref={root} className="fixed inset-0 z-[150]" aria-hidden>
      <div data-pl-panel="under" className="absolute inset-0 bg-brand-500" />
      <div data-pl-panel="top" className="absolute inset-0 flex flex-col justify-between overflow-hidden bg-ink-950 p-6 sm:p-10">
        <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.16em] text-bone-500 uppercase">
          <span data-pl-out className="flex items-center gap-2.5 text-bone-200">
            <LogoMark className="size-6 text-bone-300" />
            <span className="font-sans text-sm font-semibold tracking-tight normal-case">ProofBeforePay</span>
          </span>
          <span data-pl-out className="hidden sm:block">
            Nemotron · Token Factory · Tavily
          </span>
        </div>

        <div>
          <div className="flex items-end justify-between gap-6">
            <span data-pl-out className="mb-3 font-mono text-xs tracking-[0.14em] text-bone-400 uppercase sm:mb-6">
              <span ref={phase}>{PHASES[0]}</span>
              <span className="dots ml-1 inline-flex gap-0.5">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </span>
            <span
              data-pl-out
              ref={count}
              className="text-[clamp(5rem,22vw,17rem)] leading-[0.78] font-semibold tracking-[-0.07em] text-bone-50 tabular-nums"
            >
              000
            </span>
          </div>
          <div data-pl-out className="mt-6 h-px w-full bg-white/[0.08]">
            <div ref={bar} className="h-px origin-left scale-x-0 bg-brand-400 shadow-[0_0_12px_rgba(155,212,36,0.8)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
