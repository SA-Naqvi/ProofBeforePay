"use client";

import { GitBranch } from "lucide-react";
import type { Lead, Signal } from "@/types";
import { Card, CardHeader, cx, POLARITY_STYLE, Spinner } from "@/components/ui";

const TOOL_LABEL: Record<Lead["tool"], string> = {
  registry: "Company registry",
  trade: "Customs & trade records",
  certificate: "Certificate directory",
  domain: "Domain record",
  address: "Map survey",
  image: "Reverse-image search",
  web: "Web search",
};

const STATUS: Record<Lead["status"], { label: string; tone: string }> = {
  open: { label: "queued", tone: "text-bone-500" },
  running: { label: "running", tone: "text-caution-300" },
  done: { label: "done", tone: "text-brand-300" },
  unavailable: { label: "not checked", tone: "text-caution-300" },
  skipped: { label: "not run", tone: "text-bone-500" },
};

const targetText = (lead: Lead) =>
  Object.entries(lead.target)
    .filter(([key]) => key !== "own_domains" && key !== "role")
    .map(([, value]) => value)
    .join(" · ");

function LeadRow({ lead, leads, signals, depth }: { lead: Lead; leads: Lead[]; signals: Signal[]; depth: number }) {
  const found = signals.filter((s) => s.lead === lead.id);
  const children = leads.filter((l) => l.parent_lead === lead.id);
  return (
    <li>
      <div
        id={`ref-${lead.id}`}
        className="scroll-mt-28 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
        style={{ marginLeft: depth * 18 }}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[10.5px] text-bone-500">{lead.id}</span>
          <span className="text-sm font-semibold text-bone-100">{TOOL_LABEL[lead.tool]}</span>
          <span className={cx("font-mono text-[10.5px] tracking-wide uppercase", STATUS[lead.status].tone)}>
            {lead.status === "running" ? <Spinner className="mr-1 inline size-3" /> : null}
            {STATUS[lead.status].label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-bone-400" title={targetText(lead)}>
          {targetText(lead)}
        </p>
        <p className="mt-1 text-xs text-bone-500">
          {lead.parent_finding ? (
            <>
              Opened after <span className="font-mono text-bone-300">{lead.parent_finding}</span>: {lead.why}
            </>
          ) : (
            lead.why
          )}
        </p>
        {lead.summary && lead.status !== "running" && <p className="mt-1 text-xs text-bone-500">{lead.summary}</p>}
        {found.length > 0 && (
          <ul className="mt-2 grid grid-cols-1 gap-1">
            {found.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-xs">
                <span className={cx("mt-1 size-1.5 shrink-0 rounded-full", POLARITY_STYLE[s.polarity].dot)} aria-hidden />
                <span className="text-bone-300">
                  <span className="font-mono text-bone-500">{s.id}</span> {s.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {children.length > 0 && (
        <ul className="mt-1.5 grid grid-cols-1 gap-1.5">
          {children.map((child) => (
            <LeadRow key={child.id} lead={child} leads={leads} signals={signals} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Every lookup the investigation ran, nested under the finding that opened it: the chain from claim to conclusion. */
export function TrailPanel({ leads, signals, stopReason, waiting = false }: { leads: Lead[]; signals: Signal[]; stopReason?: string; waiting?: boolean }) {
  const roots = leads.filter((l) => !l.parent_lead);
  return (
    <Card>
      <CardHeader
        icon={<GitBranch className="size-4" />}
        title="Chain of evidence"
        subtitle="Each lookup, and the finding that made us run the next one"
        right={<span className="font-mono text-xs text-bone-400">{leads.length} lookups</span>}
      />
      <ul className="grid grid-cols-1 gap-1.5 p-3">
        {roots.map((lead) => (
          <LeadRow key={lead.id} lead={lead} leads={leads} signals={signals} depth={0} />
        ))}
        {waiting && (
          <li className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-bone-500">
            <Spinner className="size-3.5" /> Following the evidence…
          </li>
        )}
        {!waiting && leads.length === 0 && (
          <li className="rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-bone-500">No lookups were run.</li>
        )}
      </ul>
      {stopReason && <p className="border-t border-white/[0.06] px-4 py-2.5 text-xs text-bone-500">{stopReason}</p>}
    </Card>
  );
}
