"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { gsap, MOTION_OK, SplitText, useGSAP } from "@/lib/gsap";
import { API_BASE } from "@/lib/api-client";
import { REPO_URL } from "@/lib/site";
import { LogoMark } from "@/components/layout/Logo";
import { MotionToggle } from "@/components/layout/MotionNotice";
import { SectionLink } from "@/components/layout/Nav";

const BUILT_WITH = [
  { label: "NVIDIA Nemotron", href: "https://www.nvidia.com/en-us/ai-data-science/foundation-models/nemotron/" },
  { label: "Nebius Token Factory", href: "https://nebius.com/token-factory" },
  { label: "Tavily", href: "https://tavily.com" },
];

export function Footer() {
  const root = useRef<HTMLElement>(null);
  const word = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const split = SplitText.create(word.current, { type: "chars", mask: "chars" });
        gsap.from(split.chars, {
          yPercent: 100,
          ease: "expo.out",
          stagger: 0.035,
          duration: 1.4,
          scrollTrigger: { trigger: word.current, start: "top 95%", once: true },
        });
        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <footer ref={root} className="relative overflow-hidden border-t border-white/[0.06] pt-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:grid-cols-3 sm:px-8 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="sm:col-span-3 lg:col-span-1">
          <div className="group flex items-center gap-2.5 text-bone-50">
            <LogoMark className="size-7 text-bone-300" />
            <span className="font-semibold tracking-tight">ProofBeforePay</span>
          </div>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-bone-500">
            ProofBeforePay points out risk signals using public evidence. It can't prove that a supplier is a fraud or that it is
            genuine, so always confirm with a live video call, a third-party inspection and a bank letter before you pay a deposit.
          </p>
        </div>
        <FooterColumn title="Product">
          <SectionLink hash="#try" className="hover:text-bone-50">
            Check a supplier
          </SectionLink>
          <Link href="/how-it-works" className="hover:text-bone-50">
            How it works
          </Link>
          <Link href="/dashboard" className="hover:text-bone-50">
            Dashboard
          </Link>
        </FooterColumn>
        <FooterColumn title="Company">
          <Link href="/about" className="hover:text-bone-50">
            About
          </Link>
          <Link href="/contact" className="hover:text-bone-50">
            Contact
          </Link>
          <Link href="/signup" className="hover:text-bone-50">
            Create an account
          </Link>
          <a href={`${API_BASE}/docs`} className="hover:text-bone-50">
            API reference
          </a>
        </FooterColumn>
        <FooterColumn title="Built with">
          {BUILT_WITH.map((item) => (
            <ExternalLink key={item.label} href={item.href} label={item.label} />
          ))}
          {REPO_URL && <ExternalLink href={REPO_URL} label="Source on GitHub" />}
        </FooterColumn>
      </div>

      <p
        ref={word}
        aria-hidden
        className="mt-20 -mb-[0.2em] text-center text-[clamp(3rem,12.6vw,13rem)] leading-none font-semibold tracking-[-0.065em] whitespace-nowrap text-bone-50/[0.13] select-none"
        style={{ maskImage: "linear-gradient(180deg, #000 25%, transparent 92%)", WebkitMaskImage: "linear-gradient(180deg, #000 25%, transparent 92%)" }}
      >
        ProofBeforePay
      </p>

      <div className="relative border-t border-white/[0.06] bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 font-mono text-[11px] tracking-[0.08em] text-bone-600 uppercase sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Built for the Nebius × NVIDIA Global AI Hackathon, 2026</span>
          <MotionToggle />
          <span>MIT licensed</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.16em] text-bone-600 uppercase">{title}</p>
      <div className="mt-4 flex flex-col items-start gap-2.5 text-sm text-bone-400 [&>a]:transition-colors">{children}</div>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 hover:text-bone-50">
      {label}
      <ArrowUpRight className="size-3.5 opacity-50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden />
    </a>
  );
}
