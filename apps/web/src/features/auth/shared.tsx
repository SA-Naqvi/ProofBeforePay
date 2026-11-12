"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui";
import { cx } from "@/lib/cx";

/** Only same-site paths are allowed as a post-sign-in destination, never another site. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="font-mono text-[11px] tracking-[0.16em] text-brand-300 uppercase"
      >
        {eyebrow}
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 text-[2.1rem] leading-[1.05] font-semibold tracking-[-0.045em] text-bone-50"
      >
        {title}
      </motion.h1>
      {children && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-3 text-[15px] leading-relaxed text-bone-400"
        >
          {children}
        </motion.p>
      )}
    </div>
  );
}

export function SubmitButton({ busy, children, disabled, className }: { busy: boolean; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={cx(
        "group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-500 text-[15px] font-semibold text-ink-950 shadow-[0_0_0_1px_rgba(14,165,233,0.45),0_14px_34px_-14px_rgba(14,165,233,0.75)] transition-[transform,opacity,background-color] duration-300 hover:bg-brand-400 active:scale-[0.98] disabled:opacity-60",
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[rgb(255_255_255/0.4)] to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden />
      {busy ? <Spinner className="size-4" /> : null}
      <span className="relative">{children}</span>
      {!busy && <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />}
    </button>
  );
}

export const stagger = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay: 0.12 + i * 0.06, ease: [0.16, 1, 0.3, 1] as const },
});
