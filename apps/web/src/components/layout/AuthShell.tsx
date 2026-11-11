"use client";

import { ArrowLeft, CircleCheck, Globe, LockKeyhole, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

const CHIPS = [
  { icon: ShieldAlert, tone: "text-stop-300 border-stop-500/30 bg-stop-500/[0.08]", label: "Pay to a personal account", pos: "top-[16%] left-[8%]" },
  { icon: Globe, tone: "text-caution-300 border-caution-400/30 bg-caution-400/[0.07]", label: "Licence belongs to another company", pos: "top-[30%] right-[6%]" },
  { icon: CircleCheck, tone: "text-brand-300 border-brand-500/30 bg-brand-500/[0.08]", label: "Registered address confirmed", pos: "bottom-[30%] left-[4%]" },
  { icon: TriangleAlert, tone: "text-sand-200 border-sand-300/30 bg-sand-300/[0.07]", label: "Super tried to prove it wrong", pos: "bottom-[27%] right-[8%]" },
];

/** Sign-in pages: the form on the left, and on large screens a slow, living picture of what an account gives you. */
export function AuthShell({ children }: { children: ReactNode }) {
  const visual = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.from("[data-auth-seal]", { scale: 0.6, autoAlpha: 0, rotate: -30, duration: 1.4, ease: "expo.out" });
        gsap.to("[data-auth-ring]", { rotate: 360, duration: 40, ease: "none", repeat: -1 });
        gsap.fromTo(
          "[data-auth-chip]",
          { autoAlpha: 0, y: 24, scale: 0.92 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 1, ease: "expo.out", stagger: 0.15, delay: 0.35 },
        );
        gsap.utils.toArray<HTMLElement>("[data-auth-chip]").forEach((chip, i) => {
          gsap.to(chip, { y: i % 2 ? 10 : -10, duration: 3 + i * 0.4, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 1.4 });
        });
        const move = (event: PointerEvent) => {
          const r = visual.current?.getBoundingClientRect();
          if (!r) return;
          const x = (event.clientX - r.left) / r.width - 0.5;
          const y = (event.clientY - r.top) / r.height - 0.5;
          gsap.to("[data-auth-depth]", { x: x * 24, y: y * 18, duration: 1.2, ease: "power3.out" });
        };
        window.addEventListener("pointermove", move);
        return () => window.removeEventListener("pointermove", move);
      });
    },
    { scope: visual },
  );

  return (
    <div className="grid min-h-[100svh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative flex flex-col px-5 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-bone-50" aria-label="ProofBeforePay home">
            <LogoMark className="size-7 text-bone-300" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">ProofBeforePay</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-bone-500 transition hover:text-bone-100">
            <ArrowLeft className="size-3.5" aria-hidden /> Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-bone-600">
          <LockKeyhole className="size-3.5" aria-hidden />
          Passwords are hashed, codes expire in 10 minutes, and sessions stay on this device.
        </p>
      </div>

      <div ref={visual} className="relative hidden overflow-hidden border-l border-white/[0.06] bg-ink-900 lg:block">
        <div className="bg-grid mask-radial pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(600px circle at 50% 45%, rgb(118 185 0 / 0.16), transparent 60%)" }}
          aria-hidden
        />
        <div data-auth-depth className="absolute inset-0">
          <div data-auth-seal className="absolute top-1/2 left-1/2 grid size-56 -translate-x-1/2 -translate-y-1/2 place-items-center">
            <svg data-auth-ring viewBox="0 0 200 200" className="absolute inset-0 size-full text-brand-500/40" aria-hidden>
              <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 7" />
              <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
            </svg>
            <div className="grid size-28 place-items-center rounded-full border border-brand-500/30 bg-ink-950/80 shadow-[0_0_80px_-10px_rgba(118,185,0,0.55)] backdrop-blur">
              <LogoMark className="size-14 text-bone-200" />
            </div>
          </div>
        </div>
        {CHIPS.map(({ icon: Icon, tone, label, pos }) => (
          <div
            key={label}
            data-auth-chip
            className={`absolute ${pos} flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur ${tone}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </div>
        ))}
        <div className="absolute inset-x-10 bottom-10">
          <p className="max-w-md text-2xl leading-snug font-semibold tracking-[-0.03em] text-bone-50">
            Keep every check you run, with <span className="font-serif text-[1.1em] font-normal text-brand-300 italic">all</span> its evidence.
          </p>
          <p className="mt-3 font-mono text-[11px] tracking-[0.14em] text-bone-500 uppercase">5 steps · 7 kinds of lookup · 3 Nemotron models</p>
        </div>
      </div>
    </div>
  );
}
