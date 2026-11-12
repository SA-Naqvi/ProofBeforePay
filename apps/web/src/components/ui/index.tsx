"use client";

import { Check, Copy, LoaderCircle, ShieldAlert, ShieldCheck, ShieldQuestionMark, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { trackFillOrigin, trackPointer } from "@/components/motion/interactive";
import { BUTTON_VARIANT, buttonClasses } from "@/lib/buttons";
import { cx } from "@/lib/cx";
import { scrollToTarget } from "@/lib/scroll";
import type { Decision, Polarity, TierName } from "@/types";

export { buttonClasses, cx };

export function Card({
  className,
  children,
  id,
  spotlight = false,
}: {
  className?: string;
  children: ReactNode;
  id?: string;
  spotlight?: boolean;
}) {
  return (
    <section id={id} onPointerMove={spotlight ? trackPointer : undefined} className={cx("panel min-w-0", spotlight && "spot", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-white/[0.07] bg-white/[0.03] text-bone-300">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-bone-50">{title}</h3>
          {subtitle && <p className="truncate text-xs text-bone-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-md", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("animate-spin", className)} aria-hidden />;
}

/** Tier colours run from bright to dim with model size: Ultra in NVIDIA green, Super in sand, Nano in stone. */
export const TIER_STYLE: Record<TierName, { label: string; dot: string; text: string; chip: string; bar: string; hex: string }> = {
  ultra: { label: "Ultra", dot: "bg-brand-400", text: "text-brand-300", chip: "bg-brand-500/10 ring-brand-500/30", bar: "bg-brand-400", hex: "#0ea5e9" },
  super: { label: "Super", dot: "bg-sand-300", text: "text-sand-200", chip: "bg-sand-300/[0.08] ring-sand-300/25", bar: "bg-sand-300", hex: "#a07d2c" },
  nano: { label: "Nano", dot: "bg-bone-400", text: "text-bone-300", chip: "bg-bone-400/[0.08] ring-bone-400/25", bar: "bg-bone-500", hex: "#5f7896" },
};

export function TierBadge({ tier, prefix = "Nemotron", className }: { tier: TierName; prefix?: string; className?: string }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        s.chip,
        s.text,
        className,
      )}
    >
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {prefix ? `${prefix} ${s.label}` : s.label}
    </span>
  );
}

export const DECISION_STYLE: Record<
  Decision,
  { label: string; word: string; text: string; chip: string; border: string; icon: typeof ShieldCheck; hex: string; glow: string }
> = {
  PROCEED: {
    label: "Proceed",
    word: "Proceed.",
    text: "text-brand-300",
    chip: "bg-brand-500/10 ring-brand-500/30 text-brand-300",
    border: "border-brand-500/25",
    icon: ShieldCheck,
    hex: "#0ea5e9",
    glow: "rgb(14 165 233 / 0.22)",
  },
  VERIFY_FIRST: {
    label: "Verify first",
    word: "Verify first.",
    text: "text-caution-300",
    chip: "bg-caution-400/10 ring-caution-400/30 text-caution-300",
    border: "border-caution-400/25",
    icon: ShieldQuestionMark,
    hex: "#d98b0b",
    glow: "rgb(217 139 11 / 0.2)",
  },
  STOP: {
    label: "Stop",
    word: "Stop.",
    text: "text-stop-300",
    chip: "bg-stop-500/10 ring-stop-500/30 text-stop-300",
    border: "border-stop-500/30",
    icon: ShieldAlert,
    hex: "#e5483a",
    glow: "rgb(239 69 53 / 0.24)",
  },
};

export function DecisionBadge({ decision, className }: { decision: Decision; className?: string }) {
  const s = DECISION_STYLE[decision];
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", s.chip, className)}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

export const POLARITY_STYLE: Record<Polarity, { dot: string; text: string; card: string; label: string }> = {
  red: { dot: "bg-stop-400", text: "text-stop-300", card: "border-stop-500/20 bg-stop-500/[0.05]", label: "Risk" },
  amber: { dot: "bg-caution-400", text: "text-caution-300", card: "border-caution-400/20 bg-caution-400/[0.04]", label: "Unclear" },
  green: { dot: "bg-brand-400", text: "text-brand-300", card: "border-brand-500/20 bg-brand-500/[0.045]", label: "Reassuring" },
};



export function Button({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: keyof typeof BUTTON_VARIANT;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onPointerEnter={trackFillOrigin}
      className={cx(
        "btn inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-[transform,opacity] duration-300 active:scale-[0.97] disabled:opacity-50",
        BUTTON_VARIANT[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1800);
  }
  const Icon = state === "done" ? Check : state === "failed" ? X : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      onPointerEnter={trackFillOrigin}
      className={cx(
        "btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-bone-200 ring-1 ring-inset ring-white/10 transition active:scale-95",
        state === "done" && "text-brand-300 ring-brand-500/40",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={state}
          initial={{ scale: 0.4, opacity: 0, rotate: -45 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.4, opacity: 0, rotate: 45 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="inline-flex"
        >
          <Icon className="size-3.5" aria-hidden />
        </motion.span>
      </AnimatePresence>
      {state === "done" ? "Copied" : state === "failed" ? "Copy blocked" : label}
    </button>
  );
}

const REF_GROUP = /\[((?:[FCS]\d{1,3})(?:\s*[,;]\s*[FCS]\d{1,3})*)\]/g;

export const REVEAL_EVENT = "pbp:reveal";

export function flashRef(id: string): void {
  const highlight = () => {
    const target = document.getElementById(`ref-${id}`);
    if (!target) return false;
    scrollToTarget(target, { center: true });
    target.classList.remove("ref-flash");
    void target.offsetWidth;
    target.classList.add("ref-flash");
    return true;
  };
  if (!highlight()) {
    // The item may be inside a collapsed list; ask lists to expand, then try again.
    window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: id }));
    window.setTimeout(highlight, 80);
  }
}

const REF_TONE = {
  F: "bg-bone-400/10 text-bone-200 ring-bone-400/25",
  C: "bg-sand-300/10 text-sand-200 ring-sand-300/25",
  S: "bg-brand-500/10 text-brand-300 ring-brand-500/25",
} as const;

export function RefChip({ id }: { id: string }) {
  const tone = REF_TONE[(id[0] as keyof typeof REF_TONE) ?? "F"] ?? REF_TONE.F;
  return (
    <button
      type="button"
      onClick={() => flashRef(id)}
      className={cx(
        "mx-0.5 inline-flex -translate-y-px rounded-md px-1 py-px align-baseline font-mono text-[10.5px] font-medium ring-1 ring-inset transition hover:-translate-y-0.5 hover:brightness-125",
        tone,
      )}
      title={`Jump to ${id}`}
    >
      {id}
    </button>
  );
}

/** Renders text with inline citations like [F2] or [C1, S4] as clickable chips. */
export function RefText({ text }: { text: string }) {
  const parts = text.split(REF_GROUP);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? part.split(/\s*[,;]\s*/).map((id) => <RefChip key={`${i}-${id}`} id={id} />) : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10.5px] font-medium tracking-[0.16em] text-bone-500 uppercase">{children}</p>;
}
