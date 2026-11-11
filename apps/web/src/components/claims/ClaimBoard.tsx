"use client";

import { ArrowUpRight, CircleCheck, CircleDashed, CircleQuestionMark, CircleX, Quote, ScanSearch } from "lucide-react";
import { motion } from "motion/react";
import type { Claim, ClaimStatus } from "@/types";
import { Card, CardHeader, cx, RefChip, Spinner, TierBadge } from "@/components/ui";


const STATUS_META: Record<ClaimStatus, { label: string; icon: typeof CircleCheck; tone: string; card: string; bar: string }> = {
  pending: { label: "Queued", icon: CircleDashed, tone: "text-bone-500", card: "border-white/[0.06] bg-white/[0.01]", bar: "bg-bone-600" },
  checking: { label: "Checking", icon: CircleDashed, tone: "text-sand-200", card: "border-sand-300/25 bg-sand-300/[0.04]", bar: "bg-sand-300" },
  verified: { label: "Verified", icon: CircleCheck, tone: "text-brand-300", card: "border-brand-500/20 bg-brand-500/[0.045]", bar: "bg-brand-400" },
  contradicted: { label: "Contradicted", icon: CircleX, tone: "text-stop-300", card: "border-stop-500/25 bg-stop-500/[0.05]", bar: "bg-stop-400" },
  inconclusive: { label: "Inconclusive", icon: CircleQuestionMark, tone: "text-caution-300", card: "border-caution-400/20 bg-caution-400/[0.04]", bar: "bg-caution-400" },
};

export function ClaimBoard({ claims, waiting = false }: { claims: Claim[]; waiting?: boolean }) {
  const settled = claims.filter((c) => c.status !== "pending" && c.status !== "checking").length;
  return (
    <Card>
      <CardHeader
        icon={<ScanSearch className="size-4" />}
        title="Claim-by-claim checks"
        subtitle="Every checkable claim in the message, tested against the web. Nano first, Super when unsure."
        right={
          claims.length > 0 && (
            <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-bone-400">
              <span className="h-1 w-10 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className="block h-full origin-left rounded-full bg-brand-400 transition-transform duration-700"
                  style={{ transform: `scaleX(${settled / claims.length})` }}
                />
              </span>
              {settled}/{claims.length}
            </span>
          )
        }
      />
      <ul className="grid gap-2 p-3">
        {claims.map((claim, index) => (
          <ClaimCard key={claim.id} claim={claim} index={index} />
        ))}
        {waiting && claims.length === 0 && (
          <li className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-bone-500">
            <span className="scan-line absolute inset-x-0 bottom-0 h-px" aria-hidden />
            <Spinner className="size-3.5" /> Pulling the claims out of the message…
          </li>
        )}
        {!waiting && claims.length === 0 && (
          <li className="rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-bone-500">
            The message makes no claims that can be checked on the web, so the decision rests on the hard signals.
          </li>
        )}
      </ul>
    </Card>
  );
}

function ClaimCard({ claim, index }: { claim: Claim; index: number }) {
  const meta = STATUS_META[claim.status];
  const Icon = meta.icon;
  const busy = claim.status === "checking";
  const settled = claim.status !== "pending" && !busy;
  return (
    <motion.li
      id={`ref-${claim.id}`}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: index * 0.05 }}
      className={cx("relative scroll-mt-28 overflow-hidden rounded-xl border px-4 py-3 transition-colors duration-700", meta.card)}
    >
      {busy && <span className="scan-line absolute inset-x-0 bottom-0 h-px" aria-hidden />}
      <div className="flex items-start gap-3">
        <span className={cx("mt-0.5 shrink-0 transition-colors duration-500", meta.tone)}>
          {busy ? <Spinner className="size-4" /> : <Icon className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[10.5px] text-bone-500">{claim.id}</span>
            <span className={cx("text-xs font-semibold", meta.tone)}>
              {busy ? (claim.escalated ? "Re-checking with fresh evidence" : "Checking sources") : meta.label}
            </span>
            {claim.confidence !== undefined && settled && (
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-bone-500">
                <span className="h-1 w-8 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className={cx("block h-full rounded-full", meta.bar)} style={{ width: `${Math.round(claim.confidence * 100)}%` }} />
                </span>
                {Math.round(claim.confidence * 100)}%
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              {claim.escalated && settled && (
                <span className="font-mono text-[10px] text-bone-500" title="Nano was unsure, so Super checked again with a fresh search">
                  nano → super
                </span>
              )}
              {claim.checked_by === "code" && claim.status !== "pending" && <span className="font-mono text-[10px] text-bone-500" title="Decided by rules in code, comparing the claim with what the sources say">checked by code</span>}
              {claim.checked_by && claim.checked_by !== "code" && claim.status !== "pending" && <TierBadge tier={claim.checked_by} prefix="" className="text-[10px]" />}
            </span>
          </div>
          <p className="mt-1 text-sm text-bone-100">{claim.text}</p>
          {claim.note && settled && <p className="mt-1 text-xs text-bone-400">{claim.note}</p>}
          {claim.quote && claim.source && settled && (
            <blockquote className="mt-2.5 flex gap-2 rounded-lg border-l-2 border-white/10 bg-black/25 px-3 py-2 text-xs text-bone-300">
              <Quote className="mt-0.5 size-3 shrink-0 text-bone-500" aria-hidden />
              <span className="min-w-0">
                “{claim.quote}”
                <a
                  href={claim.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 inline-flex items-center gap-0.5 text-bone-500 underline-offset-2 hover:text-bone-100 hover:underline"
                >
                  {claim.source.domain}
                  <ArrowUpRight className="size-3" aria-hidden />
                </a>
                <RefChip id={claim.source.id} />
              </span>
            </blockquote>
          )}
        </div>
      </div>
    </motion.li>
  );
}
