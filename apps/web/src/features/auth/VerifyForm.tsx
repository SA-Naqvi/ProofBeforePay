"use client";

import { Check, MailOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { FormAlert, OtpInput } from "@/components/ui/form";
import { useHealth } from "@/hooks/useBackend";
import { ApiError, auth } from "@/lib/api-client";
import { setUser } from "@/stores/session";
import { AuthHeading, safeNext, stagger } from "./shared";

const COOLDOWN = 45;

/** The six-digit code check after sign-up (or after signing in to an account that was never verified). */
export function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = (params.get("email") ?? "").trim().toLowerCase();
  const testMode = useHealth()?.email_test_mode;
  const next = safeNext(params.get("next"));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wait, setWait] = useState(COOLDOWN);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function verify(value = code) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await auth.verify({ email, code: value });
      setUser(user);
      setDone(true);
      window.setTimeout(() => router.push(next), 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
      setShake((s) => s + 1);
      setCode("");
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNote(null);
    try {
      await auth.resend({ email, purpose: "verify" });
      setNote("A new code is on its way. Check your spam folder too.");
      setWait(COOLDOWN);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send a new code.");
    }
  }

  if (!email) {
    return (
      <AuthHeading eyebrow="Verify email" title="Start from sign-up">
        This page needs the email you signed up with. <Link href="/signup" className="text-brand-300 hover:underline">Create an account</Link> or{" "}
        <Link href="/login" className="text-brand-300 hover:underline">sign in</Link>.
      </AuthHeading>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {done ? (
        <motion.div key="done" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="py-10 text-center">
          <motion.span
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="mx-auto grid size-20 place-items-center rounded-full bg-brand-500 text-ink-950 shadow-[0_0_60px_-6px_rgba(14,165,233,0.7)]"
          >
            <Check className="size-10" strokeWidth={3} aria-hidden />
          </motion.span>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-bone-50">You&apos;re in.</h1>
          <p className="mt-2 text-bone-400">Taking you to your dashboard…</p>
        </motion.div>
      ) : (
        <motion.div key="form" exit={{ opacity: 0, y: -10 }}>
          <motion.span
            {...stagger(0)}
            className="mb-6 grid size-12 place-items-center rounded-2xl border border-brand-500/25 bg-brand-500/[0.08] text-brand-300"
          >
            <MailOpen className="size-5" aria-hidden />
          </motion.span>
          <AuthHeading eyebrow="One more step" title="Check your email">
            We sent a 6-digit code to <span className="font-medium text-bone-100">{email}</span>. It works for 10 minutes.
          </AuthHeading>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
            className="space-y-5"
          >
            <motion.div {...stagger(1)}>
              <OtpInput key={shake} value={code} onChange={setCode} onComplete={verify} disabled={busy} invalid={shake > 0 && !code} />
            </motion.div>
            <FormAlert message={error} />
            <FormAlert message={note} tone="info" />
            {testMode && (
              <p className="rounded-xl border border-caution-400/20 bg-caution-400/[0.06] px-4 py-3 text-xs leading-relaxed text-caution-200">
                Email here is in test mode, so your code may go to the site owner&apos;s inbox instead of yours. To look around now, use a{" "}
                <Link href="/login" className="font-semibold underline underline-offset-2 hover:text-bone-50">
                  demo account
                </Link>
                .
              </p>
            )}
            <motion.button
              {...stagger(2)}
              type="submit"
              disabled={busy || code.length !== 6}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-[15px] font-semibold text-ink-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50"
            >
              {busy && <Spinner className="size-4" />}
              Verify and continue
            </motion.button>
          </form>
          <motion.div {...stagger(3)} className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={resend} disabled={wait > 0} className="font-medium text-bone-200 transition hover:text-brand-300 disabled:text-bone-600">
              {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
            </button>
            <Link href="/signup" className="text-bone-500 transition hover:text-bone-200">
              Wrong email?
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
