"use client";

import {
  Ban,
  ChevronDown,
  Download,
  Footprints,
  Link2,
  MailCheck,
  MessageSquareQuote,
  MessagesSquare,
  Play,
  Printer,
  Scale,
  Swords,
} from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { usd } from "@/lib/formatters";
import { DECISION_LABEL, downloadText, reportToMarkdown } from "@/features/decision-brief/markdown";
import type { Report } from "@/types";
import { ChallengePanel } from "@/components/risk/Challenge";
import { TrailPanel } from "@/components/risk/Trail";
import { ClaimBoard } from "@/components/claims/ClaimBoard";
import { SignalList } from "@/components/evidence/Evidence";
import { ProofTrail } from "@/components/evidence/ProofTrail";
import { DecisionHero } from "@/components/risk/DecisionHero";
import { SourceList } from "@/components/evidence/Feeds";
import { RoutingPanel } from "@/components/investigation/RoutingPanel";
import { AgentTrace } from "@/components/reports/AgentTrace";
import { AskReport } from "@/components/reports/AskReport";
import { PaymentGate } from "@/components/payments/PaymentGate";
import { FeedbackWidget } from "@/components/reports/FeedbackWidget";
import { Button, Card, CardHeader, CopyButton, cx, POLARITY_STYLE, RefText, SectionLabel } from "@/components/ui";

function ActionPlan({ report }: { report: Report }) {
  const j = report.judgement;
  return (
    <Card spotlight>
      <CardHeader icon={<Footprints className="size-4" />} title="What to do now" />
      <div className="grid gap-6 p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <SectionLabel>Next step</SectionLabel>
          <p className="mt-2 text-[16px] leading-snug font-medium text-bone-50">
            <RefText text={j.next_step} />
          </p>
        </div>
        {j.do_not.length > 0 && (
          <div>
            <SectionLabel>Don&apos;t, for now</SectionLabel>
            <ul className="mt-3 space-y-2.5">
              {j.do_not.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-bone-300">
                  <Ban className="mt-0.5 size-4 shrink-0 text-stop-400" aria-hidden />
                  <span>
                    <RefText text={item} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {j.verification_questions.length > 0 && (
          <div>
            <SectionLabel>Ask the supplier</SectionLabel>
            <ul className="mt-3 space-y-2.5">
              {j.verification_questions.map((q) => (
                <li key={q} className="flex gap-2.5 text-sm text-bone-300">
                  <MessagesSquare className="mt-0.5 size-4 shrink-0 text-sand-300" aria-hidden />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function SafeReply({ report }: { report: Report }) {
  const { subject, body } = report.brief.reply;
  if (!body) return null;
  return (
    <Card spotlight>
      <CardHeader
        icon={<MailCheck className="size-4" />}
        title="A safe reply you can send"
        subtitle="Asks the supplier to prove who they are before any deposit. Shares nothing about you."
        right={<CopyButton text={subject ? `Subject: ${subject}\n\n${body}` : body} label="Copy reply" />}
      />
      <div className="p-5">
        {subject && (
          <p className="mb-2 text-sm">
            <span className="text-bone-500">Subject: </span>
            <span className="text-bone-100">{subject}</span>
          </p>
        )}
        <p className="rounded-xl border border-white/[0.05] bg-black/25 p-4 text-sm leading-relaxed whitespace-pre-wrap text-bone-300">{body}</p>
      </div>
    </Card>
  );
}

function Assessment({ report }: { report: Report }) {
  const j = report.judgement;
  return (
    <Card>
      <CardHeader icon={<Scale className="size-4" />} title="How the evidence was weighed" subtitle="Nemotron Ultra's assessment, with citations" />
      <div className="space-y-5 p-5">
        <p className="leading-relaxed text-bone-300">
          <RefText text={j.assessment} />
        </p>
        {j.key_findings.length > 0 && (
          <ul className="space-y-2.5">
            {j.key_findings.map((f, i) => (
              <li key={i} className="flex gap-3 text-sm text-bone-300">
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", POLARITY_STYLE[f.polarity].dot)} aria-hidden />
                <span className="min-w-0">
                  {f.text}
                  {f.refs.map((r) => (
                    <RefText key={r} text={`[${r}]`} />
                  ))}
                  {f.disputed && (
                    <span className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-caution-400/[0.06] px-2.5 py-1.5 text-xs leading-relaxed text-caution-200 ring-1 ring-caution-400/20 ring-inset">
                      <Swords className="mt-0.5 size-3 shrink-0" aria-hidden />
                      <span>
                        <span className="font-semibold">Disputed by Nemotron Super: </span>
                        <RefText text={f.disputed} />
                      </span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {j.limitations && (
          <p className="rounded-xl border border-white/[0.06] px-4 py-3 text-xs leading-relaxed text-bone-500">
            <span className="font-semibold text-bone-400">Limitations. </span>
            {j.limitations}
          </p>
        )}
      </div>
    </Card>
  );
}

function OriginalMessage({ report }: { report: Report }) {
  const e = report.entities;
  const facts = [
    ["Supplier", e.supplier_name],
    ["Claims to be", e.claimed_type !== "unknown" ? e.claimed_type : ""],
    ["Registration", e.registration_no],
    ["Address", e.address],
    ["Products", e.products],
    ["Deposit terms", e.deposit],
    ["Pay to", e.payment?.beneficiary ?? ""],
    ["Platform", e.platform],
  ].filter(([, v]) => v);
  return (
    <Card>
      <details className="group">
        <summary className="flex list-none items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-[10px] border border-white/[0.07] bg-white/[0.03] text-bone-300">
              <MessageSquareQuote className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-bone-50">The message you checked</span>
              <span className="block text-xs text-bone-500">and the facts Nemotron Nano pulled out of it</span>
            </span>
          </span>
          <ChevronDown className="size-4 text-bone-500 transition duration-500 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-5 border-t border-white/[0.06] p-5 md:grid-cols-[1fr_260px]">
          <p
            className="scroll-slim max-h-80 overflow-y-auto rounded-xl bg-black/25 p-4 text-sm leading-relaxed whitespace-pre-wrap text-bone-400"
          >
            {report.input.message}
          </p>
          <dl className="space-y-3 text-sm">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-bone-500">{k}</dt>
                <dd className="break-words text-bone-100">{v}</dd>
              </div>
            ))}
            {e.requests.length > 0 && (
              <div>
                <dt className="text-[11px] text-bone-500">Asks you to</dt>
                <dd>
                  <ul className="list-disc space-y-1 pl-4 text-bone-300">
                    {e.requests.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </details>
    </Card>
  );
}

export function ReportView({ report, runId, onReplay }: { report: Report; runId: string; onReplay?: () => void }) {
  const t = report.telemetry;
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/investigations?id=${encodeURIComponent(runId)}`;
  const slug = (report.entities.supplier_name || "supplier").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="space-y-6">
      <DecisionHero report={report} />

      <div data-print-hide>
        <PaymentGate runId={runId} decision={report.judgement.decision} />
      </div>

      <div data-print-hide className="flex flex-wrap items-center gap-2">
        <CopyButton text={link} label="Copy link" className="py-2" />
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => downloadText(`proofbeforepay-${slug}.md`, reportToMarkdown(report, link))}
        >
          <Download className="size-3.5" aria-hidden />
          Download report
        </Button>
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => window.print()}>
          <Printer className="size-3.5" aria-hidden />
          Save as PDF
        </Button>
        {onReplay && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onReplay}>
            <Play className="size-3.5" aria-hidden />
            Replay the investigation
          </Button>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-bone-500">
          <Link2 className="size-3.5" aria-hidden />
          {DECISION_LABEL[report.judgement.decision]} · {t.calls.length} model calls · {usd(t.cost_usd)}
        </span>
      </div>

      <ProofTrail report={report} />

      <div data-print-hide>
        <AgentTrace runId={runId} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Reveal className="min-w-0 space-y-6 lg:col-span-8" selector=":scope > *" stagger={0.1} y={28}>
          <ActionPlan report={report} />
          {report.challenge && <ChallengePanel challenge={report.challenge} decision={report.judgement.decision} />}
          <div data-print-hide>
            <AskReport runId={runId} decision={report.judgement.decision} />
          </div>
          <SafeReply report={report} />
          <TrailPanel leads={report.leads ?? []} signals={report.signals} stopReason={report.stop_reason} />
          <SignalList signals={report.signals} sorted />
          <ClaimBoard claims={report.claims} />
          <Assessment report={report} />
          <OriginalMessage report={report} />
          <div data-print-hide>
            <FeedbackWidget runId={runId} />
          </div>
        </Reveal>
        <Reveal as="div" className="min-w-0 space-y-6 lg:col-span-4" selector=":scope > *" stagger={0.1} y={28} delay={0.15}>
          <RoutingPanel calls={t.calls} tavily={{ calls: t.tavily.calls, credits: t.tavily.credits, byKind: t.tavily.by_kind }} />
          <SourceList sources={report.sources} />
        </Reveal>
      </div>
    </div>
  );
}
