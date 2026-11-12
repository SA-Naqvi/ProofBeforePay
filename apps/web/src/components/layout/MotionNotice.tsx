"use client";

import { Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { motionChoice, setMotionChoice, systemPrefersReducedMotion, type MotionChoice } from "@/lib/gsap";

const DISMISSED = "pbp:motion-notice";

/**
 * When the device asks for reduced motion (Windows' "Animation effects" off, macOS "Reduce motion"), the site keeps
 * still. Many people never chose that setting, so say so once and offer to turn animations on for this site.
 */
export function MotionNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED) === "1";
    } catch {
      // Storage blocked: show the notice; it just won't remember being closed.
    }
    if (!dismissed && motionChoice() === "system" && systemPrefersReducedMotion()) {
      const timer = window.setTimeout(() => setShow(true), 1200);
      return () => window.clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to remember it in.
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed right-3 bottom-3 left-3 z-[60] mx-auto max-w-md rounded-2xl border border-white/[0.1] bg-ink-850/95 p-4 shadow-[0_24px_60px_-20px_rgba(16,72,130,0.28)] backdrop-blur-xl sm:right-auto sm:left-5"
        >
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/25 ring-inset">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-bone-50">Animations are paused</p>
              <p className="mt-1 text-[13px] leading-relaxed text-bone-400">
                Your device asks websites to reduce motion, so this one is keeping still. You can turn animations on just for this site.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMotionChoice("full")}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-brand-400"
                >
                  Turn animations on
                </button>
                <button type="button" onClick={dismiss} className="rounded-lg px-3 py-1.5 text-xs font-medium text-bone-400 transition hover:text-bone-100">
                  Keep them off
                </button>
              </div>
            </div>
            <button type="button" onClick={dismiss} aria-label="Close" className="self-start text-bone-500 transition hover:text-bone-100">
              <X className="size-4" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

const CHOICES: { value: MotionChoice; label: string }[] = [
  { value: "system", label: "Device" },
  { value: "full", label: "On" },
  { value: "reduced", label: "Off" },
];

/** Animations: follow the device, always on, or always off. */
export function MotionToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<MotionChoice>("system");
  useEffect(() => setChoice(motionChoice()), []);
  return (
    <div className={cx("inline-flex items-center gap-2", className)}>
      <span className="font-mono text-[10.5px] tracking-[0.12em] text-bone-600 uppercase">Animations</span>
      <div className="relative flex rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/[0.07] ring-inset" role="radiogroup" aria-label="Animations">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={choice === c.value}
            onClick={() => c.value !== choice && setMotionChoice(c.value)}
            className={cx(
              "relative rounded-md px-2.5 py-1 font-mono text-[10.5px] tracking-[0.08em] uppercase transition-colors",
              choice === c.value ? "text-ink-950" : "text-bone-500 hover:text-bone-200",
            )}
          >
            {choice === c.value && <motion.span layoutId="motion-choice" className="absolute inset-0 rounded-md bg-bone-100" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <span className="relative">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
