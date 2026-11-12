"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger } from "@/lib/gsap";
import { isIntroDone, onIntroDone } from "@/lib/intro";
import { getLenis, scrollToTarget, setLenis } from "@/lib/scroll";

/** Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger and the scroll position never drift apart. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.9, touchMultiplier: 1.4, allowNestedScroll: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(500, 33);
    setLenis(lenis);

    // Hold the page still while the home page's preloader is up (other pages have no intro).
    let unsubscribe = () => {};
    if (!isIntroDone() && window.location.pathname === "/") {
      lenis.stop();
      unsubscribe = onIntroDone(() => lenis.start());
    }
    return () => {
      unsubscribe();
      gsap.ticker.remove(tick);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  // New page: start at the top, or at the #section the link pointed to.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const hash = window.location.hash;
    const timer = window.setTimeout(() => {
      ScrollTrigger.refresh();
      if (hash) scrollToTarget(hash);
    }, 60);
    if (!hash) getLenis()?.scrollTo(0, { immediate: true, force: true });
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return <>{children}</>;
}
