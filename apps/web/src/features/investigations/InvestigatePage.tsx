"use client";

import { Lightbulb } from "lucide-react";
import { motion } from "motion/react";
import { STAGE_ICONS } from "@/components/investigation/AgentPipeline";
import { OfferForm } from "@/components/investigation/OfferForm";
import { Card, CardHeader, TierBadge } from "@/components/ui";
import { PageHeader } from "@/components/ui/page";
import { useHealth } from "@/hooks/useBackend";
import { STAGES } from "@/lib/stages";

const TIPS = [
  "Paste the whole invoice or chat: company name, address, licence and certificate numbers, bank details and payment terms.",
  "Add the supplier's email or website if you have it. Its domain age tells us a lot. A factory photo link lets us trace the photo.",
  "Leave out your own passwords and bank details. They're never needed.",
];

export function InvestigatePage() {
  const health = useHealth();
  const live = health === undefined ? null : Boolean(health?.live);

  return (
    <div>
      <PageHeader eyebrow="New check" title="What did the supplier send you?">
        Paste it below. The agent checks the company, its registration, customs records, certificates, address and photos, follows every
        inconsistency, and tells you whether it&apos;s safe to pay the deposit. It stays in your history.
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
          <OfferForm live={live} />
        </motion.div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="What happens next" subtitle="You'll watch each step live" />
            <ol className="relative space-y-1 p-5">
              <span className="absolute top-8 bottom-8 left-[37px] w-px bg-gradient-to-b from-brand-500/50 via-white/[0.08] to-transparent" aria-hidden />
              {STAGES.map((stage, i) => {
                const Icon = STAGE_ICONS[stage.key];
                return (
                  <motion.li
                    key={stage.key}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="relative flex items-start gap-3 rounded-xl p-2"
                  >
                    <span className="relative grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.09] bg-ink-900 text-bone-300">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-bone-50">
                        {stage.title}
                        {stage.tier && <TierBadge tier={stage.tier} prefix="" className="text-[10px]" />}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10.5px] text-bone-500">{stage.engine}</span>
                    </span>
                  </motion.li>
                );
              })}
            </ol>
          </Card>
          <Card>
            <CardHeader icon={<Lightbulb className="size-4" />} title="For the best result" />
            <ul className="space-y-3 p-5">
              {TIPS.map((tip) => (
                <li key={tip} className="flex gap-2.5 text-sm leading-relaxed text-bone-300">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-brand-400" aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
