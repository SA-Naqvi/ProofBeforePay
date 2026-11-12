import { cx } from "./cx";

// Shared by the <Button> component and by links styled as buttons. No "use client": server pages call it too.
export const BUTTON_VARIANT = {
  primary:
    "bg-[linear-gradient(180deg,#0b8fd9_0%,#0277bd_100%)] text-ink-950 [--btn-fill:#0a3d6e] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_0_1px_rgba(2,119,189,0.55),0_12px_30px_-12px_rgba(14,165,233,0.75)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_0_1px_rgba(2,119,189,0.6),0_16px_36px_-12px_rgba(14,165,233,0.9)]",
  secondary: "bg-ink-900/80 text-bone-100 ring-1 ring-inset ring-white/[0.14] shadow-[0_6px_20px_-14px_rgba(16,72,130,0.35)] [--btn-fill:rgb(14_165_233/0.1)]",
  ghost: "text-bone-400 hover:text-bone-50 [--btn-fill:rgb(29_74_122/0.06)]",
} as const;

/** Button styles for links that should look like buttons (Next <Link>, plain <a>). */
export function buttonClasses(variant: keyof typeof BUTTON_VARIANT = "secondary", className?: string) {
  return cx(
    "btn inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-[transform,opacity] duration-300 active:scale-[0.97]",
    BUTTON_VARIANT[variant],
    className,
  );
}
