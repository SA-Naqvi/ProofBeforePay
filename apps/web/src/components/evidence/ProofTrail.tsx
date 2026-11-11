"use client";

import { ExternalLink, Route } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { dateTime } from "@/lib/formatters";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import type { Report } from "@/types";
import { Card, CardHeader, cx, DECISION_STYLE, POLARITY_STYLE, RefText, SectionLabel, TierBadge } from "@/components/ui";

type Tone = "red" | "amber" | "green" | "neutral";
type Kind = "source" | "claim" | "signal" | "finding" | "decision" | "challenge";

interface TrailNode {
  id: string;
  col: 0 | 1 | 2 | 3;
  kind: Kind;
  tag: string;
  status: string;
  text: string;
  tone: Tone;
}

interface TrailEdge {
  from: string;
  to: string;
  tone: Tone;
}

const TONE: Record<Tone, { card: string; text: string; hex: string }> = {
  red: { card: "border-stop-500/30 bg-stop-500/[0.07]", text: "text-stop-300", hex: "#ff6f5e" },
  amber: { card: "border-caution-400/30 bg-caution-400/[0.06]", text: "text-caution-300", hex: "#f2b33d" },
  green: { card: "border-brand-500/30 bg-brand-500/[0.07]", text: "text-brand-300", hex: "#9bd424" },
  neutral: { card: "border-white/[0.09] bg-white/[0.025]", text: "text-bone-400", hex: "#c9c1b1" },
};

const CLAIM = {
  verified: { tone: "green", status: "Verified" },
  contradicted: { tone: "red", status: "Contradicted" },
  inconclusive: { tone: "neutral", status: "Unverified" },
  checking: { tone: "neutral", status: "Checking" },
  pending: { tone: "neutral", status: "Queued" },
} as const;

const COLUMNS = ["Sources read", "Evidence", "Findings", "Verdict"];

/** Turns a report into the claim → evidence → finding → verdict graph. Only sources something actually cites appear. */
function buildTrail(report: Report): { nodes: TrailNode[]; edges: TrailEdge[] } {
  const findings = report.judgement.key_findings;
  const cited = new Set(findings.flatMap((f) => f.refs));
  const signals = report.signals.filter((s) => cited.has(s.id));
  const shownSignals = signals.length ? signals : report.signals.filter((s) => s.severity === "high").slice(0, 4);
  const sourceIds = [
    ...new Set([
      ...report.claims.map((c) => c.source_id).filter((id): id is string => Boolean(id)),
      ...findings.flatMap((f) => f.refs.filter((r) => r.startsWith("S"))),
    ]),
  ].slice(0, 9);
  const sources = new Map(report.sources.map((s) => [s.id, s]));

  const nodes: TrailNode[] = [];
  for (const id of sourceIds) {
    const s = sources.get(id);
    if (s) nodes.push({ id, col: 0, kind: "source", tag: id, status: "Source", text: s.domain, tone: "neutral" });
  }
  for (const c of report.claims) {
    const meta = CLAIM[c.status];
    nodes.push({ id: c.id, col: 1, kind: "claim", tag: c.id, status: meta.status, text: c.text, tone: meta.tone });
  }
  for (const s of shownSignals) {
    nodes.push({ id: s.id, col: 1, kind: "signal", tag: s.id, status: POLARITY_STYLE[s.polarity].label, text: s.title, tone: s.polarity });
  }
  findings.forEach((f, i) => {
    nodes.push({ id: `K${i + 1}`, col: 2, kind: "finding", tag: `K${i + 1}`, status: POLARITY_STYLE[f.polarity].label, text: f.text, tone: f.polarity });
  });
  const decision = report.judgement.decision;
  const decisionTone: Tone = decision === "STOP" ? "red" : decision === "PROCEED" ? "green" : "amber";
  nodes.push({ id: "VERDICT", col: 3, kind: "decision", tag: "Verdict", status: `${report.judgement.confidence} confidence`, text: DECISION_STYLE[decision].word, tone: decisionTone });
  if (report.challenge) {
    const outcome = { holds: "Verdict holds", weakened: "Verdict weakened", overturned: "Verdict changed" }[report.challenge.outcome];
    nodes.push({
      id: "CHALLENGE",
      col: 3,
      kind: "challenge",
      tag: "Challenge",
      status: "Nemotron Super",
      text: outcome,
      tone: report.challenge.outcome === "holds" ? "neutral" : "amber",
    });
  }

  const present = new Set(nodes.map((n) => n.id));
  const edges: TrailEdge[] = [];
  for (const c of report.claims) {
    if (c.source_id && present.has(c.source_id)) edges.push({ from: c.source_id, to: c.id, tone: CLAIM[c.status].tone });
  }
  findings.forEach((f, i) => {
    for (const ref of f.refs) if (present.has(ref)) edges.push({ from: ref, to: `K${i + 1}`, tone: f.polarity });
    edges.push({ from: `K${i + 1}`, to: "VERDICT", tone: f.polarity });
  });
  if (report.challenge) edges.push({ from: "CHALLENGE", to: "VERDICT", tone: report.challenge.outcome === "holds" ? "neutral" : "amber" });
  return { nodes, edges };
}

/** Every node upstream and downstream of `id`: the full trail it belongs to. */
function trailOf(id: string, edges: TrailEdge[]): Set<string> {
  const lit = new Set([id]);
  const walk = (start: string, next: (e: TrailEdge) => [string, string]) => {
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const e of edges) {
        const [a, b] = next(e);
        if (a === current && !lit.has(b)) {
          lit.add(b);
          queue.push(b);
        }
      }
    }
  };
  walk(id, (e) => [e.to, e.from]);
  walk(id, (e) => [e.from, e.to]);
  return lit;
}

type Box = { left: number; right: number; mid: number };

export function ProofTrail({ report }: { report: Report }) {
  const { nodes, edges } = useMemo(() => buildTrail(report), [report]);
  const canvas = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = hovered ?? selected;
  const lit = useMemo(() => (focus ? trailOf(focus, edges) : null), [focus, edges]);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () => {
      const origin = el.getBoundingClientRect();
      const next: Record<string, Box> = {};
      refs.current.forEach((node, id) => {
        const r = node.getBoundingClientRect();
        next[id] = { left: r.left - origin.left, right: r.right - origin.left, mid: r.top - origin.top + r.height / 2 };
      });
      setBoxes(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [nodes]);

  const ready = Object.keys(boxes).length > 0;
  useGSAP(
    () => {
      if (!ready) return;
      gsap.matchMedia().add(MOTION_OK, () => {
        // fromTo with explicit end values: a from() re-run would record the hidden state as its end state.
        gsap
          .timeline({ scrollTrigger: { trigger: canvas.current, start: "top 78%", once: true } })
          .fromTo(
            "[data-trail-node]",
            { autoAlpha: 0, x: -14 },
            { autoAlpha: 1, x: 0, duration: 0.7, ease: "expo.out", stagger: 0.035, clearProps: "transform,opacity,visibility" },
          )
          .fromTo("[data-trail-edge]", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", stagger: 0.012 }, 0.25);
      });
    },
    { scope: canvas, dependencies: [ready] },
  );

  const columns = [0, 1, 2, 3].map((col) => nodes.filter((n) => n.col === col));
  const active = nodes.find((n) => n.id === focus) ?? null;

  return (
    <Card id="proof-trail">
      <CardHeader
        icon={<Route className="size-4" />}
        title="Proof Trail"
        subtitle="Every source, check and finding behind the verdict. Click any point to trace it."
        right={
          selected && (
            <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-xs text-bone-400 transition hover:text-bone-50">
              Clear
            </button>
          )
        }
      />
      <div className="scroll-slim overflow-x-auto">
        <div ref={canvas} className="relative min-w-[900px] px-5 pt-5 pb-6">
          <div className="mb-4 grid grid-cols-[0.8fr_1.2fr_1.25fr_0.8fr] gap-x-14">
            {COLUMNS.map((label, i) => (
              <p key={label} className="font-mono text-[10.5px] tracking-[0.16em] text-bone-500 uppercase">
                {label} {i < 3 && <span className="text-bone-600">{columns[i]!.length}</span>}
              </p>
            ))}
          </div>
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
            {ready &&
              edges.map((e) => {
                const a = boxes[e.from];
                const b = boxes[e.to];
                // The challenge sits right under the verdict; a stub joins them (see the node), not a curve.
                if (!a || !b || e.from === "CHALLENGE") return null;
                const dx = Math.max(40, (b.left - a.right) * 0.5);
                const d = `M ${a.right} ${a.mid} C ${a.right + dx} ${a.mid}, ${b.left - dx} ${b.mid}, ${b.left} ${b.mid}`;
                const on = lit ? lit.has(e.from) && lit.has(e.to) : null;
                const color = TONE[e.tone].hex;
                return (
                  <g key={`${e.from}-${e.to}`} className="transition-opacity duration-500" style={{ opacity: on === null ? 0.42 : on ? 1 : 0.06 }}>
                    <path data-trail-edge d={d} pathLength={1} strokeDasharray={1} fill="none" stroke={color} strokeWidth={on ? 1.6 : 1.1} />
                    {on && <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" className="trail-flow" />}
                  </g>
                );
              })}
          </svg>
          <div className="relative grid grid-cols-[0.8fr_1.2fr_1.25fr_0.8fr] gap-x-14">
            {columns.map((column, col) => (
              <div key={col} className="flex flex-col justify-center gap-2.5">
                {column.map((node) => {
                  const dim = lit ? !lit.has(node.id) : false;
                  const tone = TONE[node.tone];
                  const big = node.kind === "decision";
                  return (
                    <button
                      key={node.id}
                      ref={(el) => {
                        if (el) refs.current.set(node.id, el);
                        else refs.current.delete(node.id);
                      }}
                      data-trail-node
                      type="button"
                      aria-pressed={selected === node.id}
                      onClick={() => setSelected((s) => (s === node.id ? null : node.id))}
                      onPointerEnter={() => setHovered(node.id)}
                      onPointerLeave={() => setHovered(null)}
                      onFocus={() => setHovered(node.id)}
                      onBlur={() => setHovered(null)}
                      className={cx(
                        "relative w-full rounded-xl border px-3 py-2 text-left transition-[filter,translate,box-shadow] duration-300 hover:-translate-y-0.5",
                        tone.card,
                        dim && "brightness-[0.35] saturate-50",
                        selected === node.id && "shadow-[0_0_0_1px_rgba(246,243,236,0.35)]",
                        big && "px-4 py-4",
                        node.kind === "challenge" && "before:absolute before:-top-2.5 before:left-1/2 before:h-2.5 before:w-px before:bg-white/20",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-black/30 px-1.5 py-px font-mono text-[10px] text-bone-300">{node.tag}</span>
                        <span className={cx("truncate font-mono text-[10px] tracking-[0.08em] uppercase", tone.text)}>{node.status}</span>
                      </span>
                      <span
                        className={cx(
                          "mt-1.5 block leading-snug",
                          big ? cx("text-3xl font-semibold tracking-[-0.04em]", tone.text) : "line-clamp-2 text-[12.5px] text-bone-200",
                        )}
                      >
                        {node.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <TrailDetail report={report} node={active} />
    </Card>
  );
}

function TrailDetail({ report, node }: { report: Report; node: TrailNode | null }) {
  return (
    <div className="min-h-[104px] border-t border-white/[0.06] px-5 py-4 text-sm" aria-live="polite">
      {!node ? (
        <p className="text-bone-500">
          <span className="hidden sm:inline">Hover or click</span>
          <span className="sm:hidden">Swipe across, then tap</span> a source, claim or finding to light up everything connected to it.
        </p>
      ) : (
        <DetailBody report={report} node={node} />
      )}
    </div>
  );
}

function DetailBody({ report, node }: { report: Report; node: TrailNode }) {
  const j = report.judgement;
  if (node.kind === "source") {
    const s = report.sources.find((x) => x.id === node.id)!;
    return (
      <div className="space-y-1.5">
        <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 font-medium text-bone-50 hover:text-brand-300">
          {s.title} <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <p className="font-mono text-[11px] text-bone-500">
          {s.domain} · found while looking for {s.purposes.join(", ")}
          {s.retrieved_at ? ` · read ${dateTime(s.retrieved_at)}` : ""}
        </p>
        <p className="line-clamp-2 text-bone-400">{s.snippet.replace(/[#*_>`|]+/g, " ").replace(/\s+/g, " ").trim()}</p>
      </div>
    );
  }
  if (node.kind === "claim") {
    const c = report.claims.find((x) => x.id === node.id)!;
    return (
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-2 font-medium text-bone-50">
          {c.text} {c.checked_by && c.checked_by !== "code" && <TierBadge tier={c.checked_by} />}
        </p>
        {c.note && <p className="text-bone-400">{c.note}</p>}
        {c.quote && (
          <p className="border-l-2 border-white/10 pl-3 text-bone-300">
            “{c.quote}” {c.source_id && <RefText text={`[${c.source_id}]`} />}
          </p>
        )}
      </div>
    );
  }
  if (node.kind === "signal") {
    const s = report.signals.find((x) => x.id === node.id)!;
    return (
      <div className="space-y-1">
        <p className="font-medium text-bone-50">
          {s.title} <span className="font-mono text-[11px] text-bone-500">found by code</span>
        </p>
        <p className="text-bone-400">
          <RefText text={s.detail} />
        </p>
        {s.why && <p className="text-xs text-bone-500">{s.why}</p>}
      </div>
    );
  }
  if (node.kind === "finding") {
    const f = j.key_findings[Number(node.id.slice(1)) - 1]!;
    return (
      <div className="space-y-1.5">
        <p className="font-medium text-bone-50">{f.text}</p>
        {f.refs.length > 0 && (
          <p className="text-xs text-bone-500">
            Rests on <RefText text={`[${f.refs.join(", ")}]`} />
          </p>
        )}
      </div>
    );
  }
  if (node.kind === "challenge" && report.challenge) {
    const ch = report.challenge;
    return (
      <div className="space-y-1.5">
        <SectionLabel>Best case against the verdict</SectionLabel>
        <p className="text-bone-300">
          {ch.strongest_counterpoint ? <RefText text={ch.strongest_counterpoint} /> : "No credible argument against it turned up."}
        </p>
        {ch.effect && <p className="text-xs text-caution-300">{ch.effect}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-bone-50">{j.headline}</p>
      <p className="text-xs text-bone-500">
        Weighed by Nemotron Ultra from {j.key_findings.length} findings, {report.claims.length} claim checks and {report.signals.length} hard signals.
      </p>
    </div>
  );
}
