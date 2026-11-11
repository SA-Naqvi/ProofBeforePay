"use client";

import { ArrowUpRight, BrainCircuit, Globe, Library, ListTree, ScanText, Search, Spline, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clock, duration } from "@/lib/formatters";
import type { Source } from "@/types";
import type { Activity, LiveState } from "@/features/investigations/useInvestigationStream";
import { Card, CardHeader, cx, REVEAL_EVENT, Spinner, TierBadge } from "@/components/ui";

const STREAM_TAIL = 9000;

/** Nemotron Ultra's reasoning, streamed token by token while it weighs the evidence. */
export function ReasoningStream({ stream, active }: { stream: LiveState["stream"]; active: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const hasThinking = stream.some((s) => s.kind === "thinking");
  const visible = hasThinking ? stream.filter((s) => s.kind === "thinking") : stream;
  const writingAnswer = hasThinking && stream[stream.length - 1]?.kind === "content";
  const text = visible.map((s) => s.text).join("");
  const tail = text.length > STREAM_TAIL ? `…${text.slice(-STREAM_TAIL)}` : text;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tail.length, writingAnswer]);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<BrainCircuit className="size-4" />}
        title="Investigator reasoning"
        subtitle="Streaming live from Nemotron Ultra on Nebius Token Factory"
        right={<TierBadge tier="ultra" />}
      />
      <div className="relative">
        {active && <div className="scan-line absolute inset-x-0 top-0 h-px" aria-hidden />}
        <div
          ref={box}
          className="scroll-slim max-h-80 overflow-y-auto bg-black/20 px-5 py-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-bone-400"
        >
          {tail || (
            <span className="flex items-center gap-2 text-bone-500">
              <Spinner className="size-3.5" /> Waiting for the first tokens…
            </span>
          )}
          {active && tail && !writingAnswer && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-caret bg-brand-400 align-middle" />}
          {writingAnswer && (
            <p className="mt-3 flex items-center gap-2 font-sans text-xs text-brand-300">
              <Spline className="size-3.5" aria-hidden /> Reasoning done. Writing up the decision…
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

const PURPOSE_LABEL: Record<string, string> = {
  registry: "company registry",
  trade: "customs records",
  certificate: "certificate directory",
  address: "address",
  image: "photo search",
  domain: "domain record",
  web: "web search",
  listing: "supplier listing",
  challenge: "counter-search",
};

function ActivityRow({ item }: { item: Activity }) {
  if (item.kind === "log") {
    return (
      <li className="flex animate-fade-up gap-3 py-2">
        <span className="w-9 shrink-0 font-mono text-[10.5px] text-bone-600">{clock(item.t)}</span>
        <span className={cx("flex min-w-0 gap-1.5 text-xs", item.level === "warn" ? "text-caution-300" : "text-bone-300")}>
          {item.level === "warn" && <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />}
          {item.message}
        </span>
      </li>
    );
  }
  const { call } = item;
  const Icon = call.kind === "crawl" ? ListTree : call.kind === "exact" ? ScanText : Search;
  return (
    <li className="flex animate-fade-up gap-3 py-2">
      <span className="w-9 shrink-0 font-mono text-[10.5px] text-bone-600">{clock(item.t)}</span>
      <span className="min-w-0 text-xs text-bone-400">
        <span className="mr-1.5 inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-px text-[10px] font-medium text-bone-200 ring-1 ring-white/[0.07] ring-inset">
          <Icon className="size-3" aria-hidden />
          Tavily {call.kind === "exact" ? "exact match" : call.kind}
        </span>
        <span className="text-bone-500">{PURPOSE_LABEL[call.purpose] ?? call.purpose}:</span>{" "}
        <span className="break-words text-bone-200">{call.kind === "crawl" ? call.url : call.query}</span>{" "}
        <span className={cx("font-mono text-[10.5px]", call.ok ? "text-bone-600" : "text-stop-300")}>
          {call.ok ? `${call.results} results · ${duration(call.latency_ms)}` : "failed"}
        </span>
      </span>
    </li>
  );
}

export function ActivityLog({ activity, active }: { activity: Activity[]; active: boolean }) {
  const box = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity.length]);
  return (
    <Card>
      <CardHeader icon={<Globe className="size-4" />} title="Activity" subtitle="Every search, crawl and step as it happens" />
      <ul ref={box} className="scroll-slim max-h-72 divide-y divide-white/[0.04] overflow-y-auto px-5 py-2">
        {activity.map((item, i) => (
          <ActivityRow key={i} item={item} />
        ))}
        {active && (
          <li className="flex items-center gap-2 py-2.5 text-xs text-bone-500">
            <Spinner className="size-3" /> Working…
          </li>
        )}
      </ul>
    </Card>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const reveal = (event: Event) => {
      if (String((event as CustomEvent).detail).startsWith("S")) setExpanded(true);
    };
    window.addEventListener(REVEAL_EVENT, reveal);
    return () => window.removeEventListener(REVEAL_EVENT, reveal);
  }, []);
  const shown = expanded ? sources : sources.slice(0, 8);
  return (
    <Card>
      <CardHeader icon={<Library className="size-4" />} title="Sources" subtitle={`${sources.length} unique pages read by the agents`} />
      {sources.length === 0 ? (
        <p className="px-5 py-4 text-sm text-bone-500">Sources show up here as the agents read them.</p>
      ) : (
        <ul className="divide-y divide-white/[0.04] px-2 py-1">
          {shown.map((source) => (
            <li key={source.id} id={`ref-${source.id}`} className="animate-fade-up scroll-mt-28 rounded-xl">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] font-mono text-[11px] text-bone-300 uppercase ring-1 ring-white/[0.06] ring-inset">
                  {source.domain.replace(/^www\./, "").charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm text-bone-100 group-hover:text-bone-50">{source.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-bone-500">
                    <span className="font-mono text-brand-300/80">{source.id}</span>
                    {source.domain}
                    {source.purposes.map((p) => (
                      <span key={p} className="text-bone-600">
                        · {PURPOSE_LABEL[p] ?? p}
                      </span>
                    ))}
                  </span>
                </span>
                <ArrowUpRight
                  className="mt-0.5 size-3.5 shrink-0 text-bone-600 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-bone-200"
                  aria-hidden
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      {sources.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-white/[0.06] py-3 text-xs font-medium text-bone-400 transition hover:text-bone-50"
        >
          {expanded ? "Show fewer" : `Show all ${sources.length}`}
        </button>
      )}
    </Card>
  );
}
