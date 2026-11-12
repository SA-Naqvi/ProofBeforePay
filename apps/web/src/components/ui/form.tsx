"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "@/lib/cx";
import { passwordStrength } from "@/lib/schemas";

const FIELD =
  "peer h-12 w-full rounded-xl border bg-ink-900/80 px-4 text-[15px] text-bone-50 transition-[border-color,box-shadow,background-color] duration-300 placeholder:text-bone-600 focus:outline-none focus:bg-ink-900";

function borderFor(error?: string) {
  return error
    ? "border-stop-500/50 focus:border-stop-400 focus:shadow-[0_0_0_4px_rgba(239,69,53,0.12)]"
    : "border-white/[0.08] hover:border-white/[0.14] focus:border-brand-500/60 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.12)]";
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          id={id}
          role="alert"
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -4 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-1.5 overflow-hidden pt-1.5 text-[13px] text-stop-300"
        >
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export function FormAlert({ message, tone = "error" }: { message: string | null; tone?: "error" | "info" | "success" }) {
  const tones = {
    error: "border-stop-500/30 bg-stop-500/[0.07] text-stop-200",
    info: "border-sand-300/25 bg-sand-300/[0.06] text-sand-100",
    success: "border-brand-500/30 bg-brand-500/[0.08] text-brand-200",
  };
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          role={tone === "error" ? "alert" : "status"}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={cx("rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed", tones[tone])}
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; trailing?: ReactNode };

export function TextField({ label, error, hint, trailing, className, ...props }: InputProps) {
  const id = useId();
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-bone-300">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-xs text-bone-500">
            {hint}
          </span>
        )}
      </div>
      <div className="relative">
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={[error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined}
          className={cx(FIELD, borderFor(error), trailing ? "pr-12" : undefined)}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      <FieldError message={error} id={`${id}-error`} />
    </div>
  );
}

const STRENGTH = ["Too short", "Okay", "Good", "Strong", "Very strong"];
const STRENGTH_TONE = ["bg-stop-400", "bg-caution-400", "bg-sand-300", "bg-brand-400", "bg-brand-300"];

export function PasswordField({ showStrength = false, ...props }: Omit<InputProps, "type" | "trailing"> & { showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const value = String(props.value ?? "");
  const score = passwordStrength(value);
  return (
    <div className={props.className}>
      <TextField
        {...props}
        className={undefined}
        type={visible ? "text" : "password"}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="grid size-9 place-items-center rounded-lg text-bone-500 transition hover:bg-white/[0.06] hover:text-bone-100"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        }
      />
      {showStrength && value && (
        <div className="mt-2 flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <motion.span
                  className={cx("block h-full rounded-full", STRENGTH_TONE[score])}
                  initial={false}
                  animate={{ width: i < score ? "100%" : "0%" }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
            ))}
          </div>
          <span className="w-20 text-right text-xs text-bone-400">{STRENGTH[score]}</span>
        </div>
      )}
    </div>
  );
}

export function SelectField({
  label,
  options,
  error,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: { value: string; label: string }[]; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-bone-300">
        {label}
      </label>
      <select id={id} className={cx(FIELD, borderFor(error), "appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10")} {...props}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239b9588' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-900">
            {o.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

export function TextArea({
  label,
  error,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-bone-300">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-xs text-bone-500">
            {hint}
          </span>
        )}
      </div>
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cx(FIELD, borderFor(error), "h-auto min-h-36 resize-y py-3 leading-relaxed")}
        {...props}
      />
      <FieldError message={error} />
    </div>
  );
}

/** Six boxes for a one-time code: types forward, backspaces back, and takes a pasted code in one go. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function commit(next: string, focus: number) {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    boxes.current[Math.min(focus, 5)]?.focus();
    if (clean.length === 6) onComplete?.(clean);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>, i: number) {
    if (event.key === "Backspace" && !digits[i] && i > 0) {
      event.preventDefault();
      commit(value.slice(0, i - 1) + value.slice(i), i - 1);
    } else if (event.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
    else if (event.key === "ArrowRight" && i < 5) boxes.current[i + 1]?.focus();
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    commit(pasted, pasted.length);
  }

  return (
    <motion.div
      className="flex justify-between gap-2 sm:gap-3"
      animate={invalid ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      role="group"
      aria-label="6-digit code"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          aria-label={`Digit ${i + 1}`}
          onPaste={onPaste}
          onKeyDown={(e) => onKey(e, i)}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (!typed) {
              commit(value.slice(0, i) + value.slice(i + 1), i);
              return;
            }
            commit((value.slice(0, i) + typed + value.slice(i + 1)).slice(0, 6), i + typed.length);
          }}
          className={cx(
            "aspect-[4/5] w-full min-w-0 rounded-2xl border bg-ink-900/80 text-center font-mono text-2xl font-semibold text-bone-50 transition-[border-color,box-shadow,transform] duration-300 focus:-translate-y-0.5 focus:outline-none sm:text-3xl",
            invalid
              ? "border-stop-500/50"
              : digit
                ? "border-brand-500/45 shadow-[0_0_0_4px_rgba(14,165,233,0.08)]"
                : "border-white/[0.08] focus:border-brand-500/60 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.12)]",
          )}
        />
      ))}
    </motion.div>
  );
}
