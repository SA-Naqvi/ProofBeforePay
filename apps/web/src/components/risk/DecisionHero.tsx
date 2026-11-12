"use client";

import { ShieldOff, Swords } from "lucide-react";
import { useRef } from "react";
import { Ticker } from "@/components/motion/interactive";
import { duration } from "@/lib/formatters";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import { scrollToTarget } from "@/lib/scroll";
import type { Report } from "@/types";
import { cx, DECISION_STYLE, RefText, SectionLabel } from "@/components/ui";

function ConfidenceRing({ value, color }: { value: number; color: string }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(29 74 122 / 0.07)" strokeWidth="6" />
        <circle
          data-ring
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          style={{ filter: `drop-shadow(0 0 8px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-4xl font-semibold tracking-[-0.04em] text-bone-50">
            <Ticker value={value} duration={1.6} />
          </p>
          <p className="font-mono text-[10px] tracking-[0.16em] text-bone-500 uppercase">confidence</p>
        </div>
      </div>
    </div>
  );
}

export function DecisionHero({ report }: { report: Report }) {
  const root = useRef<HTMLDivElement>(null);
  const { judgement: j, brief, telemetry: t } = report;
  const style = DECISION_STYLE[j.decision];
  const Icon = style.icon;
  const count = (status: string) => report.claims.filter((c) => c.status === status).length;
  const red = report.signals.filter((s) => s.polarity === "red").length;
  const green = report.signals.filter((s) => s.polarity === "green").length;
  const stats = [
    { label: "Risk signals", value: String(red), tone: red ? "text-stop-300" : "text-bone-200" },
    { label: "Reassuring", value: String(green), tone: green ? "text-brand-300" : "text-bone-200" },
    { label: "Claims verified", value: `${count("verified")}/${report.claims.length}`, tone: "text-bone-50" },
    { label: "Contradicted", value: String(count("contradicted")), tone: count("contradicted") ? "text-stop-300" : "text-bone-200" },
    { label: "Sources read", value: String(report.sources.length), tone: "text-bone-50" },
    { label: "Took", value: duration(t.duration_s * 1000), tone: "text-bone-50" },
  ];

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const circumference = 2 * Math.PI * 52;
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          // fromTo with explicit end values, so a re-run can never record a half-faded state as the target.
          .fromTo("[data-dh-label]", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.8 })
          .fromTo(
            "[data-dh-word]",
            { autoAlpha: 0, scale: 1.25, filter: "blur(18px)" },
            { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: 1.1, clearProps: "filter" },
            0.1,
          )
          .fromTo("[data-dh-icon]", { autoAlpha: 0, rotate: -40, scale: 0.4 }, { autoAlpha: 1, rotate: 0, scale: 1, duration: 1, ease: "back.out(2)" }, 0.3)
          .fromTo("[data-dh-copy]", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08 }, 0.4)
          .fromTo("[data-ring]", { strokeDashoffset: circumference }, { strokeDashoffset: circumference * (1 - j.confidence / 100), duration: 1.8 }, 0.3)
          .fromTo("[data-dh-stat]", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.05 }, 0.55);
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className={cx("relative overflow-hidden rounded-[28px] border bg-ink-900", style.border)}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(900px circle at 0% 0%, ${style.glow}, transparent 55%)` }}
        aria-hidden
      />
      <div className="bg-grid mask-radial pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div data-dh-label>
            <SectionLabel>Should you take the next step?</SectionLabel>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <span data-dh-icon className={cx("grid size-14 shrink-0 place-items-center rounded-2xl border bg-black/20", style.border, style.text)}>
              <Icon className="size-7" aria-hidden />
            </span>
            <h1 data-dh-word className={cx("text-[clamp(3rem,8vw,5.5rem)] leading-[0.9] font-semibold tracking-[-0.05em]", style.text)}>
              {style.word}
            </h1>
          </div>
          <p data-dh-copy className="mt-6 max-w-2xl text-xl leading-snug font-medium tracking-[-0.01em] text-balance text-bone-50">
            {j.headline}
          </p>
          <p data-dh-copy className="mt-3 max-w-2xl leading-relaxed text-bone-400">
            {brief.tldr}
          </p>
          {j.guardrail && (
            <p
              data-dh-copy
              className="mt-5 inline-flex items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-bone-400 ring-1 ring-white/[0.06] ring-inset"
            >
              <ShieldOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold text-bone-200">Safety guardrail applied.</span> <RefText text={j.guardrail} />
              </span>
            </p>
          )}
          {report.challenge && (
            <button
              type="button"
              data-dh-copy
              onClick={() => scrollToTarget("#challenge")}
              className="mt-3 flex max-w-2xl items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-left text-xs text-bone-400 ring-1 ring-white/[0.06] transition-colors ring-inset hover:bg-white/[0.07] hover:text-bone-300"
            >
              <Swords className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold text-bone-200">Challenged by a second model. </span>
                {report.challenge.effect ??
                  "Nemotron Super searched for evidence against this verdict and found nothing strong enough to change it."}
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
          <ConfidenceRing value={j.confidence} color={style.hex} />
          <dl className="grid flex-1 grid-cols-3 gap-x-6 gap-y-4 lg:grid-cols-2">
            {stats.map((s) => (
              <div key={s.label} data-dh-stat>
                <dt className="text-[11px] text-bone-500">{s.label}</dt>
                <dd className={cx("text-xl font-semibold tracking-[-0.02em]", s.tone)}>{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
