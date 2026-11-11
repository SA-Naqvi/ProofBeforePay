"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { TIER_STYLE } from "@/components/ui";
import { Tilt } from "@/components/motion/interactive";
import { Reveal } from "@/components/motion/reveal";
import { cx } from "@/lib/cx";
import { shortModel } from "@/lib/formatters";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { DEFAULT_TIERS } from "@/lib/site";
import type { TierName } from "@/types";
import { useHealth } from "@/hooks/useBackend";
import { Accent, SectionHeading } from "@/components/marketing/Section";

const TASKS = [
  { id: "intake", label: "Read the paperwork", to: "nano" },
  { id: "c1", label: "Read registry page L1", to: "nano" },
  { id: "c2", label: "Read customs page L2", to: "nano" },
  { id: "c3", label: "Read certificate page L4", to: "nano" },
  { id: "judge", label: "Weigh the evidence", to: "ultra" },
  { id: "brief", label: "Write the brief", to: "nano" },
] as const;

const MODELS: { tier: TierName; job: string }[] = [
  { tier: "nano", job: "Fast, frequent calls" },
  { tier: "super", job: "Second opinions" },
  { tier: "ultra", job: "The final call" },
];

/** "nemotron-3-super-120b-a12b" -> "120B · 12B active", read from whichever model the server resolved. */
function sizeOf(model: string | undefined): string | null {
  const match = model?.match(/(\d+)b-a(\d+)b/i);
  return match ? `${match[1]}B · ${match[2]}B active` : null;
}

type Beam = { from: string; to: string; tone: string; delay: number; dashed?: boolean };

const BEAMS: Beam[] = [
  ...TASKS.map((t, i) => ({ from: t.id, to: t.to, tone: TIER_STYLE[t.to].hex, delay: i * 0.35 })),
  { from: "nano", to: "super", tone: TIER_STYLE.super.hex, delay: 0.9, dashed: true },
  { from: "super", to: "ultra", tone: TIER_STYLE.super.hex, delay: 1.6 },
  { from: "nano", to: "ultra", tone: TIER_STYLE.nano.hex, delay: 1.2 },
  { from: "ultra", to: "decision", tone: TIER_STYLE.ultra.hex, delay: 2.2 },
];

/** SVG beams between measured nodes, each with a light pulse travelling along it (Magic UI "animated beam" style). */
function Beams({ container, nodes }: { container: RefObject<HTMLDivElement | null>; nodes: RefObject<Record<string, HTMLElement | null>> }) {
  const [paths, setPaths] = useState<{ d: string; beam: Beam }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const measure = () => {
      const box = host.getBoundingClientRect();
      const anchor = (id: string, side: "left" | "right") => {
        const el = nodes.current?.[id];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: (side === "left" ? r.left : r.right) - box.left, y: r.top + r.height / 2 - box.top };
      };
      const next = BEAMS.flatMap((beam) => {
        const vertical = ["nano", "super", "ultra"].includes(beam.from) && ["super", "ultra"].includes(beam.to);
        if (vertical) {
          // Model to model: run down the right-hand side of the model column.
          const a = anchor(beam.from, "right");
          const b = anchor(beam.to, "right");
          if (!a || !b) return [];
          const bulge = beam.from === "nano" && beam.to === "ultra" ? 46 : 26;
          return [{ d: `M ${a.x} ${a.y} C ${a.x + bulge} ${a.y}, ${b.x + bulge} ${b.y}, ${b.x} ${b.y}`, beam }];
        }
        const a = anchor(beam.from, "right");
        const b = anchor(beam.to, "left");
        if (!a || !b) return [];
        const mid = (a.x + b.x) / 2;
        return [{ d: `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`, beam }];
      });
      setSize({ w: box.width, h: box.height });
      setPaths(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => observer.disconnect();
  }, [container, nodes]);

  useEffect(() => {
    const el = svg.current;
    if (!el || prefersReducedMotion()) return;
    const pulses = Array.from(el.querySelectorAll<SVGPathElement>("[data-pulse]"));
    const tweens = pulses.map((path) => {
      const length = path.getTotalLength();
      const dash = Math.max(28, length * 0.22);
      path.style.strokeDasharray = `${dash} ${length + dash}`;
      return gsap.fromTo(
        path,
        { strokeDashoffset: dash },
        { strokeDashoffset: -length, duration: 2.4, ease: "power1.inOut", repeat: -1, repeatDelay: 1.4, delay: Number(path.dataset.delay ?? 0) },
      );
    });
    return () => tweens.forEach((t) => t.kill());
  }, [paths]);

  return (
    <svg ref={svg} className="pointer-events-none absolute inset-0 overflow-visible" width={size.w} height={size.h} aria-hidden>
      <defs>
        <filter id="beam-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {paths.map(({ d, beam }) => (
        <g key={`${beam.from}-${beam.to}`}>
          <path d={d} fill="none" stroke="rgb(246 243 236 / 0.09)" strokeWidth="1.5" strokeDasharray={beam.dashed ? "4 5" : undefined} />
          <path
            data-pulse
            data-delay={beam.delay}
            d={d}
            fill="none"
            stroke={beam.tone}
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#beam-glow)"
            style={{ strokeDasharray: "0 99999" }}
          />
        </g>
      ))}
    </svg>
  );
}

function RoutingDiagram({ models }: { models: Partial<Record<TierName, string>> }) {
  const container = useRef<HTMLDivElement>(null);
  const nodes = useRef<Record<string, HTMLElement | null>>({});
  const bind = (id: string) => (el: HTMLElement | null) => {
    nodes.current[id] = el;
  };

  return (
    <div ref={container} className="panel relative grid grid-cols-[1fr_1.05fr_0.8fr] items-center gap-x-8 gap-y-0 p-5 sm:gap-x-16 sm:p-8">
      <Beams container={container} nodes={nodes} />
      <ul className="relative space-y-2.5">
        {TASKS.map((t) => (
          <li
            key={t.id}
            ref={bind(t.id)}
            className="rounded-xl border border-white/[0.07] bg-ink-850 px-3 py-2 text-[12px] text-bone-200 sm:text-[13px]"
          >
            {t.label}
          </li>
        ))}
      </ul>
      <ul className="relative space-y-6">
        {MODELS.map((m) => {
          const s = TIER_STYLE[m.tier];
          return (
            <li key={m.tier} ref={bind(m.tier)} className={cx("rounded-2xl border bg-ink-850 px-3 py-3 sm:px-4", m.tier === "ultra" ? "border-brand-500/40 shadow-[0_0_30px_-8px_rgba(118,185,0,0.45)]" : "border-white/[0.09]")}>
              <p className="flex items-center gap-2">
                <span className={cx("size-2 rounded-full", s.dot)} />
                <span className={cx("text-sm font-semibold", s.text)}>{s.label}</span>
              </p>
              {sizeOf(models[m.tier]) && <p className="mt-0.5 hidden font-mono text-[10.5px] text-bone-500 sm:block">{sizeOf(models[m.tier])}</p>}
              <p className="mt-1 text-[11.5px] text-bone-400">{m.job}</p>
            </li>
          );
        })}
      </ul>
      <div ref={bind("decision")} className="relative rounded-2xl border border-stop-500/30 bg-stop-500/[0.06] px-3 py-4 text-center sm:px-4">
        <p className="font-mono text-[10px] tracking-[0.16em] text-bone-500 uppercase">Decision</p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-stop-300">Stop.</p>
        <p className="mt-1 font-mono text-[10.5px] text-bone-500">with citations</p>
      </div>
    </div>
  );
}

export function RoutingSection() {
  const health = useHealth();
  const tiers = health?.tiers?.length ? health.tiers : DEFAULT_TIERS;
  const ordered = (["nano", "super", "ultra"] as const).map((name) => tiers.find((t) => t.name === name)).filter(Boolean);

  return (
    <section id="routing" className="relative scroll-mt-20 py-28 sm:py-36">
      <div className="pointer-events-none absolute right-0 bottom-0 size-[40rem] rounded-full bg-brand-500/[0.05] blur-[150px]" aria-hidden />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="04"
          label="Model routing"
          title={
            <>
              Small models do the legwork. <Accent>Ultra</Accent> makes the call.
            </>
          }
          lede="Nano takes the quick, frequent jobs: reading the pages each lookup returns. When a finding is left open, Super proposes extra lookups. Ultra reads everything once and decides. Every call is metered, so each report shows its real cost next to what the same tokens would have cost on Ultra alone."
        />

        <Reveal className="mt-16" y={50}>
          <RoutingDiagram models={Object.fromEntries(tiers.map((t) => [t.name, t.model]))} />
        </Reveal>

        <Reveal as="ul" selector="li" className="mt-6 grid gap-4 md:grid-cols-3" stagger={0.1}>
          {ordered.map((tier) =>
            tier ? (
              <li key={tier.name}>
                <Tilt className="spot panel h-full p-6" max={6}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className={cx("size-2 rounded-full", TIER_STYLE[tier.name].dot)} />
                      <span className={cx("font-semibold", TIER_STYLE[tier.name].text)}>Nemotron {TIER_STYLE[tier.name].label}</span>
                    </span>
                    <span className="font-mono text-[10.5px] text-bone-600">per 1M tokens</span>
                  </div>
                  <p className="mt-5 text-4xl font-semibold tracking-[-0.045em] text-bone-50">
                    ${tier.input_price.toFixed(2)}
                    <span className="text-lg text-bone-500"> in</span>
                    <span className="mx-2 text-bone-700">/</span>${tier.output_price.toFixed(2)}
                    <span className="text-lg text-bone-500"> out</span>
                  </p>
                  <p className="mt-4 truncate font-mono text-[11px] text-bone-500" title={tier.model}>
                    {shortModel(tier.model)}
                  </p>
                </Tilt>
              </li>
            ) : null,
          )}
        </Reveal>
      </div>
    </section>
  );
}
