"use client";

import { ArrowRight, CircleCheck, CircleQuestionMark, CircleX, Copy, ListTree, ScanText, Search } from "lucide-react";
import type { ReactNode } from "react";
import { TierBadge } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { StageKey } from "@/types";

/** Small illustrated screens for each pipeline step, using a made-up supplier. */
function Frame({ name, badge, children }: { name: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
          </span>
          <span className="ml-2 font-mono text-[11px] text-bone-500">{name}</span>
        </span>
        {badge}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Row({ k, v, tone, i }: { k: string; v: string; tone?: string; i: number }) {
  return (
    <div className="flex animate-fade-up items-center justify-between gap-4 border-b border-white/[0.05] py-2 last:border-0" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
      <span className="font-mono text-[11px] text-bone-500">{k}</span>
      <span className={cx("text-right text-sm", tone ?? "text-bone-100")}>{v}</span>
    </div>
  );
}

function Intake() {
  return (
    <Frame name="intake · nemotron-nano" badge={<TierBadge tier="nano" />}>
      <p className="rounded-xl bg-black/25 p-3 text-[13px] leading-relaxed text-bone-400">
        “…we are a <span className="text-caution-300">factory with 200 workers</span>. Licence 91440300…{" "}
        <span className="text-stop-300">pay 100% in advance to Mr. Li Wei</span>…”
      </p>
      <div className="mt-4">
        {[
          ["supplier", "Brightstar Textile Co., Ltd."],
          ["claims to be", "Manufacturer", "text-caution-300"],
          ["registration", "91440300MA5F…"],
          ["certificate", "ISO 9001 · QMS-2231"],
          ["pay to", "Mr. Li Wei (personal)", "text-stop-300"],
          ["claims to check", "6"],
        ].map(([k, v, tone], i) => (
          <Row key={k} k={k ?? ""} v={v ?? ""} tone={tone} i={i} />
        ))}
      </div>
    </Frame>
  );
}

function Investigate() {
  return (
    <Frame name="investigate · rounds of lookups" badge={<TierBadge tier="super" />}>
      <ol className="space-y-2.5 text-[13px]">
        {[
          ["L1", "Registry", "91440300… belongs to a different company", "text-stop-300", 0],
          ["L8", "Customs log", "Under that company: 214 export shipments", "text-bone-200", 1],
          ["L5", "Reverse-image search", "Factory photo also on hengli-garments.com", "text-caution-300", 0],
          ["L13", "Who runs that site?", "Same company: the photo isn't theirs", "text-stop-300", 1],
        ].map(([id, tool, result, tone, depth], i) => (
          <li
            key={String(id)}
            className="flex animate-fade-up items-start gap-3 rounded-xl bg-black/25 px-3 py-2"
            style={{ marginLeft: Number(depth) * 20, animationDelay: `${0.15 + i * 0.1}s` }}
          >
            <span className="font-mono text-[11px] text-bone-500">{id}</span>
            <span className="min-w-0">
              <span className="block text-bone-300">{tool}</span>
              <span className={cx("block", String(tone))}>{result}</span>
            </span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Judge() {
  return (
    <Frame name="judge · nemotron-ultra" badge={<TierBadge tier="ultra" />}>
      <div className="rounded-xl bg-black/30 p-4 font-mono text-[12px] leading-relaxed text-bone-400">
        <p className="animate-fade-up">The registration number belongs to Dongguan Hengli Garments, not Brightstar [F1], and the same company&apos;s photo and ISO certificate are on the invoice [F5, F6].</p>
        <p className="mt-2 animate-fade-up" style={{ animationDelay: "0.3s" }}>
          The factory address is a residential block [F4] and the deposit would go to a personal account [F3].
        </p>
        <p className="mt-2 animate-fade-up" style={{ animationDelay: "0.6s" }}>
          Nothing ties Brightstar to the factory it shows<span className="ml-0.5 inline-block h-3 w-1.5 animate-caret bg-brand-400 align-middle" />
        </p>
      </div>
      <div className="mt-4 flex animate-fade-up items-center justify-between rounded-xl border border-stop-500/30 bg-stop-500/[0.06] px-4 py-3" style={{ animationDelay: "0.9s" }}>
        <span className="text-xl font-semibold tracking-[-0.03em] text-stop-300">Stop.</span>
        <span className="font-mono text-[11px] text-bone-400">confidence 94</span>
      </div>
    </Frame>
  );
}

function Challenge() {
  return (
    <Frame name="challenge · nemotron-super" badge={<TierBadge tier="super" />}>
      <p className="font-mono text-[11px] tracking-[0.1em] text-bone-500 uppercase">Trying to prove “Stop” wrong</p>
      <div className="mt-3 space-y-2">
        {["Brightstar Hengli Garments group company", "Brightstar Textile reviews complaints"].map((q, i) => (
          <div
            key={q}
            className="flex animate-fade-up items-center gap-2.5 rounded-lg bg-black/25 px-3 py-2 text-[13px] text-bone-300"
            style={{ animationDelay: `${0.1 + i * 0.15}s` }}
          >
            <Search className="size-3.5 shrink-0 text-sand-300" aria-hidden />
            <span className="truncate">{q}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 animate-fade-up rounded-xl border border-white/[0.06] bg-black/25 p-3 text-[13px] leading-relaxed text-bone-300" style={{ animationDelay: "0.45s" }}>
        <span className="text-bone-500">Best case against it: </span>Brightstar might be Hengli&apos;s export arm. Weak, because Hengli&apos;s registered scope
        never mentions it <span className="font-mono text-[10.5px] text-brand-300">S4</span>.
      </p>
      <div className="mt-3 flex animate-fade-up items-center gap-2 rounded-xl border border-caution-400/25 bg-caution-400/[0.05] px-3 py-2.5 text-[12.5px] text-bone-200" style={{ animationDelay: "0.65s" }}>
        <span className="min-w-0 flex-1">If Hengli confirms Brightstar is its agent</span>
        <ArrowRight className="size-3.5 shrink-0 text-bone-500" aria-hidden />
        <span className="shrink-0 font-medium text-caution-300">Verify first</span>
      </div>
      <div className="mt-4 flex animate-fade-up items-center justify-between rounded-xl border border-stop-500/30 bg-stop-500/[0.06] px-4 py-3" style={{ animationDelay: "0.85s" }}>
        <span className="text-sm font-semibold text-stop-300">Verdict holds · Stop</span>
        <span className="font-mono text-[11px] text-bone-400">2 models agree</span>
      </div>
    </Frame>
  );
}

function Brief() {
  return (
    <Frame name="brief · nemotron-nano" badge={<TierBadge tier="nano" />}>
      <p className="text-[11px] text-bone-500">
        Subject: <span className="text-bone-100">Verification before the deposit</span>
      </p>
      <p className="mt-3 rounded-xl border border-white/[0.05] bg-black/25 p-4 text-[13px] leading-relaxed text-bone-300">
        Hi, before I send a deposit, could you share a copy of your business licence, a bank letter showing the account is in your
        company&apos;s name, and join a live video call from the factory? I&apos;m happy to arrange an inspection.
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-brand-300">
          <CircleCheck className="size-3.5" aria-hidden /> Shares nothing about you
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-bone-200 ring-1 ring-white/10 ring-inset">
          <Copy className="size-3.5" aria-hidden /> Copy reply
        </span>
      </div>
    </Frame>
  );
}

const VISUALS: Record<StageKey, () => ReactNode> = {
  intake: Intake,
  investigate: Investigate,
  judge: Judge,
  challenge: Challenge,
  brief: Brief,
};

export function StageVisual({ stage }: { stage: StageKey }) {
  const Visual = VISUALS[stage];
  return <Visual />;
}
