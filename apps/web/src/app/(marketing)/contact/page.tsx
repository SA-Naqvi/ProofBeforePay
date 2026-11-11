import { MessageSquareText, ScanSearch, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/marketing/Faq";
import { PageHero } from "@/components/marketing/PageHero";
import { Accent } from "@/components/marketing/Section";
import { Reveal } from "@/components/motion/reveal";
import { ContactForm } from "@/features/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact · ProofBeforePay",
  description: "Questions, feedback, press or a bug report. Messages reach a person.",
};

const SIDE = [
  {
    icon: ScanSearch,
    title: "Got a supplier you don't trust?",
    body: "Don't send it to us. Check it: paste the invoice and you'll get an answer with the evidence behind it.",
    link: { href: "/#try", label: "Check it now" },
  },
  { icon: MessageSquareText, title: "We read everything", body: "Every message lands in our dashboard and our inbox. Feedback on a report helps tune the agents." },
  { icon: ShieldCheck, title: "Your email stays here", body: "We use it only to reply to you. It's never shared or added to a list." },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Talk to a <Accent>person.</Accent>
          </>
        }
        lede="A question, feedback on a report, a press or partnership idea, or something that broke. Write it here."
      />
      <section className="relative pb-10">
        <div className="mx-auto grid max-w-7xl items-start gap-6 px-5 sm:px-8 lg:grid-cols-[1.4fr_0.6fr]">
          <Reveal y={24}>
            <ContactForm />
          </Reveal>
          <Reveal as="div" selector="[data-side]" stagger={0.1} delay={0.1} className="space-y-4">
            {SIDE.map(({ icon: Icon, title, body, link }) => (
              <div key={title} data-side className="panel p-6">
                <Icon className="size-5 text-brand-300" aria-hidden />
                <h2 className="mt-4 font-semibold tracking-[-0.01em] text-bone-50">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-bone-400">{body}</p>
                {link && (
                  <Link href={link.href} className="mt-3 inline-block text-sm font-medium text-brand-300 underline-offset-4 hover:underline">
                    {link.label}
                  </Link>
                )}
              </div>
            ))}
          </Reveal>
        </div>
      </section>
      <Faq />
    </>
  );
}
