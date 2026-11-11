"use client";

import { ArrowUpRight, History, Plus, Search, Swords } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { buttonClasses, cx, DecisionBadge, Skeleton, Spinner } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { useApi } from "@/hooks/useApi";
import { me } from "@/lib/api-client";
import { ago, duration, shortDate, usd } from "@/lib/formatters";
import type { Decision, InvestigationSummary } from "@/types";

const FILTERS: { key: Decision | "all" | "error"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "PROCEED", label: "Proceed" },
  { key: "VERIFY_FIRST", label: "Verify first" },
  { key: "STOP", label: "Stop" },
  { key: "error", label: "Didn't finish" },
];
const CHALLENGE = { holds: "Held up", weakened: "Weakened", overturned: "Changed" } as const;

export function HistoryPage() {
  const runs = useApi(() => me.investigations(), []);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (runs.data ?? []).filter((r) => {
      const matches = filter === "all" || (filter === "error" ? r.status === "error" : r.decision === filter);
      const text = [r.company, r.role, r.headline].filter(Boolean).join(" ").toLowerCase();
      return matches && (!q || text.includes(q));
    });
  }, [runs.data, filter, query]);

  const count = (key: (typeof FILTERS)[number]["key"]) =>
    (runs.data ?? []).filter((r) => key === "all" || (key === "error" ? r.status === "error" : r.decision === key)).length;

  return (
    <div>
      <PageHeader
        eyebrow="History"
        title="Your checks"
        actions={
          <Link href="/investigate" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden /> New check
          </Link>
        }
      >
        Every supplier you&apos;ve checked, with its verdict and the full report one click away.
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by decision">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cx(
                "relative rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                filter === f.key ? "text-ink-950" : "text-bone-400 hover:text-bone-100",
              )}
            >
              {filter === f.key && <motion.span layoutId="history-filter" className="absolute inset-0 rounded-full bg-bone-100" transition={{ type: "spring", stiffness: 450, damping: 36 }} />}
              <span className="relative">
                {f.label} <span className={cx("font-mono text-[11px]", filter === f.key ? "text-ink-950/60" : "text-bone-600")}>{count(f.key)}</span>
              </span>
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-bone-500" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, role or verdict"
            className="h-10 w-full rounded-xl border border-white/[0.08] bg-ink-900/80 pr-3 pl-10 text-sm text-bone-50 placeholder:text-bone-600 focus:border-brand-500/60 focus:outline-none"
          />
        </label>
      </div>

      {runs.loading && !runs.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : runs.error ? (
        <p className="rounded-2xl border border-stop-500/30 bg-stop-500/[0.06] px-4 py-3 text-sm text-stop-200">{runs.error}</p>
      ) : !runs.data?.length ? (
        <EmptyState icon={History} title="Nothing here yet" action={<Link href="/investigate" className={buttonClasses("primary")}>Check your first supplier</Link>}>
          When you check a supplier while signed in, it&apos;s saved here with its full evidence trail.
        </EmptyState>
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence initial={false}>
            {shown.map((run, i) => (
              <Row key={run.id} run={run} index={i} />
            ))}
          </AnimatePresence>
          {!shown.length && <p className="py-10 text-center text-sm text-bone-500">No checks match that.</p>}
        </motion.ul>
      )}
    </div>
  );
}

function Row({ run, index }: { run: InvestigationSummary; index: number }) {
  const title = [run.role, run.company].filter(Boolean).join(" at ") || "Untitled check";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: Math.min(index, 10) * 0.03, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/investigations?id=${encodeURIComponent(run.id)}`}
        className="group panel flex flex-col gap-3 p-4 transition-colors hover:border-white/[0.12] sm:flex-row sm:items-center sm:gap-5 sm:px-5"
      >
        <div className="w-32 shrink-0">
          {run.decision ? (
            <DecisionBadge decision={run.decision} />
          ) : run.status === "error" ? (
            <span className="text-xs font-medium text-stop-300">Didn&apos;t finish</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-brand-300">
              <Spinner className="size-3.5" /> Running
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-bone-50">{title}</p>
          <p className="mt-0.5 line-clamp-1 text-sm text-bone-400">{run.headline ?? run.error ?? "Still investigating…"}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-bone-500">
          {run.challenge_outcome && (
            <span className="inline-flex items-center gap-1" title="What happened when Nemotron Super argued against the verdict">
              <Swords className="size-3" aria-hidden /> {CHALLENGE[run.challenge_outcome]}
            </span>
          )}
          {run.duration_s ? <span>{duration(run.duration_s * 1000)}</span> : null}
          {run.cost_usd ? <span>{usd(run.cost_usd)}</span> : null}
          <span title={shortDate(run.created_at)}>{ago(run.created_at)}</span>
          <ArrowUpRight className="size-4 text-bone-600 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-bone-200" aria-hidden />
        </div>
      </Link>
    </motion.li>
  );
}
