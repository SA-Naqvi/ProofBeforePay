"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Hand,
  Info,
  Lock,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormAlert, TextArea, TextField } from "@/components/ui/form";
import { Button, Card, cx, RefText, SectionLabel, Spinner } from "@/components/ui";
import { ApiError, deposits as api } from "@/lib/api-client";
import { useSession } from "@/stores/session";
import type { Decision, Deposit, DepositStatus, PaymentPlan, ProofReview, ReleaseRecommendation } from "@/types";

const EASE = [0.16, 1, 0.3, 1] as const;

const STATUS: Record<DepositStatus, { label: string; tone: string; icon: typeof CircleCheck }> = {
  created: { label: "Awaiting PayPal approval", tone: "bg-bone-500/10 text-bone-300 ring-bone-500/20", icon: CircleDashed },
  pending: { label: "PayPal is processing", tone: "bg-caution-400/10 text-caution-300 ring-caution-400/25", icon: Clock },
  paid: { label: "Paid to supplier", tone: "bg-brand-500/10 text-brand-200 ring-brand-500/25", icon: CircleCheck },
  held: { label: "On hold in PayPal", tone: "bg-sky-glow/15 text-brand-200 ring-brand-400/30", icon: Lock },
  released: { label: "Released to supplier", tone: "bg-brand-500/10 text-brand-200 ring-brand-500/25", icon: PackageCheck },
  voided: { label: "Hold cancelled", tone: "bg-bone-500/10 text-bone-300 ring-bone-500/20", icon: Undo2 },
  cancelled: { label: "Cancelled", tone: "bg-bone-500/10 text-bone-300 ring-bone-500/20", icon: CircleX },
  failed: { label: "Not confirmed by PayPal", tone: "bg-stop-500/10 text-stop-300 ring-stop-500/25", icon: CircleX },
  refunded: { label: "Refunded", tone: "bg-bone-500/10 text-bone-300 ring-bone-500/20", icon: Undo2 },
};

const RECOMMENDATION: Record<ReleaseRecommendation, { label: string; tone: string; icon: typeof CircleCheck }> = {
  RELEASE: { label: "Proof clears the release", tone: "border-brand-500/30 bg-brand-500/[0.07] text-brand-200", icon: ShieldCheck },
  KEEP_HOLDING: { label: "Keep holding", tone: "border-caution-400/35 bg-caution-400/[0.07] text-caution-200", icon: Hand },
  VOID: { label: "Cancel the hold", tone: "border-stop-500/30 bg-stop-500/[0.07] text-stop-200", icon: ShieldAlert },
};

const GATE: { decision: Decision; verdict: string; action: string; icon: typeof CircleCheck; on: string }[] = [
  { decision: "PROCEED", verdict: "Proceed", action: "Pay now with PayPal", icon: Wallet, on: "border-brand-500/40 bg-brand-500/[0.08] text-brand-200" },
  { decision: "VERIFY_FIRST", verdict: "Verify first", action: "Hold in PayPal until proven", icon: Lock, on: "border-caution-400/45 bg-caution-400/[0.08] text-caution-200" },
  { decision: "STOP", verdict: "Stop", action: "Payment blocked", icon: Ban, on: "border-stop-500/40 bg-stop-500/[0.07] text-stop-200" },
];

const money = (amount: string, currency: string) => {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const message = (error: unknown) => (error instanceof ApiError ? error.message : "Something went wrong. Please try again.");

function PayPalWordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-md bg-ink-900 px-2 py-0.5 text-[13px] font-extrabold tracking-tight italic ring-1 ring-white/[0.1]", className)}>
      <span className="text-[#003087]">Pay</span>
      <span className="text-[#009cde]">Pal</span>
    </span>
  );
}

function StatusChip({ status }: { status: DepositStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", s.tone)}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

/** The verdict decides what the money may do: three gates, the report's verdict lit. */
function GateRow({ decision }: { decision: Decision }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {GATE.map((g, i) => {
        const active = g.decision === decision;
        const Icon = g.icon;
        return (
          <motion.div
            key={g.decision}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: active ? 1 : 0.55, y: 0, scale: active ? 1 : 0.98 }}
            transition={{ duration: 0.6, delay: 0.08 * i, ease: EASE }}
            className={cx(
              "relative flex items-center gap-3 rounded-2xl border px-3.5 py-3",
              active ? g.on : "border-white/[0.07] bg-ink-900/60 text-bone-500",
              active && "shadow-[0_14px_36px_-22px_rgba(14,120,200,0.6)]",
            )}
          >
            <span className={cx("grid size-8 shrink-0 place-items-center rounded-xl", active ? "bg-ink-900/80" : "bg-white/[0.04]")}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[10px] tracking-[0.14em] uppercase opacity-80">{g.verdict}</span>
              <span className="block truncate text-[13px] font-semibold">{g.action}</span>
            </span>
            {active && (
              <span className="absolute -top-2 right-3 rounded-full bg-ink-900 px-2 py-px font-mono text-[9px] tracking-[0.14em] text-bone-400 uppercase ring-1 ring-white/[0.1]">
                this report
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function ReviewCard({ review }: { review: ProofReview }) {
  const r = RECOMMENDATION[review.recommendation];
  const Icon = r.icon;
  const tone = { ANSWERED: "text-brand-300", PARTIAL: "text-caution-300", UNANSWERED: "text-stop-300" } as const;
  const QIcon = { ANSWERED: CircleCheck, PARTIAL: CircleDashed, UNANSWERED: CircleX } as const;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className={cx("rounded-2xl border p-4", r.tone)}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4" aria-hidden />
        <span className="text-sm font-semibold">{r.label}</span>
        {review.overridden_by_rules && (
          <span className="rounded-full bg-stop-500/10 px-2 py-0.5 text-[11px] font-medium text-stop-300 ring-1 ring-stop-500/25">payment rules overruled the model</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-bone-500">Nemotron Super · {when(review.at)}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-bone-200">
        <RefText text={review.summary} />
      </p>
      {review.questions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {review.questions.map((q) => {
            const Q = QIcon[q.status];
            return (
              <li key={q.question} className="flex gap-2.5 text-[13px]">
                <Q className={cx("mt-0.5 size-4 shrink-0", tone[q.status])} aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium text-bone-100">{q.question}</span>
                  {q.note && (
                    <span className="block text-bone-400">
                      <RefText text={q.note} />
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {review.concerns.length > 0 && (
        <div className="mt-3">
          <SectionLabel>New concerns</SectionLabel>
          <ul className="mt-1.5 space-y-1 text-[13px] text-stop-300">
            {review.concerns.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </div>
      )}
      {review.still_needed.length > 0 && (
        <div className="mt-3">
          <SectionLabel>Still needed before release</SectionLabel>
          <ul className="mt-1.5 space-y-1 text-[13px] text-bone-300">
            {review.still_needed.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

function DepositCard({ deposit, onChange }: { deposit: Deposit; onChange: (d: Deposit) => void }) {
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [tracking, setTracking] = useState({ number: "", carrier: "DHL" });
  const latest = deposit.reviews[deposit.reviews.length - 1];
  const cleared = latest?.recommendation === "RELEASE";

  const act = async (label: string, fn: () => Promise<Deposit>) => {
    setBusy(label);
    setError(null);
    try {
      onChange(await fn());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const review = async () => {
    setBusy("review");
    setError(null);
    try {
      const result = await api.review(deposit.id, proof);
      onChange({ ...deposit, reviews: [...deposit.reviews, result] });
      setProof("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.article layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="rounded-2xl border border-white/[0.08] bg-ink-900/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="text-xl font-semibold tracking-[-0.02em] text-bone-50">{money(deposit.amount, deposit.currency)}</p>
          <p className="truncate text-xs text-bone-500">
            {deposit.mode === "hold" ? "Hold" : "Payment"} for {deposit.supplier_name}
            {deposit.payee_email ? ` · payee ${deposit.payee_email}` : ""}
          </p>
        </div>
        <span className="ml-auto">
          <StatusChip status={deposit.status} />
        </span>
      </div>

      {deposit.status === "held" && deposit.expires_at && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-sky-mist/60 px-3 py-2 text-xs text-brand-200">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          The money is reserved in the buyer&apos;s PayPal account, not sent. The hold can be released until {when(deposit.expires_at)}.
        </p>
      )}

      {deposit.status === "held" && (
        <div className="mt-4 space-y-3">
          {latest && <ReviewCard review={latest} />}
          <TextArea
            label="Paste the supplier's reply and proof"
            hint="Nemotron Super checks it against the report's open questions"
            placeholder="e.g. Our business licence number is …, attached is a letter from our bank confirming the account is in the company's name…"
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            rows={4}
            maxLength={6000}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={review} disabled={proof.trim().length < 20 || busy !== null}>
              {busy === "review" ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden />}
              {busy === "review" ? "Reviewing the proof…" : latest ? "Review new proof" : "Review the proof with AI"}
            </Button>
            <Button variant="primary" onClick={() => act("release", () => api.release(deposit.id, !cleared))} disabled={busy !== null || (!cleared && !accept)}>
              {busy === "release" ? <Spinner className="size-4" /> : <PackageCheck className="size-4" aria-hidden />}
              Release to supplier
            </Button>
            <Button variant="ghost" onClick={() => act("cancel", () => api.cancel(deposit.id))} disabled={busy !== null}>
              {busy === "cancel" ? <Spinner className="size-4" /> : <Undo2 className="size-4" aria-hidden />}
              Cancel hold
            </Button>
          </div>
          {!cleared && (
            <label className="flex items-start gap-2 text-xs text-bone-400">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 accent-[#d92d20]" />
              The proof hasn&apos;t cleared review. Release anyway: I accept the risk that this supplier isn&apos;t who it says it is.
            </label>
          )}
        </div>
      )}

      {deposit.status === "created" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => act("cancel", () => api.cancel(deposit.id))} disabled={busy !== null}>
            Discard this unpaid payment
          </Button>
        </div>
      )}

      {(deposit.status === "paid" || deposit.status === "released") &&
        (deposit.tracking ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-bone-400">
            <Truck className="size-3.5" aria-hidden />
            Tracking {deposit.tracking.carrier} {deposit.tracking.number} is on the PayPal transaction.
          </p>
        ) : (
          <form
            className="mt-4 grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void act("track", () => api.track(deposit.id, tracking.number, tracking.carrier));
            }}
          >
            <TextField label="Shipment tracking number" hint="Strengthens a PayPal claim if goods never arrive" value={tracking.number} onChange={(e) => setTracking({ ...tracking, number: e.target.value })} placeholder="1Z999AA10123456784" />
            <TextField label="Carrier" value={tracking.carrier} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} />
            <Button type="submit" variant="secondary" disabled={tracking.number.trim().length < 4 || busy !== null} className="h-12">
              {busy === "track" ? <Spinner className="size-4" /> : <Truck className="size-4" aria-hidden />}
              Add to PayPal
            </Button>
          </form>
        ))}

      <FormAlert message={error} />

      {deposit.timeline.length > 0 && (
        <details className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-bone-400 hover:text-bone-200">
            <Clock className="size-3.5" aria-hidden /> Payment trail ({deposit.timeline.length})
          </summary>
          <ol className="mt-3 space-y-2 border-l border-white/[0.1] pl-4">
            {deposit.timeline.map((t, i) => (
              <li key={`${t.at}-${i}`} className="relative text-xs text-bone-300">
                <span className="absolute top-1.5 -left-[19px] size-1.5 rounded-full bg-brand-400" />
                <span className="font-mono text-[10px] text-bone-500">{when(t.at)}</span> · {t.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </motion.article>
  );
}

/** Every deposit this buyer has paid or held through PayPal, newest first, each linking back to its report. */
export function DepositList() {
  const [rows, setRows] = useState<Deposit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.list().then(setRows, (e) => setError(message(e)));
  }, []);
  if (error) return <FormAlert message={error} />;
  if (!rows) return <Spinner className="size-4" />;
  if (rows.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-white/[0.12] px-5 py-6 text-sm text-bone-400">
        No deposits yet. Run a check, then pay or hold the supplier&apos;s deposit from the report: the verdict decides which.
      </p>
    );
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900/70">
      {rows.map((d) => (
        <li key={d.id}>
          <Link href={`/investigations?id=${encodeURIComponent(d.run_id)}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.03]">
            <span className="grid size-9 place-items-center rounded-xl bg-white/[0.04] text-brand-300">
              {d.mode === "hold" ? <Lock className="size-4" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-bone-100">{d.supplier_name}</span>
              <span className="font-mono text-[11px] text-bone-500">
                {d.mode === "hold" ? "Hold" : "Payment"} · {when(d.created_at)}
                {d.reviews.length > 0 ? ` · ${d.reviews.length} AI review${d.reviews.length === 1 ? "" : "s"}` : ""}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-bone-50">{money(d.amount, d.currency)}</span>
            <StatusChip status={d.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Pay only when it's proven: the report's verdict decides whether PayPal pays, holds or refuses. */
export function PaymentGate({ runId, decision }: { runId: string; decision: Decision }) {
  const { status, user } = useSession();
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);
  const handled = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await api.plan(runId);
      setPlan(next);
      setPayee((p) => p || next.suggested_payee);
      setLoadError(null);
    } catch (e) {
      setLoadError(message(e));
    }
  }, [runId]);

  // Coming back from PayPal: finish (capture or authorize) or discard the payment, then tidy the address bar.
  useEffect(() => {
    if (status !== "ready" || !user || handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const depositId = params.get("deposit");
    const outcome = params.get("paypal");
    const finish = async () => {
      if (depositId && outcome === "return") {
        setNotice({ tone: "info", text: "Confirming with PayPal…" });
        try {
          const d = await api.complete(depositId);
          setNotice(
            d.status === "held"
              ? { tone: "success", text: `PayPal is holding ${money(d.amount, d.currency)}. Nothing has been sent to the supplier yet.` }
              : d.status === "paid"
                ? { tone: "success", text: `Paid ${money(d.amount, d.currency)} to ${d.supplier_name} through PayPal.` }
                : d.status === "pending"
                  ? { tone: "info", text: "PayPal is still processing this payment. It will update here once it clears." }
                  : { tone: "error", text: "PayPal didn't confirm this payment, so nothing was marked as paid." },
          );
        } catch (e) {
          setNotice({ tone: "error", text: message(e) });
        }
      } else if (depositId && outcome === "cancel") {
        try {
          await api.cancel(depositId);
        } catch {
          // already gone
        }
        setNotice({ tone: "info", text: "You cancelled on PayPal. Nothing was paid or held." });
      }
      if (depositId) {
        params.delete("deposit");
        params.delete("paypal");
        params.delete("token");
        params.delete("PayerID");
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
      await load();
    };
    void finish();
  }, [status, user, load]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { approve_url } = await api.start(runId, amount, payee.trim());
      window.location.assign(approve_url);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  const update = (d: Deposit) => setPlan((p) => (p ? { ...p, deposits: p.deposits.map((x) => (x.id === d.id ? d : x)) } : p));

  const next = typeof window === "undefined" ? "/dashboard" : `${window.location.pathname}${window.location.search}`;

  return (
    <Card spotlight className="beam overflow-hidden">
      <div className="relative border-b border-white/[0.06] bg-[linear-gradient(120deg,rgba(186,230,253,0.55),rgba(255,255,255,0)_60%)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-ink-900 text-brand-300 shadow-[0_8px_24px_-14px_rgba(14,120,200,0.8)] ring-1 ring-white/[0.1]">
            <BadgeCheck className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-bone-50">
              Pay only when it&apos;s proven <PayPalWordmark />
            </h3>
            <p className="text-xs text-bone-500">The verdict decides what your deposit may do. The server enforces it, not this page.</p>
          </div>
          {plan?.environment === "sandbox" && (
            <span className="ml-auto rounded-full bg-caution-400/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-caution-300 uppercase ring-1 ring-caution-400/25">
              Sandbox · no real money
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <GateRow decision={plan?.decision ?? decision} />

        <AnimatePresence>{notice && <FormAlert key={notice.text} message={notice.text} tone={notice.tone} />}</AnimatePresence>

        {status === "ready" && !user && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-ink-900/70 p-4">
            <Lock className="size-4 text-brand-300" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-bone-300">Sign in to pay or hold this deposit through PayPal. Judges can use the one-click demo account.</p>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 hover:text-brand-200">
              Sign in <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        )}

        {user && !plan && !loadError && (
          <div className="flex items-center gap-2 text-sm text-bone-400">
            <Spinner className="size-4" /> Reading what this report allows…
          </div>
        )}
        {loadError && <FormAlert message={loadError} />}

        {plan && (
          <>
            <div>
              <p className="text-[15px] font-semibold text-bone-50">{plan.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-bone-400">{plan.reason}</p>
            </div>

            {plan.red_flags.length > 0 && (
              <ul className="space-y-2">
                {plan.red_flags.map((f) => (
                  <li key={f.id} className="flex gap-2.5 rounded-xl border border-stop-500/25 bg-stop-500/[0.05] px-3 py-2.5 text-[13px]">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-stop-400" aria-hidden />
                    <span>
                      <span className="font-semibold text-stop-200">{f.title}</span>
                      <span className="block text-bone-400">{f.why || f.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {plan.mode !== "blocked" && plan.enabled && (
              <form onSubmit={start} className="grid gap-4 rounded-2xl border border-white/[0.08] bg-ink-850/80 p-4 sm:grid-cols-2">
                <TextField
                  label={`Deposit amount (${plan.currency})`}
                  hint={plan.deposit_terms ? `Terms: ${plan.deposit_terms}` : undefined}
                  inputMode="decimal"
                  placeholder="1500.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  required
                />
                <TextField
                  label="Supplier's PayPal email"
                  hint="Optional · pays the supplier directly"
                  type="email"
                  placeholder="sales@supplier.example"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                />
                <ul className="space-y-1.5 sm:col-span-2">
                  {plan.protections.map((p) => (
                    <li key={p} className="flex gap-2 text-[13px] text-bone-300">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <Button type="submit" variant="primary" disabled={busy || !amount} className="px-5 py-2.5">
                    {busy ? <Spinner className="size-4" /> : plan.mode === "hold" ? <Lock className="size-4" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
                    {busy ? "Opening PayPal…" : plan.mode === "hold" ? `Hold ${amount ? money(amount, plan.currency) : "the deposit"} with PayPal` : `Pay ${amount ? money(amount, plan.currency) : "the deposit"} with PayPal`}
                  </Button>
                  <span className="text-xs text-bone-500">You approve on PayPal&apos;s own page. We never see your card or PayPal password.</span>
                </div>
                {plan.sandbox_buyer && (
                  <p className="flex items-start gap-2 rounded-xl bg-sky-mist/70 px-3 py-2 text-xs text-brand-200 sm:col-span-2">
                    <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      Sandbox buyer for testing: <span className="font-mono">{plan.sandbox_buyer.email}</span> / <span className="font-mono">{plan.sandbox_buyer.password}</span>
                    </span>
                  </p>
                )}
                <div className="sm:col-span-2">
                  <FormAlert message={error} />
                </div>
              </form>
            )}

            {plan.mode !== "blocked" && !plan.enabled && (
              <FormAlert tone="info" message="PayPal isn't configured on this server, so payments are switched off." />
            )}

            {plan.mode === "blocked" && (
              <div className="flex items-start gap-3 rounded-2xl border border-stop-500/30 bg-stop-500/[0.06] p-4">
                <Ban className="mt-0.5 size-5 shrink-0 text-stop-400" aria-hidden />
                <div className="text-sm">
                  <p className="font-semibold text-stop-200">ProofBeforePay won&apos;t start a payment to this supplier.</p>
                  <p className="mt-1 text-bone-400">
                    If the supplier sends proof that answers the findings, run a new check with it. A fresh verdict is the only way to unlock payment.
                  </p>
                </div>
              </div>
            )}

            {plan.deposits.length > 0 && (
              <div className="space-y-3">
                <SectionLabel>Your deposits for this supplier</SectionLabel>
                {plan.deposits.map((d) => (
                  <DepositCard key={d.id} deposit={d} onChange={update} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
