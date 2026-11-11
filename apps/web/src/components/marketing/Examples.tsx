"use client";

import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { DECISION_STYLE, DecisionBadge, Skeleton } from "@/components/ui";
import { Tilt } from "@/components/motion/interactive";
import { Reveal } from "@/components/motion/reveal";
import { dateTime } from "@/lib/formatters";
import { ScrollTrigger } from "@/lib/gsap";
import { useExamples } from "@/hooks/useBackend";
import { SectionHeading } from "@/components/marketing/Section";

export function Examples() {
  const examples = useExamples();

  useEffect(() => {
    if (examples) ScrollTrigger.refresh();
  }, [examples]);

  if (examples && examples.length === 0) return null;

  return (
    <section id="examples" className="relative scroll-mt-20 py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="07"
          label="Recorded investigations"
          title="Watch it work on real suppliers."
          lede="Each of these was a full live run. Open the report, or replay it to watch the agents go step by step."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {examples === null
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-[20px]" />)
            : examples.map((ex, i) => {
                const style = ex.decision ? DECISION_STYLE[ex.decision] : null;
                return (
                  <Reveal key={ex.id} delay={i * 0.08}>
                    <Tilt max={6} className="spot panel group relative flex h-full flex-col overflow-hidden p-6">
                      {style && (
                        <span
                          className="pointer-events-none absolute inset-x-0 top-0 h-px"
                          style={{ background: `linear-gradient(90deg, transparent, ${style.hex}, transparent)` }}
                          aria-hidden
                        />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        {ex.decision && <DecisionBadge decision={ex.decision} />}
                        <span className="font-mono text-[10.5px] text-bone-600">{dateTime(ex.created_at)}</span>
                      </div>
                      <p className="mt-5 text-sm font-medium text-bone-500">
                        {[ex.role, ex.company].filter(Boolean).join(" · ") || ex.input?.channel || "Supplier"}
                      </p>
                      <p className="mt-1.5 line-clamp-3 text-[17px] leading-snug font-medium tracking-[-0.01em] text-bone-50">{ex.headline}</p>
                      <div className="mt-auto flex items-center gap-2 pt-6">
                        <Link
                          href={`/investigations?id=${encodeURIComponent(ex.id)}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-medium text-bone-100 ring-1 ring-white/[0.08] transition ring-inset hover:bg-white/[0.09]"
                        >
                          Read report
                          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                        <Link
                          href={`/investigations?id=${encodeURIComponent(ex.id)}&replay=1`}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-brand-300 transition hover:bg-brand-500/10"
                        >
                          <Play className="size-3.5 fill-current" aria-hidden />
                          Replay
                        </Link>
                      </div>
                    </Tilt>
                  </Reveal>
                );
              })}
        </div>
      </div>
    </section>
  );
}
