import type { Metadata } from "next";
import Link from "next/link";
import { ChallengeRules } from "@/components/marketing/ChallengeRules";
import { FinalCta } from "@/components/marketing/FinalCta";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { PageHero } from "@/components/marketing/PageHero";
import { RoutingSection } from "@/components/marketing/RoutingSection";
import { Accent } from "@/components/marketing/Section";
import { buttonClasses } from "@/lib/buttons";

export const metadata: Metadata = {
  title: "How it works · ProofBeforePay",
  description: "Five steps, three NVIDIA Nemotron models on Nebius Token Factory, rounds of registry, customs, map and web lookups, and a verdict that has to survive a second opinion.",
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title={
          <>
            An investigation that <Accent>follows</Accent> its own findings.
          </>
        }
        lede="Lookups bring in the registries, customs logs, map and the web. Code decides whether the sources agree with the supplier. Every inconsistency opens a follow-up on another source, and a second model tries to prove the verdict wrong."
      >
        <Link href="/#try" className={buttonClasses("primary", "h-12 px-6")}>
          Check a supplier
        </Link>
        <Link href="/about" className={buttonClasses("secondary", "h-12 px-6")}>
          Who it&apos;s for
        </Link>
      </PageHero>
      <HowItWorks />
      <RoutingSection />
      <ChallengeRules />
      <FinalCta />
    </>
  );
}
