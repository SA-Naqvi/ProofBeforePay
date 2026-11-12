"use client";

import { useRef, type ReactNode } from "react";
import { gsap, MOTION_OK, SplitText, useGSAP } from "@/lib/gsap";
import { onIntroDone } from "@/lib/intro";

type BlockTag = "div" | "section" | "ul" | "ol" | "li" | "p" | "span" | "header";

/** Fades, lifts and un-blurs content the first time it scrolls into view. `selector` staggers matching children instead. */
export function Reveal({
  children,
  className,
  as = "div",
  selector,
  delay = 0,
  y = 36,
  stagger = 0.08,
  start = "top 86%",
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: BlockTag;
  selector?: string;
  delay?: number;
  y?: number;
  stagger?: number;
  start?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const Tag = as as "div";

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.matchMedia().add(MOTION_OK, () => {
        const targets = selector ? el.querySelectorAll(selector) : el;
        gsap.fromTo(
          targets,
          { autoAlpha: 0, y },
          {
            autoAlpha: 1,
            y: 0,
            duration: 1.2,
            ease: "expo.out",
            delay,
            stagger,
            scrollTrigger: { trigger: el, start, once: true },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className} id={id}>
      {children}
    </Tag>
  );
}

type HeadingTag = "h1" | "h2" | "h3" | "p" | "div";

/** Headline that rises word by word out of masked lines, on scroll or when the intro finishes. */
export function SplitReveal({
  children,
  className,
  as = "h2",
  trigger = "scroll",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: HeadingTag;
  trigger?: "scroll" | "intro";
  delay?: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const Tag = as as "h2";

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.matchMedia().add(MOTION_OK, () => {
        let unsubscribe = () => {};
        const split = SplitText.create(el, {
          type: "lines,words",
          mask: "lines",
          autoSplit: true,
          onSplit(self) {
            // Italic serif descenders would be clipped by the line masks without a little room.
            const masks = (self as unknown as { masks?: HTMLElement[] }).masks ?? [];
            gsap.set(masks, { paddingBottom: "0.12em", marginBottom: "-0.12em" });
            const tween = gsap.from(self.words, {
              yPercent: 120,
              rotate: 4,
              duration: 1.3,
              ease: "expo.out",
              stagger: 0.05,
              delay,
              paused: trigger === "intro",
              scrollTrigger: trigger === "scroll" ? { trigger: el, start: "top 88%", once: true } : undefined,
            });
            if (trigger === "intro") {
              unsubscribe();
              unsubscribe = onIntroDone(() => tween.play());
            }
            return tween;
          },
        });
        return () => {
          unsubscribe();
          split.revert();
        };
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

/** A paragraph whose words light up one by one as it is scrolled through. Wrap words in *asterisks* to accent them. */
export function TextScrub({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  let inside = false;
  const words = text.split(" ").map((word) => {
    const opens = word.startsWith("*");
    const closes = word.replace(/[.,:;!?]+$/, "").endsWith("*");
    const accent = inside || opens;
    if (opens) inside = true;
    if (closes) inside = false;
    return { clean: word.replace(/\*/g, ""), accent };
  });

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.fromTo(
          el.querySelectorAll("[data-word]"),
          { opacity: 0.13 },
          {
            opacity: 1,
            ease: "none",
            stagger: 0.1,
            scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 50%", scrub: 0.6 },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <p ref={ref} className={className}>
      {words.map(({ clean, accent }, i) => (
        <span key={i} data-word className={accent ? "font-serif font-normal italic tracking-normal text-brand-400" : undefined}>
          {clean}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
