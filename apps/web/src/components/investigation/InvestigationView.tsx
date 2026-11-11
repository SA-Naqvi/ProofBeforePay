"use client";

import { FastForward, OctagonAlert, RefreshCw, RotateCcw, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { clock } from "@/lib/formatters";
import { getLenis } from "@/lib/scroll";
import { STAGES } from "@/lib/stages";
import { DECISION_LABEL } from "@/features/decision-brief/markdown";
import type { InvestigationDetail, OfferInput } from "@/types";
import { useInvestigationStream, type LiveState } from "@/features/investigations/useInvestigationStream";
import { ChallengePanel } from "@/components/risk/Challenge";
import { TrailPanel } from "@/components/risk/Trail";
import { ClaimBoard } from "@/components/claims/ClaimBoard";
import { SignalList } from "@/components/evidence/Evidence";
import { ActivityLog, ReasoningStream, SourceList } from "@/components/evidence/Feeds";
import { ReportView } from "@/components/reports/ReportView";
import { RoutingPanel } from "@/components/investigation/RoutingPanel";
import { AgentPipeline } from "@/components/investigation/AgentPipeline";
import { useShell } from "@/components/layout/AppShell";
import { Button, Card, DecisionBadge, Skeleton } from "@/components/ui";

type Mode = "live" | "replay" | null;

export function InvestigationView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const wantsReplay = params.get("replay") === "1";
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setDetail(null);
    setLoadError(null);
    setMode(null);
    api
      .get(id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        if (d.status === "queued" || d.status === "running") setMode("live");
        else if (wantsReplay && d.report) setMode("replay");
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id, wantsReplay]);

  const live = useInvestigationStream(id, mode, session);

  // The browser tab follows the check, so people can switch away and see when it's done.
  const shown = mode ? live.report : detail?.report;
  let tabTitle: string | null = null;
  if (shown) tabTitle = `${DECISION_LABEL[shown.judgement.decision]} · ${shown.entities.supplier_name || "Supplier"} · ProofBeforePay`;
  else if (mode && detail) {
    const done = STAGES.filter((s) => live.stages[s.key].state === "done").length;
    const active = STAGES.find((s) => live.stages[s.key].state === "active");
    tabTitle = `(${done}/${STAGES.length}) ${active ? active.title : "Starting"}… · ProofBeforePay`;
  }
  useTabTitle(tabTitle);

  if (!id) return <Shell><Problem title="No investigation selected" message="Start a new check, or open one of the recorded investigations." /></Shell>;
  if (loadError) return <Shell><Problem title="Investigation not found" message={loadError} /></Shell>;
  if (!detail) return <Shell><PageSkeleton /></Shell>;

  const report = mode ? live.report : detail.report;
  const failed = mode === "live" ? live.status === "error" : !mode && detail.status === "error";
  if (failed) {
    const message = (mode === "live" ? live.error : detail.error) ?? "The investigation could not be completed.";
    return (
      <Shell>
        <Problem title="The investigation stopped" message={message} retryInput={detail.input} />
      </Shell>
    );
  }

  if (report) {
    return (
      <Shell>
        <ReportView
          report={report}
          runId={id}
          onReplay={() => {
            setMode("replay");
            setSession((s) => s + 1);
            const lenis = getLenis();
            if (lenis) lenis.scrollTo(0, { duration: 1 });
            else window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <LiveBoard state={live} mode={mode} input={detail.input} onSkip={detail.report ? () => setMode(null) : undefined} />
    </Shell>
  );
}

function useTabTitle(title: string | null) {
  const original = useRef<string | null>(null);
  useEffect(() => {
    if (original.current === null) original.current = document.title;
    if (title) document.title = title;
  }, [title]);
  useEffect(
    () => () => {
      if (original.current !== null) document.title = original.current;
    },
    [],
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Inside the signed-in app the shell already pads the page; a public report needs room for the floating nav.
  const shell = useShell();
  return <div className={shell === "app" ? "" : "mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32"}>{children}</div>;
}

function useElapsed(state: LiveState, ticking: boolean): number {
  const anchor = useRef({ t: 0, at: 0 });
  const [, setTick] = useState(0);
  useEffect(() => {
    anchor.current = { t: state.elapsed, at: performance.now() };
  }, [state.elapsed]);
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(timer);
  }, [ticking]);
  return ticking && anchor.current.at ? anchor.current.t + (performance.now() - anchor.current.at) / 1000 : state.elapsed;
}

function LiveBoard({ state, mode, input, onSkip }: { state: LiveState; mode: Mode; input: OfferInput; onSkip?: () => void }) {
  const running = state.status === "running" || state.status === "queued" || state.status === "connecting";
  const elapsed = useElapsed(state, mode === "live" && running);
  const offer = state.entities?.supplier_name ?? "";
  const opening = input.message.replace(/\s+/g, " ").trim();
  const title = offer || (opening.length > 90 ? `${opening.slice(0, 90)}…` : opening);
  const stageDone = (key: keyof LiveState["stages"]) => state.stages[key].state === "done";
  const showReasoning = state.stages.judge.state !== "pending" || state.stream.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.14em] text-bone-400 uppercase">
            <span className="relative flex size-2">
              {running && <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />}
              <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
            </span>
            {mode === "replay" ? "Replaying a recorded investigation" : state.status === "queued" ? "Waiting for a free investigator" : "Investigating"}
            <span className="text-bone-600">{clock(elapsed)}</span>
          </p>
          <h1 key={offer ? "offer" : "opening"} className="mt-3 max-w-4xl animate-fade-up truncate text-3xl font-semibold tracking-[-0.035em] text-bone-50 sm:text-4xl">
            {offer ? title : `“${title}”`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {state.judgement && <DecisionBadge decision={state.judgement.decision} className="animate-fade-up" />}
          {mode === "replay" && onSkip && (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onSkip}>
              <FastForward className="size-3.5" aria-hidden />
              Skip to the report
            </Button>
          )}
        </div>
      </div>

      {state.disconnected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-caution-400/25 bg-caution-400/[0.06] px-4 py-3 text-sm text-caution-200">
          <span className="flex items-center gap-2">
            <WifiOff className="size-4" aria-hidden /> Lost the live connection. The investigation keeps running on the server.
          </span>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => window.location.reload()}>
            <RefreshCw className="size-3.5" aria-hidden /> Reconnect
          </Button>
        </div>
      )}

      <AgentPipeline state={state} running={running} title={mode === "replay" ? "Agent pipeline · replay" : "Agent pipeline · live"} />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-7">
          <TrailPanel leads={state.leads} signals={state.signals} waiting={running && !stageDone("investigate")} />
          <SignalList signals={state.signals} waiting={running && !stageDone("investigate")} compact />
          <ClaimBoard claims={state.claims} waiting={running && !state.entities} />
          {showReasoning && <ReasoningStream stream={state.stream} active={state.stages.judge.state === "active"} />}
          {state.challenge && state.judgement && <ChallengePanel challenge={state.challenge} decision={state.judgement.decision} />}
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-5">
          <RoutingPanel
            calls={state.llmCalls}
            live={running}
            tavily={{
              calls: state.tavilyCalls.length,
              credits: state.tavilyCalls.reduce((sum, c) => sum + c.credits, 0),
              byKind: state.tavilyCalls.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {}),
            }}
          />
          <ActivityLog activity={state.activity} active={running} />
          <SourceList sources={state.sources} />
        </div>
      </div>
    </div>
  );
}

function Problem({ title, message, retryInput }: { title: string; message: string; retryInput?: OfferInput }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry() {
    if (!retryInput) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.create(retryInput);
      router.push(`/investigations?id=${encodeURIComponent(id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restart the investigation.");
      setBusy(false);
    }
  }
  return (
    <Card className="mx-auto max-w-xl p-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-stop-500/30 bg-stop-500/10 text-stop-300">
        <OctagonAlert className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-bone-50">{title}</h1>
      <p className="mt-2 text-bone-400">{message}</p>
      {error && <p className="mt-3 text-sm text-stop-300">{error}</p>}
      <div className="mt-7 flex justify-center gap-2">
        {retryInput && (
          <Button variant="primary" onClick={retry} disabled={busy}>
            <RotateCcw className="size-4" aria-hidden /> {busy ? "Restarting…" : "Run it again"}
          </Button>
        )}
        <Link
          href="/#try"
          className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-bone-100 ring-1 ring-white/10 ring-inset transition hover:bg-white/[0.06]"
        >
          New check
        </Link>
      </div>
    </Card>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-64 rounded-[28px]" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
