"use client";

import { ArrowUpRight, BriefcaseBusiness, Cpu, Database, GraduationCap, Mail, Palette, Search, Server, Zap } from "lucide-react";
import { GithubMark } from "@/components/layout/Logo";
import { Ticker, Tilt } from "@/components/motion/interactive";
import { Reveal, TextScrub } from "@/components/motion/reveal";
import { REPO_URL } from "@/lib/site";
import { Accent, SectionHeading } from "./Section";

export function AboutStory() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <TextScrub
          className="text-[clamp(1.6rem,3.4vw,2.7rem)] leading-[1.18] font-semibold tracking-[-0.035em]"
          text="The registration number belongs to another company. The ISO certificate is held by someone else. The factory photo is on a rival's website. *The evidence is out there.* But each fact only leads to the next when you carry it from one source to another, and the supplier wants a *30% deposit this week.* So we built an agent that follows the trail, and shows every step."
        />
      </div>
    </section>
  );
}

const NUMBERS = [
  { value: 7, format: (n: number) => String(Math.round(n)), label: "kinds of lookup: registries, customs, certificates, domains, maps, photos and the web" },
  { value: 5, format: (n: number) => String(Math.round(n)), label: "steps in every check, the middle one a loop that follows its own findings" },
  { value: 3, format: (n: number) => String(Math.round(n)), label: "NVIDIA Nemotron models, each given the work that fits its size" },
  { value: 4, format: (n: number) => String(Math.round(n)), label: "rounds of follow-up at most, so every check ends and its cost is bounded" },
  { value: 2, format: (n: number) => String(Math.round(n)), label: "models that have to agree before the answer is a Proceed" },
];

export function AboutNumbers() {
  return (
    <section className="relative border-y border-white/[0.06] bg-ink-900/40 py-20">
      <Reveal as="div" selector="[data-num]" stagger={0.08} className="mx-auto grid max-w-7xl gap-10 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-5">
        {NUMBERS.map((n) => (
          <div key={n.label} data-num>
            <p className="text-[clamp(2.4rem,4vw,3.4rem)] leading-none font-semibold tracking-[-0.05em] text-bone-50 tabular-nums">
              <Ticker value={n.value} format={n.format} />
            </p>
            <p className="mt-3 text-sm leading-relaxed text-bone-400">
              {n.label}
            </p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

const AUDIENCE = [
  { icon: BriefcaseBusiness, title: "Small importers", body: "Buying from Alibaba, IndiaMART or a regional directory, about to wire a 30% deposit to someone you've never met. Check before you pay." },
  { icon: Palette, title: "Brands and resellers", body: "Sourcing private-label products from a \"factory\" that may be a trading company in disguise. Find out who actually makes the goods." },
  { icon: GraduationCap, title: "First-time buyers", body: "The people targeted most, and the least likely to know what a real supplier file looks like. Every report explains its reasoning." },
];

export function AboutAudience() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="01"
          label="Who it's for"
          title={
            <>
              For anyone about to pay a supplier they <Accent>can&apos;t</Accent> verify.
            </>
          }
        />
        <Reveal as="div" selector="[data-aud]" stagger={0.1} className="mt-14 grid gap-4 md:grid-cols-3">
          {AUDIENCE.map(({ icon: Icon, title, body }) => (
            <div key={title} data-aud>
              <Tilt max={6} className="spot panel h-full p-7">
                <span className="grid size-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-brand-300">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.03em] text-bone-50">{title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-bone-400">{body}</p>
              </Tilt>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

const STACK = [
  { icon: Cpu, name: "NVIDIA Nemotron 3", role: "Nano reads and checks, Super re-checks and challenges, Ultra weighs everything once." },
  { icon: Zap, name: "Nebius Token Factory", role: "Runs all three Nemotron models behind one OpenAI-compatible API, metered per call." },
  { icon: Search, name: "Tavily", role: "Scoped search of registries, customs logs and certificate directories, and reading pages so we never open them ourselves." },
  { icon: Database, name: "Supabase", role: "Postgres for accounts, saved investigations, the evidence trail and the spending ledger." },
  { icon: Mail, name: "Resend", role: "Delivers the one-time codes that verify your email and reset your password." },
  { icon: Server, name: "Next.js and FastAPI", role: "One container: the site you're reading, and the API that runs the agents and streams them live." },
];

export function AboutStack() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          index="03"
          label="Under the hood"
          title={
            <>
              Built on tools that <Accent>show</Accent> their work too.
            </>
          }
          lede="Every model call is metered, every web call is counted, and every report shows both. Nothing here is a black box."
        />
        <Reveal as="div" selector="[data-stack]" stagger={0.07} className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map(({ icon: Icon, name, role }) => (
            <div key={name} data-stack className="group bg-ink-950 p-7 transition-colors duration-500 hover:bg-ink-900">
              <Icon className="size-5 text-bone-500 transition-all duration-500 group-hover:scale-110 group-hover:text-brand-300" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-bone-50">{name}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-bone-400">{role}</p>
            </div>
          ))}
        </Reveal>

        <Reveal y={20} className="mt-6">
          <div className="panel flex flex-col items-start justify-between gap-5 p-7 sm:flex-row sm:items-center">
            <div>
              <p className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Open source, MIT licensed</p>
              <p className="mt-1 text-[15px] text-bone-400">Built during the Nebius × NVIDIA Global AI Hackathon, October 2026. Read the code, run it yourself, or improve it.</p>
            </div>
            {REPO_URL && (
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-bone-50 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-300"
              >
                <GithubMark className="size-4" /> View on GitHub <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
