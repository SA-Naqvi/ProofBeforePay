"use client";

import {
  Check,
  Coins,
  Cpu,
  GitBranch,
  Globe,
  PenLine,
  Scale,
  ScanText,
  Search,
  Swords,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Ticker } from "@/components/motion/interactive";
import { Card, cx, DECISION_STYLE, DecisionBadge, SectionLabel, TIER_STYLE, TierBadge } from "@/components/ui";
import type { LiveState } from "@/features/investigations/useInvestigationStream";
import { clock, duration, tokens, usd } from "@/lib/formatters";
import { STAGES } from "@/lib/stages";
import type { LlmCall, StageKey, TavilyCall } from "@/types";

export const STAGE_ICONS: Record<StageKey, LucideIcon> = {
  intake: ScanText,
  investigate: GitBranch,
  judge: Scale,
  challenge: Swords,
  brief: PenLine,
};

/** Which step a model or web call belongs to: "investigate:L3" and "judge:repair" belong to investigate and judge. */
const stageOf = (step: string) => step.split(":")[0] as StageKey;

type Fact = { label: string; value: string; tone?: string };

function facts(key: StageKey, s: LiveState): Fact[] {
  const count = (status: string) => s.claims.filter((c) => c.status === status).length;
  switch (key) {
    case "intake":
      return [
        { label: "Claims to check", value: String(s.claims.length) },
        { label: "Supplier", value: s.entities?.supplier_name || "—" },
        { label: "Claims to be", value: s.entities?.claimed_type && s.entities.claimed_type !== "unknown" ? s.entities.claimed_type : "—" },
      ];
    case "investigate": {
      const red = s.signals.filter((f) => f.polarity === "red").length;
      const green = s.signals.filter((f) => f.polarity === "green").length;
      const followUps = s.leads.filter((l) => l.parent_lead).length;
      return [
        { label: "Lookups", value: String(s.leads.length) },
        { label: "Opened by a finding", value: String(followUps) },
        { label: "Rounds", value: String(s.round || "—") },
        { label: "Red flags", value: String(red), tone: red ? "text-stop-300" : undefined },
        { label: "Reassuring", value: String(green), tone: green ? "text-brand-300" : undefined },
        { label: "Contradicted", value: String(count("contradicted")), tone: count("contradicted") ? "text-stop-300" : undefined },
      ];
    }
    case "judge":
      return s.judgement
        ? [
            { label: "Decision", value: DECISION_STYLE[s.judgement.decision].label, tone: DECISION_STYLE[s.judgement.decision].text },
            { label: "Confidence", value: String(s.judgement.confidence) },
            { label: "Findings", value: String(s.judgement.key_findings.length) },
          ]
        : [{ label: "Decision", value: "—" }];
    case "challenge":
      return s.challenge
        ? [
            { label: "Outcome", value: { holds: "Verdict holds", weakened: "Weakened", overturned: "Changed" }[s.challenge.outcome] },
            { label: "Counter-searches", value: String(s.challenge.searches.length) },
            { label: "Findings disputed", value: String(s.challenge.disputed?.length ?? 0) },
          ]
        : [{ label: "Outcome", value: "—" }];
    case "brief":
      return [{ label: "Safe reply", value: s.report?.brief.reply.body ? "Ready" : "—" }];
  }
}

function Counter({ icon: Icon, label, value, format }: { icon: LucideIcon; label: string; value: number; format: (n: number) => string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <Icon className="size-4 text-bone-500" aria-hidden />
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.12em] text-bone-600 uppercase">{label}</p>
        <p className="font-mono text-sm text-bone-100 tabular-nums">
          <Ticker value={value} format={format} duration={0.6} startOnView={false} />
        </p>
      </div>
    </div>
  );
}

/**
 * The five steps as a live map: which agent is working, what it called, what it found, and what it cost.
 * Works for a live run, a paced replay, or a finished run loaded all at once.
 */
export function AgentPipeline({ state, title = "Agent pipeline", running }: { state: LiveState; title?: string; running: boolean }) {
  const activeKey = STAGES.find((s) => state.stages[s.key].state === "active")?.key;
  const [picked, setPicked] = useState<StageKey | null>(null);
  const selected = picked ?? activeKey ?? (state.stages.judge.state === "done" ? "judge" : "intake");

  // Follow the work while it runs, unless the person has clicked a step themselves.
  useEffect(() => {
    if (!running) return;
    setPicked(null);
  }, [running]);

  const done = STAGES.filter((s) => state.stages[s.key].state === "done").length;
  const progress = activeKey ? (STAGES.findIndex((s) => s.key === activeKey) + 0.5) / STAGES.length : done / STAGES.length;
  const totals = useMemo(
    () => ({
      calls: state.llmCalls.length,
      tokens: state.llmCalls.reduce((n, c) => n + c.prompt_tokens + c.completion_tokens, 0),
      web: state.tavilyCalls.length,
      cost: state.llmCalls.reduce((n, c) => n + c.cost_usd, 0),
    }),
    [state.llmCalls, state.tavilyCalls],
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="relative grid size-9 place-items-center rounded-xl border border-brand-500/25 bg-brand-500/[0.08] text-brand-300">
            <Cpu className="size-4" aria-hidden />
            {running && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-brand-400 ring-2 ring-ink-900" />}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-bone-50">{title}</h3>
            <p className="text-xs text-bone-500">
              {running
                ? `Working · ${clock(state.elapsed)}`
                : state.status === "done"
                  ? `Finished in ${duration((state.report?.telemetry.duration_s ?? state.elapsed) * 1000)}`
                  : state.status === "error"
                    ? "Stopped with an error"
                    : "Waiting to start"}
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
          <Counter icon={Cpu} label="Model calls" value={totals.calls} format={(n) => String(Math.round(n))} />
          <Counter icon={Timer} label="Tokens" value={totals.tokens} format={(n) => tokens(Math.round(n))} />
          <Counter icon={Search} label="Web calls" value={totals.web} format={(n) => String(Math.round(n))} />
          <Counter icon={Coins} label="Cost" value={totals.cost} format={(n) => usd(n)} />
        </div>
      </div>

      {/* The rail: five agents, a beam that fills as they finish, and a pulse travelling while one works. */}
      <div className="relative px-3 pt-6 pb-4 sm:px-5">
        <div className="absolute top-[52px] right-[calc(100%/14+12px)] left-[calc(100%/14+12px)] hidden h-[2px] rounded-full bg-white/[0.06] md:block" aria-hidden>
          <motion.div
            className="h-full origin-left rounded-full bg-gradient-to-r from-brand-600 via-brand-400 to-brand-300 shadow-[0_0_14px_rgba(155,212,36,0.7)]"
            initial={false}
            animate={{ scaleX: Math.min(progress, 1) }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
          {running && <span className="pipeline-pulse absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-brand-200 shadow-[0_0_14px_4px_rgba(155,212,36,0.6)]" style={{ left: `${progress * 100}%` }} />}
        </div>
        <ol className="relative grid grid-cols-1 gap-2 md:grid-cols-5 md:gap-1">
          {STAGES.map((stage, i) => {
            const { state: st, durationMs } = state.stages[stage.key];
            const Icon = STAGE_ICONS[stage.key];
            const isSelected = selected === stage.key;
            return (
              <li key={stage.key}>
                <button
                  type="button"
                  onClick={() => setPicked(stage.key)}
                  aria-pressed={isSelected}
                  className={cx(
                    "group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors md:flex-col md:gap-2 md:px-1 md:py-2 md:text-center",
                    isSelected ? "bg-white/[0.045]" : "hover:bg-white/[0.025]",
                  )}
                >
                  <span className="relative grid size-12 shrink-0 place-items-center">
                    {st === "active" && <span className="ring-spin absolute -inset-1 rounded-full" aria-hidden />}
                    <motion.span
                      animate={st === "active" ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={st === "active" ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
                      className={cx(
                        "grid size-12 place-items-center rounded-full border transition-colors duration-500",
                        st === "done" && "border-brand-400/70 bg-brand-500 text-ink-950 shadow-[0_0_24px_-4px_rgba(118,185,0,0.7)]",
                        st === "active" && "border-brand-500/60 bg-brand-500/15 text-brand-200",
                        st === "error" && "border-stop-500/50 bg-stop-500/15 text-stop-300",
                        st === "pending" && "border-white/[0.09] bg-ink-900 text-bone-600",
                      )}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={st}
                          initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                          animate={{ scale: 1, opacity: 1, rotate: 0 }}
                          exit={{ scale: 0.4, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        >
                          {st === "done" ? <Check className="size-5" strokeWidth={3} /> : st === "error" ? <TriangleAlert className="size-5" /> : <Icon className="size-5" />}
                        </motion.span>
                      </AnimatePresence>
                    </motion.span>
                  </span>
                  <span className="min-w-0 flex-1 md:flex-none">
                    <span className="block font-mono text-[10px] text-bone-600">{String(i + 1).padStart(2, "0")}</span>
                    <span className={cx("block text-[13px] leading-tight font-semibold", st === "pending" ? "text-bone-500" : "text-bone-50")}>{stage.title}</span>
                    <span className="mt-0.5 block truncate font-mono text-[10.5px] text-bone-500">
                      {st === "active" ? <span className="text-brand-300">working…</span> : st === "done" && durationMs !== undefined ? duration(durationMs) : stage.engine}
                    </span>
                  </span>
                  {isSelected && <motion.span layoutId="pipeline-selected" className="absolute inset-x-6 -bottom-px hidden h-0.5 rounded-full bg-brand-400 md:block" />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="border-t border-white/[0.06]"
        >
          <StageDetail stageKey={selected} state={state} />
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}

function StageDetail({ stageKey, state }: { stageKey: StageKey; state: LiveState }) {
  const meta = STAGES.find((s) => s.key === stageKey)!;
  const calls = state.llmCalls.filter((c) => stageOf(c.step) === stageKey);
  const web = state.tavilyCalls.filter((c) => stageOf(c.step) === stageKey);
  const logs = state.activity.filter((a) => a.kind === "log" && a.stage === stageKey);
  const st = state.stages[stageKey].state;

  return (
    <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SectionLabel>Step {STAGES.indexOf(meta) + 1}</SectionLabel>
            {meta.tier && <TierBadge tier={meta.tier} />}
            {stageKey === "investigate" && <TierBadge tier="super" />}
            {stageKey === "judge" && state.judgement && <DecisionBadge decision={state.judgement.decision} />}
          </div>
          <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-bone-50">{meta.title}</h4>
          <p className="mt-1.5 text-sm leading-relaxed text-bone-400">{meta.detail}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {facts(stageKey, state).map((f) => (
            <div key={f.label} className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <dt className="text-[11px] text-bone-500">{f.label}</dt>
              <dd className={cx("mt-0.5 truncate text-[15px] font-semibold text-bone-50", f.tone)} title={f.value}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
        {logs.length > 0 && (
          <div>
            <SectionLabel>What it said it was doing</SectionLabel>
            <ul className="mt-2 space-y-1.5">
              {logs.slice(-5).map((log, i) => (
                <li key={i} className={cx("flex gap-2 text-[13px] leading-snug", log.kind === "log" && log.level === "warn" ? "text-caution-300" : "text-bone-300")}>
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current opacity-60" aria-hidden />
                  {log.kind === "log" ? log.message : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <SectionLabel>Calls in this step</SectionLabel>
        {calls.length + web.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-sm text-bone-500">
            {st === "pending" ? "Not started yet." : st === "active" ? "Starting…" : stageKey === "investigate" ? "No calls yet." : "No calls."}
          </p>
        ) : (
          <ul className="scroll-slim mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {calls.map((c, i) => (
              <ModelCallRow key={`m${i}`} call={c} />
            ))}
            {web.map((c, i) => (
              <WebCallRow key={`w${i}`} call={c} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ModelCallRow({ call }: { call: LlmCall }) {
  const style = TIER_STYLE[call.tier];
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2"
    >
      <span className={cx("size-2 shrink-0 rounded-full", style.dot)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-bone-100">
          Nemotron {style.label} <span className="text-bone-500">· {call.step}</span>
        </span>
        <span className="block font-mono text-[10.5px] text-bone-500">
          {tokens(call.prompt_tokens)} in · {tokens(call.completion_tokens)} out · {duration(call.latency_ms)}
        </span>
      </span>
      <span className="font-mono text-[11px] text-bone-300">{usd(call.cost_usd)}</span>
    </motion.li>
  );
}

function WebCallRow({ call }: { call: TavilyCall }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2"
    >
      <Globe className={cx("size-3.5 shrink-0", call.ok ? "text-sand-300" : "text-stop-300")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-bone-100" title={call.query}>
          {call.query}
        </span>
        <span className="block font-mono text-[10.5px] text-bone-500">
          Tavily {call.kind} · {call.results} result{call.results === 1 ? "" : "s"} · {duration(call.latency_ms)}
        </span>
      </span>
      <span className="font-mono text-[11px] text-bone-400">{call.credits} cr</span>
    </motion.li>
  );
}
