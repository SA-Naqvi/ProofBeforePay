"use client";

import { ArrowLeftRight, GitCompareArrows } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buttonClasses, Card, cx, DECISION_STYLE, DecisionBadge, POLARITY_STYLE, Skeleton } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { useApi } from "@/hooks/useApi";
import { useExamples } from "@/hooks/useBackend";
import { api, me } from "@/lib/api-client";
import { duration, usd } from "@/lib/formatters";
import type { InvestigationDetail, InvestigationSummary, Report } from "@/types";

type Row = { label: string; value: (r: Report) => string | number; better?: "high" | "low" };

const ROWS: Row[] = [
  { label: "Confidence", value: (r) => r.judgement.confidence },
  { label: "Risk signals", value: (r) => r.signals.filter((s) => s.polarity === "red").length, better: "low" },
  { label: "Reassuring signals", value: (r) => r.signals.filter((s) => s.polarity === "green").length, better: "high" },
  { label: "Claims verified", value: (r) => r.claims.filter((c) => c.status === "verified").length, better: "high" },
  { label: "Claims contradicted", value: (r) => r.claims.filter((c) => c.status === "contradicted").length, better: "low" },
  { label: "Challenge", value: (r) => (r.challenge ? { holds: "Held up", weakened: "Weakened", overturned: "Changed" }[r.challenge.outcome] : "—") },
  { label: "Lookups run", value: (r) => r.leads?.length ?? 0 },
  { label: "Sources read", value: (r) => r.sources.length },
  { label: "Time", value: (r) => duration(r.telemetry.duration_s * 1000) },
  { label: "Model cost", value: (r) => usd(r.telemetry.cost_usd) },
];

const name = (r: InvestigationSummary) => [r.role, r.company].filter(Boolean).join(" at ") || r.headline || r.id;

function useDetail(id: string | null) {
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setDetail(null);
    api.get(id).then((d) => !cancelled && setDetail(d)).catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [id]);
  return detail;
}

/** Two checks side by side: the verdicts, the evidence counts and the findings, with differences marked. */
export function ComparePage() {
  const mine = useApi(() => me.investigations(), []);
  const examples = useExamples();
  const options = useMemo(
    () => [...(mine.data ?? []).filter((r) => r.status === "done"), ...(examples ?? []).map((e) => ({ ...e, example: true }))],
    [mine.data, examples],
  );
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const a = left ?? options[0]?.id ?? null;
  const b = right ?? options.find((o) => o.id !== a)?.id ?? null;
  const da = useDetail(a);
  const db = useDetail(b);

  const picker = (value: string | null, set: (v: string) => void, side: string) => (
    <select
      value={value ?? ""}
      onChange={(e) => set(e.target.value)}
      aria-label={`Check on the ${side}`}
      className="w-full min-w-0 truncate rounded-xl border border-white/[0.08] bg-ink-900 px-3 py-2.5 text-sm text-bone-100 focus:border-brand-500/60 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.example ? "Example: " : ""}
          {name(o)}
        </option>
      ))}
    </select>
  );

  if (!mine.loading && options.length < 2) {
    return (
      <div>
        <PageHeader eyebrow="Compare" title="Compare two checks" />
        <EmptyState icon={GitCompareArrows} title="You need two checks to compare" action={<Link href="/investigate" className={buttonClasses("primary")}>Run a check</Link>}>
          Run another check, and you&apos;ll be able to put any two side by side.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Compare" title="Two suppliers, side by side">
        Useful when two suppliers quote for the same order, or you want to see why one passed and another didn&apos;t.
      </PageHeader>

      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {picker(a, setLeft, "left")}
        <button
          type="button"
          onClick={() => {
            setLeft(b);
            setRight(a);
          }}
          className="grid size-10 place-items-center rounded-xl border border-white/[0.08] text-bone-400 transition hover:rotate-180 hover:text-bone-50"
          aria-label="Swap sides"
        >
          <ArrowLeftRight className="size-4" />
        </button>
        {picker(b, setRight, "right")}
      </div>

      {!da?.report || !db?.report ? (
        <Skeleton className="h-[520px] rounded-2xl" />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={`${a}-${b}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <Card className="overflow-hidden">
              <div className="grid grid-cols-2 border-b border-white/[0.06]">
                {[da, db].map((d, i) => {
                  const style = DECISION_STYLE[d.report!.judgement.decision];
                  return (
                    <div key={i} className={cx("relative p-5", i === 0 && "border-r border-white/[0.06]")}>
                      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `radial-gradient(400px circle at 0% 0%, ${style.glow}, transparent 60%)` }} aria-hidden />
                      <div className="relative">
                        <DecisionBadge decision={d.report!.judgement.decision} />
                        <p className={cx("mt-3 text-3xl font-semibold tracking-[-0.04em]", style.text)}>{style.word}</p>
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-bone-300">{d.report!.judgement.headline}</p>
                        <Link href={`/investigations?id=${encodeURIComponent(d.id)}`} className="mt-3 inline-block text-xs text-bone-400 underline-offset-4 hover:text-bone-50 hover:underline">
                          Open the full report
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
              <dl>
                {ROWS.map((row, i) => {
                  const va = row.value(da.report!);
                  const vb = row.value(db.report!);
                  const differ = va !== vb;
                  const win = (v: string | number, other: string | number) =>
                    differ && row.better && typeof v === "number" && typeof other === "number" && (row.better === "high" ? v > other : v < other);
                  return (
                    <motion.div
                      key={row.label}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.04 * i }}
                      className={cx("grid grid-cols-2 border-b border-white/[0.04] text-sm", differ && "bg-white/[0.015]")}
                    >
                      {[
                        [va, vb],
                        [vb, va],
                      ].map(([v, other], side) => (
                        <div key={side} className={cx("flex items-center justify-between gap-3 px-5 py-3", side === 0 && "border-r border-white/[0.06]")}>
                          <dt className="text-bone-500">{row.label}</dt>
                          <dd className={cx("truncate text-right font-medium", win(v!, other!) ? "text-brand-300" : "text-bone-100")}>{v}</dd>
                        </div>
                      ))}
                    </motion.div>
                  );
                })}
              </dl>
              <div className="grid grid-cols-1 md:grid-cols-2">
                {[da, db].map((d, i) => (
                  <div key={i} className={cx("p-5", i === 0 && "border-b border-white/[0.06] md:border-r md:border-b-0")}>
                    <p className="mb-3 font-mono text-[10.5px] tracking-[0.16em] text-bone-500 uppercase">Key findings</p>
                    <ul className="space-y-2">
                      {d.report!.judgement.key_findings.map((f, j) => (
                        <li key={j} className="flex gap-2.5 text-sm leading-snug text-bone-300">
                          <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", POLARITY_STYLE[f.polarity].dot)} aria-hidden />
                          {f.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
