"use client";

import { ArrowRight, MailCheck, Play, Receipt, Route, Search, ShieldAlert, Swords } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CopyButton, TIER_STYLE } from "@/components/ui";
import { Tilt } from "@/components/motion/interactive";
import { Reveal } from "@/components/motion/reveal";
import { cx } from "@/lib/cx";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Accent, SectionHeading } from "@/components/marketing/Section";

function Tile({ className, icon, title, body, children }: { className?: string; icon: ReactNode; title: string; body: string; children: ReactNode }) {
  return (
    <Tilt max={4} className={cx("spot panel group flex h-full flex-col overflow-hidden", className)}>
      <div className="relative flex-1 p-6">{children}</div>
      <div className="relative border-t border-white/[0.06] px-6 py-5">
        <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-bone-50">
          <span className="text-bone-400 transition-colors duration-500 group-hover:text-brand-300">{icon}</span>
          {title}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-bone-400">{body}</p>
      </div>
    </Tilt>
  );
}

function DecisionMock() {
  const ring = useRef<SVGCircleElement>(null);
  const r = 46;
  const c = 2 * Math.PI * r;
  useEffect(() => {
    const el = ring.current;
    if (!el || prefersReducedMotion()) return;
    const tween = gsap.fromTo(
      el,
      { strokeDashoffset: c },
      { strokeDashoffset: c * 0.06, duration: 2, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [c]);
  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="font-mono text-[10.5px] tracking-[0.16em] text-bone-500 uppercase">Is it safe to pay the deposit?</p>
          <p className="mt-3 flex items-center gap-3 text-[clamp(3rem,6vw,4.75rem)] leading-none font-semibold tracking-[-0.055em] text-stop-300">
            <ShieldAlert className="size-10 shrink-0" aria-hidden />
            Stop.
          </p>
        </div>
        <div className="relative size-28 shrink-0">
          <svg viewBox="0 0 110 110" className="size-full -rotate-90" aria-hidden>
            <circle cx="55" cy="55" r={r} fill="none" stroke="rgb(246 243 236 / 0.07)" strokeWidth="6" />
            <circle ref={ring} cx="55" cy="55" r={r} fill="none" stroke="#ff6f5e" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.06} />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-2xl font-semibold tracking-[-0.04em] text-bone-50">94</span>
        </div>
      </div>
      <p className="max-w-lg text-lg leading-snug font-medium text-balance text-bone-100">
        The licence belongs to a different company, the factory photos are someone else&apos;s, and the deposit would go to a personal account.
      </p>
      <div className="grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-5">
        {[
          ["Red flags", "6", "text-stop-300"],
          ["Claims verified", "0/6", "text-bone-50"],
          ["Lookups run", "12", "text-bone-50"],
        ].map(([k, v, tone]) => (
          <div key={k}>
            <p className="text-[11px] text-bone-500">{k}</p>
            <p className={cx("text-xl font-semibold", tone)}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const REPLY = "Hi, before I pay a deposit, could you send a copy of your business licence, a bank letter showing the account is in your company's name, and join a live video call from the factory floor? I'm also happy to arrange a third-party inspection.";

function ReplyMock() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-bone-500">
          Subject: <span className="text-bone-200">Verification before the deposit</span>
        </p>
        <CopyButton text={REPLY} label="Copy" />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-bone-300">{REPLY}</p>
    </div>
  );
}

const TRAIL_TONE = { r: "#ff6f5e", g: "#9bd424", n: "#c9c1b1" } as const;
const TRAIL_NODES = [
  { id: "s1", x: 4, y: 18, w: 104, tag: "S3", text: "opencorporates", tone: "n" },
  { id: "s2", x: 4, y: 74, w: 104, tag: "S7", text: "importyeti", tone: "n" },
  { id: "s3", x: 4, y: 130, w: 104, tag: "S9", text: "hengli-garments", tone: "n" },
  { id: "c1", x: 144, y: 8, w: 128, tag: "C1", text: "Contradicted", tone: "r" },
  { id: "f1", x: 144, y: 60, w: 128, tag: "F2", text: "Customs: exporter", tone: "r" },
  { id: "f2", x: 144, y: 112, w: 128, tag: "F5", text: "Photo reused", tone: "r" },
  { id: "k1", x: 302, y: 34, w: 124, tag: "K1", text: "Licence not theirs", tone: "r" },
  { id: "k2", x: 302, y: 98, w: 124, tag: "K2", text: "Photo not theirs", tone: "r" },
  { id: "v", x: 452, y: 58, w: 64, tag: "", text: "Stop.", tone: "r" },
] as const;
const TRAIL_EDGES: [string, string, boolean][] = [
  ["s1", "c1", true], ["c1", "k1", true], ["f2", "k1", true], ["k1", "v", true],
  ["s2", "f1", false], ["f1", "k2", false], ["s3", "f2", false], ["k2", "v", false],
];

/** A miniature Proof Trail: one source's path to the verdict lights up on hover. */
function TrailMock() {
  const at = Object.fromEntries(TRAIL_NODES.map((n) => [n.id, n]));
  return (
    <svg viewBox="0 0 520 160" className="h-full w-full" role="img" aria-label="A source linked through a claim and a finding to a Stop verdict">
      {TRAIL_EDGES.map(([from, to, lit]) => {
        const a = at[from]!;
        const b = at[to]!;
        const [x1, y1, x2, y2] = [a.x + a.w, a.y + 13, b.x, b.y + 13];
        const d = `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`;
        return (
          <g key={`${from}-${to}`}>
            <path d={d} fill="none" stroke={lit ? TRAIL_TONE.r : "rgb(246 243 236 / 0.12)"} strokeWidth={1.2} className={lit ? "opacity-40 transition-opacity duration-500 group-hover:opacity-100" : ""} />
            {lit && <path d={d} fill="none" stroke={TRAIL_TONE.r} strokeWidth={2} strokeLinecap="round" className="trail-flow opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
          </g>
        );
      })}
      {TRAIL_NODES.map((n) => {
        const color = TRAIL_TONE[n.tone];
        return (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={n.w} height={26} rx={7} fill={n.tone === "n" ? "rgb(246 243 236 / 0.03)" : `${color}14`} stroke={n.tone === "n" ? "rgb(246 243 236 / 0.12)" : `${color}55`} />
            {n.tag ? (
              <>
                <text x={n.x + 8} y={n.y + 17} className="fill-bone-500 font-mono text-[9px]">{n.tag}</text>
                <text x={n.x + 30} y={n.y + 17} className="fill-bone-200 text-[10.5px]">{n.text}</text>
              </>
            ) : (
              <text x={n.x + 10} y={n.y + 18} fill={color} className="text-[14px] font-semibold">{n.text}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A miniature challenge: a second model tries to prove the verdict wrong. */
function ChallengeMock() {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] tracking-[0.12em] text-bone-500 uppercase">Trying to prove “Stop” wrong</p>
      {["Brightstar Hengli group company", "Brightstar Textile reviews"].map((q, i) => (
        <p
          key={q}
          className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[12px] text-bone-300 transition-transform duration-700 ease-out-expo group-hover:translate-x-1"
          style={{ transitionDelay: `${i * 80}ms` }}
        >
          <Search className="size-3 shrink-0 text-sand-300" aria-hidden />
          <span className="truncate">{q}</span>
        </p>
      ))}
      <p className="flex items-center gap-1.5 pt-1 text-[11.5px] text-bone-400">
        <span className="truncate">If Hengli confirms it as an agent</span>
        <ArrowRight className="size-3 shrink-0" aria-hidden />
        <span className="shrink-0 text-caution-300">Verify first</span>
      </p>
    </div>
  );
}

function ReceiptMock() {
  const split = [
    { tier: "nano" as const, share: 0.38, calls: "9 calls" },
    { tier: "super" as const, share: 0.17, calls: "2 calls" },
    { tier: "ultra" as const, share: 0.45, calls: "1 call" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {split.map((s) => (
          <span key={s.tier} className={cx("h-full rounded-full", TIER_STYLE[s.tier].bar)} style={{ flexGrow: s.share, flexBasis: 0 }} />
        ))}
      </div>
      <ul className="space-y-2">
        {split.map((s) => (
          <li key={s.tier} className="flex items-center justify-between font-mono text-[11px]">
            <span className={cx("flex items-center gap-2", TIER_STYLE[s.tier].text)}>
              <span className={cx("size-1.5 rounded-full", TIER_STYLE[s.tier].dot)} />
              {TIER_STYLE[s.tier].label}
            </span>
            <span className="text-bone-500">{s.calls}</span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[11px] text-bone-500">
        actual cost <span className="text-bone-200">vs</span> <span className="line-through">all-Ultra</span>
      </p>
    </div>
  );
}

function ReplayMock() {
  const [t, setT] = useState(0.35);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const state = { v: 0 };
    const tween = gsap.to(state, { v: 1, duration: 6, ease: "none", repeat: -1, onUpdate: () => setT(state.v) });
    return () => {
      tween.kill();
    };
  }, []);
  const steps = ["Read", "Follow", "Judge", "Argue", "Brief"];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-brand-500 text-ink-950 shadow-[0_0_24px_rgba(118,185,0,0.5)]">
          <Play className="size-4 translate-x-px fill-current" aria-hidden />
        </span>
        <div className="flex-1">
          <div className="relative h-1.5 rounded-full bg-white/[0.07]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand-400" style={{ width: `${t * 100}%` }} />
            <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone-50" style={{ left: `${t * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="flex justify-between font-mono text-[10px] text-bone-500">
        {steps.map((s, i) => (
          <span key={s} className={cx("transition-colors", t * steps.length > i && "text-brand-300")}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Outcomes() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="05"
          label="What you get back"
          title={
            <>
              A decision you can <Accent>act</Accent> on, and the receipts.
            </>
          }
          lede="Not a score with no explanation. You get a clear call, what not to do yet, a reply you can send, every piece of evidence behind it, and the strongest case against it."
        />

        <Reveal as="div" selector="[data-tile]" stagger={0.09} className="mt-16 grid gap-4 lg:grid-cols-6 lg:grid-rows-[auto_auto]">
          <div data-tile className="lg:col-span-3 lg:row-span-2">
            <Tile icon={<ShieldAlert className="size-4" />} title="One clear decision" body="Proceed, verify first, or stop, with a confidence score and the main reason in one sentence.">
              <DecisionMock />
            </Tile>
          </div>
          <div data-tile className="lg:col-span-3">
            <Tile icon={<MailCheck className="size-4" />} title="A message that makes them prove it" body="Polite and non-accusatory. It asks the supplier for a licence copy, a bank letter and a live video, and shares nothing about you.">
              <ReplyMock />
            </Tile>
          </div>
          <div data-tile className="lg:col-span-3">
            <Tile icon={<Route className="size-4" />} title="The Proof Trail" body="Click any source, claim or finding and the whole path from the evidence to the verdict lights up. The chain of evidence shows which lookup opened which.">
              <TrailMock />
            </Tile>
          </div>
          <div data-tile className="lg:col-span-2">
            <Tile icon={<Receipt className="size-4" />} title="Receipts for every token" body="Which model did what, and what it cost compared with Ultra alone.">
              <ReceiptMock />
            </Tile>
          </div>
          <div data-tile className="lg:col-span-2">
            <Tile icon={<Play className="size-4" />} title="Replay the whole run" body="Watch any investigation again, step by step, from a shareable link.">
              <ReplayMock />
            </Tile>
          </div>
          <div data-tile className="lg:col-span-2">
            <Tile icon={<Swords className="size-4" />} title="Argued with, every time" body="A second model searches for evidence against the verdict and tells you what would change it.">
              <ChallengeMock />
            </Tile>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
