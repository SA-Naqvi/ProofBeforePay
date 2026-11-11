"use client";

import { ArrowUpRight, Clock3, Coins, History, Play, Plus, ScanSearch, Sparkles, TrendingDown } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentPipeline } from "@/components/investigation/AgentPipeline";
import { VerdictBars } from "@/components/risk/VerdictBars";
import { buttonClasses, Card, CardHeader, DecisionBadge, Skeleton, Spinner } from "@/components/ui";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page";
import { useInvestigationStream, type StreamMode } from "@/features/investigations/useInvestigationStream";
import { useApi } from "@/hooks/useApi";
import { useExamples } from "@/hooks/useBackend";
import { me } from "@/lib/api-client";
import { ago, usd } from "@/lib/formatters";
import { useSession } from "@/stores/session";
import type { Decision, InvestigationSummary } from "@/types";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const label = (run: InvestigationSummary) => [run.role, run.company].filter(Boolean).join(" at ") || run.headline || "Untitled check";

export function Dashboard() {
  const { user } = useSession();
  const mine = useApi(() => me.investigations(), []);
  const examples = useExamples();
  const runs = useMemo(() => mine.data ?? [], [mine.data]);
  const finished = runs.filter((r) => r.status === "done");

  const options = [...finished.slice(0, 8), ...(finished.length ? [] : (examples ?? []).slice(0, 3))];
  const [picked, setPicked] = useState<string | null>(null);
  const showcase = picked ?? options[0]?.id ?? null;
  const isExample = Boolean(showcase) && !finished.some((r) => r.id === showcase);
  const [mode, setMode] = useState<StreamMode>("instant");
  const [session, setSession] = useState(0);
  const state = useInvestigationStream(showcase ?? "", showcase ? mode : null, session);
  const replaying = mode === "replay" && (state.status === "running" || state.status === "queued" || state.status === "connecting");

  const stats = useMemo(() => {
    const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
    const byDecision: Partial<Record<Decision, number>> = {};
    for (const r of finished) if (r.decision) byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
    return {
      count: finished.length,
      seconds: avg(finished.map((r) => r.duration_s ?? 0).filter(Boolean)),
      cost: avg(finished.map((r) => r.cost_usd ?? 0).filter(Boolean)),
      savings: avg(finished.map((r) => r.savings_pct ?? 0).filter(Boolean)),
      byDecision,
    };
  }, [finished]);

  function replay() {
    setMode("replay");
    setSession((s) => s + 1);
  }

  const firstName = (user?.name || user?.email?.split("@")[0] || "").split(" ")[0];

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}.`}
        actions={
          <>
            <Link href="/history" className={buttonClasses("secondary")}>
              <History className="size-4" aria-hidden /> Your checks
            </Link>
            <Link href="/investigate" className={buttonClasses("primary")}>
              <Plus className="size-4" aria-hidden /> New check
            </Link>
          </>
        }
      >
        {finished.length
          ? "Here's what your agents have checked, and exactly how they worked on your latest supplier."
          : "Run your first check and watch the agent follow the evidence, lookup by lookup."}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ScanSearch} label="Checks run" value={mine.loading && !mine.data ? null : stats.count} index={0} hint={finished.length ? `Latest ${ago(finished[0]!.created_at)}` : "None yet"} />
        <StatTile icon={Clock3} label="Average time" value={stats.seconds} format={(n) => `${Math.round(n)}s`} index={1} hint="From paste to verdict" />
        <StatTile icon={Coins} label="Average cost" value={stats.cost} format={(n) => usd(n)} index={2} hint="Model tokens on Token Factory" />
        <StatTile icon={TrendingDown} label="Saved by routing" value={stats.savings} format={(n) => `${Math.round(n)}%`} index={3} hint="Versus sending everything to Ultra" tone="text-brand-300" />
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-brand-300" aria-hidden />
              <select
                value={showcase ?? ""}
                onChange={(e) => {
                  setPicked(e.target.value);
                  setMode("instant");
                }}
                className="max-w-full min-w-0 truncate rounded-lg border border-white/[0.08] bg-ink-900 px-3 py-1.5 text-sm text-bone-100 focus:border-brand-500/60 focus:outline-none"
                aria-label="Which check to show"
              >
                {options.map((r) => (
                  <option key={r.id} value={r.id}>
                    {isExample || !finished.length ? "Example: " : ""}
                    {label(r)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {showcase && (
                <Link href={`/investigations?id=${encodeURIComponent(showcase)}`} className={buttonClasses("ghost", "px-3 py-1.5 text-xs")}>
                  Full report <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              )}
              <button type="button" onClick={replay} disabled={!showcase || replaying} className={buttonClasses("secondary", "px-3 py-1.5 text-xs")}>
                {replaying ? <Spinner className="size-3.5" /> : <Play className="size-3.5" aria-hidden />}
                {replaying ? "Replaying" : "Replay it live"}
              </button>
            </div>
          </div>
          {showcase ? (
            state.status === "connecting" ? (
              <Skeleton className="h-[460px] rounded-2xl" />
            ) : (
              <AgentPipeline state={state} running={replaying} title={isExample ? "Agent pipeline · example run" : "Agent pipeline · your latest check"} />
            )
          ) : (
            <Skeleton className="h-[460px] rounded-2xl" />
          )}
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-4">
          <Card>
            <CardHeader icon={<ScanSearch className="size-4" />} title="Verdicts" subtitle={finished.length ? `Across your ${finished.length} check${finished.length === 1 ? "" : "s"}` : "Appears after your first check"} />
            <div className="p-5">
              <VerdictBars counts={stats.byDecision} />
            </div>
          </Card>
          <Card>
            <CardHeader icon={<History className="size-4" />} title="Recent checks" right={<Link href="/history" className="text-xs text-bone-400 hover:text-bone-50">See all</Link>} />
            {mine.loading && !mine.data ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : runs.length ? (
              <ul className="divide-y divide-white/[0.05]">
                {runs.slice(0, 6).map((run, i) => (
                  <motion.li key={run.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                    <Link href={`/investigations?id=${encodeURIComponent(run.id)}`} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.02]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-bone-100 group-hover:text-bone-50">{label(run)}</span>
                        <span className="text-xs text-bone-500">{ago(run.created_at)}</span>
                      </span>
                      {run.decision ? (
                        <DecisionBadge decision={run.decision} />
                      ) : run.status === "error" ? (
                        <span className="text-xs text-stop-300">Stopped</span>
                      ) : (
                        <Spinner className="size-4 text-brand-300" />
                      )}
                    </Link>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <div className="p-4">
                <EmptyState icon={ScanSearch} title="No checks yet" action={<Link href="/investigate" className={buttonClasses("primary")}>Check a supplier</Link>}>
                  Paste a supplier&apos;s invoice or listing, or just a company name and registration number.
                </EmptyState>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
