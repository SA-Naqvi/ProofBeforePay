"use client";

import { ArrowUpRight, LayoutDashboard, Menu, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { GithubMark, LogoMark } from "@/components/layout/Logo";
import { UserMenu } from "@/components/layout/UserMenu";
import { Magnetic, RollText, ScrambleText, trackFillOrigin } from "@/components/motion/interactive";
import { cx } from "@/lib/cx";
import { scrollToTarget } from "@/lib/scroll";
import { REPO_URL } from "@/lib/site";
import { useSession } from "@/stores/session";

/** Link to a landing-page section: smooth-scrolls when already on the landing page, navigates otherwise. */
export function SectionLink({
  hash,
  children,
  className,
  onNavigate,
  onPointerEnter,
}: {
  hash: string;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
  onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void;
}) {
  const pathname = usePathname();
  const onHome = pathname === "/";
  function handle(event: MouseEvent<HTMLAnchorElement>) {
    onNavigate?.();
    if (!onHome) return;
    event.preventDefault();
    scrollToTarget(hash);
    window.history.replaceState(null, "", hash);
  }
  return (
    <Link href={`/${hash}`} onClick={handle} onPointerEnter={onPointerEnter} className={className} scroll={!onHome}>
      {children}
    </Link>
  );
}

const LINKS: { href: string; label: string; hash?: string }[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function NavLink({ link, className, onNavigate }: { link: (typeof LINKS)[number]; className: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === link.href;
  if (link.hash) {
    return (
      <SectionLink hash={link.hash} className={className} onNavigate={onNavigate}>
        <ScrambleText text={link.label} />
      </SectionLink>
    );
  }
  return (
    <Link href={link.href} onClick={onNavigate} className={cx(className, active && "text-bone-50")} aria-current={active ? "page" : undefined}>
      <ScrambleText text={link.label} />
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const { status, user } = useSession();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      if (Math.abs(y - last) > 6) {
        setHidden(y > last && y > 320);
        last = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const cta = (
    <Magnetic strength={0.25}>
      {user ? (
        <Link
          href="/dashboard"
          onPointerEnter={trackFillOrigin}
          className="btn roll-host inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 text-[13px] font-semibold text-ink-950 [--btn-fill:var(--color-bone-50)]"
        >
          <span data-magnetic-inner className="relative inline-flex items-center gap-1.5">
            <LayoutDashboard className="size-3.5" aria-hidden />
            <RollText text="Dashboard" />
          </span>
        </Link>
      ) : (
        <SectionLink
          hash="#try"
          onPointerEnter={trackFillOrigin}
          className="btn roll-host inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 text-[13px] font-semibold text-ink-950 [--btn-fill:var(--color-bone-50)]"
        >
          <span data-magnetic-inner className="relative inline-flex items-center gap-1.5">
            {onHome ? <ArrowUpRight className="size-3.5 rotate-90" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            <RollText text="Check a supplier" />
          </span>
        </SectionLink>
      )}
    </Magnetic>
  );

  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 transition-transform duration-700 ease-out-expo sm:px-5",
        hidden && !open && "-translate-y-[140%]",
      )}
    >
      <nav
        className={cx(
          "relative z-10 flex w-full max-w-6xl items-center justify-between gap-3 rounded-2xl border py-2 pr-2 pl-3 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-500",
          scrolled || open
            ? "border-white/[0.08] bg-ink-900/70 shadow-[0_18px_40px_-24px_rgba(16,72,130,0.28)] backdrop-blur-xl backdrop-saturate-150"
            : "border-transparent bg-transparent",
        )}
        aria-label="Main"
      >
        <Link href="/" className="group flex items-center gap-2.5 rounded-lg text-bone-50" aria-label="ProofBeforePay home">
          <LogoMark className="size-7 text-bone-300" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">ProofBeforePay</span>
        </Link>

        <div className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.href}
              link={link}
              className="rounded-lg px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-bone-400 uppercase transition-colors hover:text-bone-50"
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {REPO_URL && (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden size-9 place-items-center rounded-xl text-bone-400 transition hover:bg-white/[0.06] hover:text-bone-50 sm:grid"
              aria-label="Source code on GitHub"
            >
              <GithubMark className="size-[18px]" />
            </a>
          )}
          {status === "ready" && !user && (
            <Link href="/login" className="hidden h-9 items-center rounded-xl px-3 text-[13px] font-medium text-bone-300 transition hover:text-bone-50 sm:inline-flex">
              Sign in
            </Link>
          )}
          <div className="hidden sm:block">{cta}</div>
          {user && (
            <div className="hidden lg:block">
              <UserMenu user={user} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-9 place-items-center rounded-xl text-bone-200 transition hover:bg-white/[0.06] lg:hidden"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={open ? "x" : "menu"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 bg-ink-950/96 backdrop-blur-xl lg:hidden"
            initial={{ clipPath: "circle(0% at calc(100% - 40px) 36px)" }}
            animate={{ clipPath: "circle(150% at calc(100% - 40px) 36px)" }}
            exit={{ clipPath: "circle(0% at calc(100% - 40px) 36px)" }}
            transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="flex h-full flex-col px-6 pt-28 pb-10">
              <nav className="flex flex-col gap-1" aria-label="Mobile">
                {[...LINKS, ...(user ? [{ href: "/dashboard", label: "Dashboard" }] : [{ href: "/login", label: "Sign in" }, { href: "/signup", label: "Create account" }])].map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between border-b border-white/[0.06] py-4 text-3xl font-semibold tracking-[-0.04em] text-bone-50"
                    >
                      {link.label}
                      <ArrowUpRight className="size-5 text-bone-600" aria-hidden />
                    </Link>
                  </motion.div>
                ))}
              </nav>
              <motion.div className="mt-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                <Link
                  href={user ? "/investigate" : "/#try"}
                  onClick={() => setOpen(false)}
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-semibold text-ink-950"
                >
                  <Plus className="size-4" aria-hidden /> Check a supplier
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
