"use client";

import { Coins, GitCompareArrows, History, LayoutDashboard, LogOut, Menu, Plus, ScanSearch, Settings, ShieldCheck, ShieldX, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { LogoMark } from "@/components/layout/Logo";
import { Nav } from "@/components/layout/Nav";
import { ShellLoader } from "@/components/layout/ShellLoader";
import { Avatar } from "@/components/layout/UserMenu";
import { buttonClasses } from "@/components/ui";
import { useHealth } from "@/hooks/useBackend";
import { useApi } from "@/hooks/useApi";
import { billing } from "@/lib/api-client";
import { cx } from "@/lib/cx";
import { signOut, useSession } from "@/stores/session";
import type { User } from "@/types";

/** "app" inside the signed-in shell, "public" when a signed-out visitor opens a shared report. */
export const ShellContext = createContext<"app" | "public">("public");
export const useShell = () => useContext(ShellContext);

// Shared reports must open for anyone with the link; everything else in the app needs an account.
const PUBLIC_PATHS = ["/investigations"];

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/investigate", label: "New check", icon: ScanSearch },
  { href: "/history", label: "Your checks", icon: History },
  { href: "/billing", label: "Credits", icon: Coins },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/settings", label: "Settings", icon: Settings },
];

function SidebarContent({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const health = useHealth();
  const credits = useApi(() => billing.get(), [pathname]); // refreshed after every page change, so it follows each check
  const items = [...NAV, ...(user.role === "admin" ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : [])];

  return (
    <div className="flex h-full flex-col px-4 py-5">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-2 text-bone-50" aria-label="ProofBeforePay home">
        <LogoMark className="size-7 text-bone-300" />
        <span className="text-[15px] font-semibold tracking-[-0.02em]">ProofBeforePay</span>
      </Link>

      <Link href="/investigate" onClick={onNavigate} className={buttonClasses("primary", "mt-7 h-11 w-full")}>
        <Plus className="size-4" aria-hidden /> New check
      </Link>

      <nav className="mt-7 flex flex-col gap-0.5" aria-label="App">
        <p className="mb-2 px-3 font-mono text-[10px] tracking-[0.16em] text-bone-600 uppercase">Workspace</p>
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "text-bone-50" : "text-bone-400 hover:text-bone-100",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-white/[0.06] ring-1 ring-white/[0.07] ring-inset"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              {active && <motion.span layoutId="sidebar-bar" className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand-400" />}
              <Icon className={cx("relative size-[18px] transition-colors", active ? "text-brand-300" : "text-bone-500 group-hover:text-bone-300")} aria-hidden />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        {credits.data?.enabled && (
          <Link
            href="/billing"
            onClick={onNavigate}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-bone-300 transition-colors hover:bg-white/[0.05]"
          >
            <span className="flex items-center gap-2">
              <Coins className="size-3.5 text-brand-300" aria-hidden /> Credits
            </span>
            <span className="font-mono text-bone-100">{credits.data.exempt ? "Unlimited" : (credits.data.balance ?? 0)}</span>
          </Link>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-bone-400">
          <span className="relative flex size-2">
            {health?.live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />}
            <span className={cx("relative inline-flex size-2 rounded-full", health?.live ? "bg-brand-500" : health === undefined ? "bg-bone-600" : "bg-caution-400")} />
          </span>
          {health === undefined ? "Checking the agents…" : health?.live ? "Agents online" : "Live checks paused"}
        </div>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar user={user} className="size-9 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-bone-50">{user.name || "Your account"}</p>
            <p className="truncate text-xs text-bone-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="grid size-8 place-items-center rounded-lg text-bone-500 transition hover:bg-white/[0.06] hover:text-bone-100"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (status === "ready" && !user && !isPublic) {
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, user, isPublic, pathname, router]);
  useEffect(() => setDrawer(false), [pathname]);

  if (status === "loading") return <ShellLoader label="Loading your workspace" />;

  if (!user) {
    if (!isPublic) return <ShellLoader label="Taking you to sign in" />;
    return (
      <ShellContext.Provider value="public">
        <Nav />
        <main className="min-h-[100svh]">{children}</main>
        <Footer />
      </ShellContext.Provider>
    );
  }

  const forbidden = pathname.startsWith("/admin") && user.role !== "admin";

  return (
    <ShellContext.Provider value="app">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-white/[0.06] bg-ink-950/80 backdrop-blur-xl lg:block">
        <SidebarContent user={user} />
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.06] bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-bone-50">
          <LogoMark className="size-6 text-bone-300" />
          <span className="text-sm font-semibold tracking-tight">ProofBeforePay</span>
        </Link>
        <button type="button" onClick={() => setDrawer(true)} className="grid size-9 place-items-center rounded-xl text-bone-200 hover:bg-white/[0.06]" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[284px] max-w-[85vw] border-r border-white/[0.08] bg-ink-950 lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <button type="button" onClick={() => setDrawer(false)} className="absolute top-4 right-3 grid size-9 place-items-center rounded-xl text-bone-400 hover:bg-white/[0.06]" aria-label="Close menu">
                <X className="size-5" />
              </button>
              <SidebarContent user={user} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="min-h-[100svh] lg:pl-[264px]">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-8 sm:py-10">
          {user.demo && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sand-300/25 bg-sand-300/[0.06] px-4 py-3 text-sm text-sand-100"
            >
              <span>
                <span className="font-semibold">You&apos;re in the shared demo account.</span> Checks you run here are visible to other judges, and
                the account can&apos;t be changed.
              </span>
              <Link href="/signup" onClick={() => void signOut()} className="text-xs font-semibold whitespace-nowrap text-bone-50 underline-offset-4 hover:underline">
                Create your own account
              </Link>
            </motion.div>
          )}
          {forbidden ? (
            <div className="grid min-h-[60svh] place-items-center text-center">
              <div>
                <ShieldX className="mx-auto size-10 text-stop-300" aria-hidden />
                <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-bone-50">Admins only</h1>
                <p className="mt-2 text-bone-400">Your account can&apos;t open the admin dashboard.</p>
                <Link href="/dashboard" className={buttonClasses("secondary", "mt-6")}>
                  Back to your dashboard
                </Link>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </ShellContext.Provider>
  );
}
