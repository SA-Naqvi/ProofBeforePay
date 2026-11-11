"use client";

import { Globe, MessageSquareText, ScanSearch, Scale } from "lucide-react";
import { OfferForm } from "@/components/investigation/OfferForm";
import { Reveal } from "@/components/motion/reveal";
import { cx } from "@/lib/cx";
import { useHealth } from "@/hooks/useBackend";
import { Accent, SectionHeading } from "@/components/marketing/Section";

const STEPS = [
  { icon: MessageSquareText, text: "Paste the invoice or listing, or fill in what you know: company, licence, address, certificate" },
  { icon: Globe, text: "Lookups run on registries, customs logs, certificate directories, the map and the web" },
  { icon: ScanSearch, text: "Every inconsistency opens a follow-up on another source, until the chain is complete" },
  { icon: Scale, text: "You get a decision, the chain of evidence, and a message that makes the supplier prove itself" },
];

export function TrySection() {
  const health = useHealth();
  const live = health === undefined ? null : Boolean(health?.live);
  const status =
    health === undefined
      ? { dot: "bg-bone-500", text: "Checking the server…" }
      : health?.live
        ? { dot: "bg-brand-400", text: `Live checks on · ${health.limits.per_ip_per_hour} per hour on this demo` }
        : { dot: "bg-caution-400", text: "Live checks paused · recorded runs below" };

  return (
    <section id="try" className="relative scroll-mt-20 py-28 sm:py-36">
      <div className="mx-auto grid max-w-7xl items-start gap-14 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <SectionHeading
            index="01"
            label="Try it"
            title={
              <>
                Paste what the supplier <Accent>sent</Accent> you.
              </>
            }
            lede="A proforma invoice, a quotation, an Alibaba or IndiaMART listing, a WhatsApp chat, or just the company name and registration number. If a supplier wants a deposit, check it here first."
          />
          <Reveal as="ol" selector="li" className="mt-10 space-y-4" stagger={0.07}>
            {STEPS.map(({ icon: Icon, text }, i) => (
              <li key={text} className="flex items-start gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-bone-300">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="pt-1.5 text-[15px] text-bone-300">
                  <span className="mr-2 font-mono text-[11px] text-bone-600">0{i + 1}</span>
                  {text}
                </span>
              </li>
            ))}
          </Reveal>
        </div>

        <Reveal y={50}>
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-bone-500 uppercase">
              <span className={cx("size-1.5 rounded-full", status.dot)} />
              {status.text}
            </span>
          </div>
          <div className="beam rounded-[27px]">
            <OfferForm live={live} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
