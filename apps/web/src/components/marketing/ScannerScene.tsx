"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { onIntroDone } from "@/lib/intro";

type Tone = "stop" | "caution" | "go";
type Segment = string | { hit: number; text: string };

interface Scene {
  decision: "STOP" | "PROCEED";
  confidence: number;
  name: string;
  initials: string;
  channel: string;
  address: Segment[];
  body: Segment[];
  hits: { tone: Tone; label: string; ref: string }[];
}

// Both suppliers are made up. One is a classic borrowed-licence "factory", the other an honest trading company.
const SCENES: Scene[] = [
  {
    decision: "STOP",
    confidence: 94,
    name: "Brightstar Textile",
    initials: "BT",
    channel: "Alibaba chat",
    address: ["From ", { hit: 3, text: "sales@brightstar-textile.com" }],
    body: [
      "Hi! We are ",
      { hit: 1, text: "a factory with 200 workers" },
      ". ",
      { hit: 0, text: "Licence 91440300MA5F…" },
      ", ISO 9001 certified. Your 5,000 hoodies are $18,750. Please ",
      { hit: 2, text: "pay 100% in advance to our finance manager's personal account" },
      ". Price valid 48 hours.",
    ],
    hits: [
      { tone: "stop", label: "Licence belongs to another company", ref: "F1" },
      { tone: "stop", label: "Factory address is a residential block", ref: "F4" },
      { tone: "stop", label: "Paid to a personal account", ref: "F3" },
      { tone: "caution", label: "Website domain 40 days old", ref: "F7" },
    ],
  },
  {
    decision: "PROCEED",
    confidence: 88,
    name: "Meridian Homeware",
    initials: "MH",
    channel: "IndiaMART",
    address: ["From ", { hit: 3, text: "exports@meridianhomeware.example" }],
    body: [
      "Quotation for 2,000 brass serving trays, $9,400. We are an export house sourcing from approved workshops. Terms: ",
      { hit: 0, text: "30% advance, balance against bill of lading" },
      ", paid to ",
      { hit: 1, text: "the account of Meridian Homeware Exports Pvt Ltd" },
      ". ",
      { hit: 2, text: "Third-party inspection is welcome" },
      ".",
    ],
    hits: [
      { tone: "go", label: "Standard deposit terms", ref: "F2" },
      { tone: "go", label: "Paid to the company's own account", ref: "F1" },
      { tone: "go", label: "Inspection welcome", ref: "F3" },
      { tone: "go", label: "Registered, with export history", ref: "C1" },
    ],
  },
];

const TONE = {
  stop: { hex: "#e5483a", hl: "rgb(229 72 58 / 0.16)", chip: "border-stop-500/35", dot: "bg-stop-400", text: "text-stop-200" },
  caution: { hex: "#d98b0b", hl: "rgb(217 139 11 / 0.2)", chip: "border-caution-400/35", dot: "bg-caution-400", text: "text-caution-200" },
  go: { hex: "#0284c7", hl: "rgb(56 189 248 / 0.2)", chip: "border-brand-500/35", dot: "bg-brand-400", text: "text-brand-200" },
} as const;

const CHIP_DEPTH = [110, 150, 90, 130];
const STAGE = 540; // design size of the scene; it is scaled to fit its column

function renderSegments(segments: Segment[], scene: Scene) {
  return segments.map((segment, i) =>
    typeof segment === "string" ? (
      <span key={i}>{segment}</span>
    ) : (
      <mark
        key={i}
        data-mark={segment.hit}
        className="hl text-inherit"
        style={{ ["--hl" as string]: TONE[scene.hits[segment.hit]?.tone ?? "stop"].hl }}
      >
        {segment.text}
      </mark>
    ),
  );
}

/**
 * The hero's 3D set piece, built from CSS 3D layers rather than WebGL so the text stays crisp:
 * a supplier's invoice is scanned line by line, risk signals lift off it toward the viewer, and a decision stamp lands.
 * It alternates between a fraud and an honest supplier, because the product is not just a fraud detector.
 */
export function ScannerScene() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const scene = SCENES[index] ?? SCENES[0]!;
  const stamp = scene.decision === "STOP" ? TONE.stop : TONE.go;

  // Fit the fixed-size stage into whatever width the column gives it.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setScale(Math.min(1, entry.contentRect.width / STAGE)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pointer parallax on the whole rig.
  useGSAP(
    () => {
      const el = rig.current;
      if (!el || prefersReducedMotion()) return;
      gsap.set(el, { rotationX: 14, rotationY: -20, rotationZ: 1.5 });
      const rx = gsap.quickTo(el, "rotationX", { duration: 1.2, ease: "power3.out" });
      const ry = gsap.quickTo(el, "rotationY", { duration: 1.2, ease: "power3.out" });
      const move = (event: PointerEvent) => {
        const nx = event.clientX / window.innerWidth - 0.5;
        const ny = event.clientY / window.innerHeight - 0.5;
        rx(14 - ny * 12);
        ry(-20 + nx * 18);
      };
      window.addEventListener("pointermove", move, { passive: true });
      return () => window.removeEventListener("pointermove", move);
    },
    { scope: root },
  );

  // One scan cycle per scene; when it ends, the next scene mounts and this runs again.
  useGSAP(
    () => {
      const cardEl = card.current;
      const rigEl = rig.current;
      if (!cardEl || !rigEl) return;
      const marks = gsap.utils.toArray<HTMLElement>("[data-mark]", cardEl);
      const chips = gsap.utils.toArray<HTMLElement>("[data-chip]", rigEl);
      const stampEl = rigEl.querySelector<HTMLElement>("[data-stamp]");
      const height = cardEl.offsetHeight;

      // Stack the chips down the right edge of the card in the order the scanner reaches their phrases.
      const order = [...marks].sort((a, b) => a.offsetTop - b.offsetTop).map((m) => m.dataset.mark);
      chips.forEach((chip) => {
        const slot = order.indexOf(chip.dataset.chip);
        gsap.set(chip, { top: cardEl.offsetTop + 18 + Math.max(0, slot) * 58 });
      });

      gsap.set(chips, { autoAlpha: 0, z: 0, scale: 0.6, rotationX: 35 });
      gsap.set("[data-stamp]", { autoAlpha: 0, scale: 2.6, rotation: -26, z: 200 });
      gsap.set("[data-think]", { autoAlpha: 0, y: 12, z: 120 });
      gsap.set("[data-scan]", { y: 0, autoAlpha: 0 });

      const tl = gsap.timeline({ paused: true, onComplete: () => setIndex((i) => (i + 1) % SCENES.length) });
      tl.fromTo("[data-swap]", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "expo.out", stagger: 0.06 }, 0);
      tl.to("[data-scan]", { autoAlpha: 1, duration: 0.3 }, 0.45).to("[data-scan]", { y: height, duration: 2.8, ease: "none" }, 0.45);

      marks.forEach((mark) => {
        const i = Number(mark.dataset.mark);
        const hit = scene.hits[i];
        if (!hit) return;
        const at = 0.45 + 2.8 * ((mark.offsetTop + mark.offsetHeight * 0.5) / height);
        tl.to(mark, { backgroundSize: "100% 100%", color: TONE[hit.tone].hex, duration: 0.5, ease: "power2.out" }, at);
        const chip = chips.find((c) => c.dataset.chip === String(i));
        if (chip) {
          tl.to(chip, { autoAlpha: 1, z: CHIP_DEPTH[i] ?? 100, scale: 1, rotationX: 0, duration: 1, ease: "back.out(1.5)" }, at + 0.05);
        }
      });

      tl.to("[data-scan]", { autoAlpha: 0, duration: 0.35 }, 3.25)
        .to("[data-think]", { autoAlpha: 1, y: 0, duration: 0.6, ease: "expo.out" }, 3.3)
        .to("[data-stamp]", { autoAlpha: 1, scale: 1, rotation: -9, duration: 0.42, ease: "power4.in" }, 4.4)
        .to(cardEl, { x: "+=6", y: "-=3", duration: 0.05, yoyo: true, repeat: 3, ease: "none" }, 4.82)
        .to("[data-think]", { autoAlpha: 0, duration: 0.4 }, 4.9)
        .to({}, { duration: 2.6 })
        .to(stampEl ? [...chips, stampEl] : chips, { autoAlpha: 0, z: "-=60", duration: 0.55, stagger: 0.04, ease: "power2.in" })
        .to("[data-swap]", { autoAlpha: 0, y: -6, duration: 0.4, stagger: 0.03 }, "<0.2");

      if (prefersReducedMotion()) {
        tl.eventCallback("onComplete", null);
        tl.progress(0.75).pause();
        return;
      }

      // Only animate while the hero is on screen, and not before the preloader has lifted.
      let started = false;
      const visibility = ScrollTrigger.create({
        trigger: root.current,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => {
          if (started) self.isActive ? tl.resume() : tl.pause();
        },
      });
      return onIntroDone(() => {
        started = true;
        if (visibility.isActive) tl.play();
      });
    },
    { scope: root, dependencies: [index], revertOnUpdate: true },
  );

  return (
    <div ref={root} className="relative mx-auto w-full max-w-[560px]" style={{ height: STAGE * scale }} aria-hidden>
      <div
        ref={stage}
        className="absolute top-0 left-1/2 origin-top"
        style={{ width: STAGE, height: STAGE, transform: `translateX(-50%) scale(${scale})`, perspective: 1500 }}
      >
        <div ref={rig} className="absolute inset-0 [transform-style:preserve-3d]">
          {/* Depth plate behind the card */}
          <div
            className="bg-dots absolute top-[19%] left-[5%] h-[64%] w-[64%] rounded-[28px] border border-white/[0.05] bg-ink-900/40"
            style={{ transform: "translateZ(-90px) rotate(-4deg)" }}
          />
          <div className="absolute top-[22%] left-[12%] h-[52%] w-[70%] rounded-full bg-brand-500/[0.07] blur-3xl" style={{ transform: "translateZ(-140px)" }} />

          {/* The message */}
          <div
            ref={card}
            className="absolute top-[16%] left-[1%] w-[63%] overflow-hidden rounded-[22px] border border-white/[0.09] bg-gradient-to-b from-ink-800 to-ink-900 p-5 shadow-[0_50px_100px_-30px_rgba(16,72,130,0.3),inset_0_1px_0_rgba(29,74,122,0.06)]"
          >
            <div data-swap className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-bone-200 text-[12px] font-semibold text-ink-900">{scene.initials}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-bone-50">{scene.name}</p>
                <p className="font-mono text-[11px] text-bone-500">{renderSegments(scene.address, scene)}</p>
              </div>
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-bone-400">
                {scene.channel}
              </span>
            </div>
            <div data-swap className="my-4 h-px bg-white/[0.06]" />
            <p data-swap className="text-[14px] leading-[1.65] text-bone-300">
              {renderSegments(scene.body, scene)}
            </p>
            <div data-swap className="mt-4 flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-bone-600 uppercase">
              <span className="size-1.5 rounded-full bg-bone-600" /> Pasted into ProofBeforePay
            </div>

            {/* Scanner beam */}
            <div data-scan className="pointer-events-none absolute inset-x-0 top-0">
              <div className="absolute inset-x-0 -top-16 h-16 bg-gradient-to-b from-transparent to-brand-400/[0.12]" />
              <div className="h-[2px] bg-gradient-to-r from-transparent via-brand-300 to-transparent shadow-[0_0_24px_6px_rgba(56,189,248,0.45)]" />
            </div>
          </div>

          {/* Signals lifting off the message */}
          {scene.hits.map((hit, i) => (
            <div
              key={`${index}-${i}`}
              data-chip={i}
              className={cx(
                "glass absolute left-[61%] flex items-center gap-2.5 rounded-xl border px-3 py-2 whitespace-nowrap shadow-[0_24px_40px_-18px_rgba(16,72,130,0.28)]",
                TONE[hit.tone].chip,
              )}
            >
              <span className={cx("size-2 rounded-full", TONE[hit.tone].dot)} />
              <span className={cx("text-[12.5px] font-medium", TONE[hit.tone].text)}>{hit.label}</span>
              <span className="rounded-md bg-white/[0.06] px-1.5 font-mono text-[10px] text-bone-400">{hit.ref}</span>
            </div>
          ))}

          {/* Ultra weighing the evidence */}
          <div data-think className="glass absolute top-[4%] left-[2%] flex items-center gap-2.5 rounded-full px-3.5 py-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-400" />
            </span>
            <span className="text-[12.5px] font-medium text-bone-100">Nemotron Ultra</span>
            <span className="font-mono text-[11px] text-bone-500">
              weighing {scene.hits.length} signals
              <span className="dots ml-0.5 inline-flex">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </span>
          </div>

          {/* The verdict */}
          <div
            data-stamp
            className="stamp absolute right-[3%] bottom-[5%] rounded-2xl border-[3px] px-6 py-3 text-center"
            style={{ color: stamp.hex, borderColor: stamp.hex, boxShadow: `0 0 50px -10px ${stamp.hex}` }}
          >
            <p className="text-[40px] leading-none font-black tracking-[0.04em]">{scene.decision}</p>
            <p className="mt-1.5 font-mono text-[10px] font-semibold tracking-[0.2em]">CONFIDENCE {scene.confidence}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
