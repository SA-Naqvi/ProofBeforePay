import type { StageKey, TierName } from "@/types";

export interface StageMeta {
  key: StageKey;
  title: string;
  engine: string;
  detail: string;
  /** The Nemotron tier doing the model work in this step, if any. */
  tier?: TierName;
}

export const STAGES: StageMeta[] = [
  {
    key: "intake",
    title: "Read the paperwork",
    engine: "Nano + rules",
    tier: "nano",
    detail: "Pulls out who the supplier says it is: name, address, registration number, certificates, photos and who gets paid. Rules in code flag risky payment terms. Each statement becomes a claim to check.",
  },
  {
    key: "investigate",
    title: "Follow the evidence",
    engine: "Registries · customs · maps · Tavily",
    tier: "nano",
    detail: "Runs lookups in rounds: company registries, customs and trade logs, certificate directories, the map, reverse-image search. When two sources disagree, code opens a follow-up on a third, until the chain of evidence is complete.",
  },
  {
    key: "judge",
    title: "Weigh the evidence",
    engine: "Nemotron Ultra",
    tier: "ultra",
    detail: "One long reasoning pass over every finding, claim and lookup, ending in a decision with citations back to the chain of evidence.",
  },
  {
    key: "challenge",
    title: "Argue against it",
    engine: "Super + Tavily",
    tier: "super",
    detail: "A second model runs its own searches to prove the verdict wrong, then lists exactly what evidence would change it. Code decides what a disagreement changes.",
  },
  {
    key: "brief",
    title: "Write the brief",
    engine: "Nemotron Nano",
    tier: "nano",
    detail: "A plain-language summary and a polite message that asks the supplier to prove who they are before any deposit.",
  },
];
