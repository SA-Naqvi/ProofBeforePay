"use client";

import { History, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { initials, signOut } from "@/stores/session";
import type { User } from "@/types";

export function Avatar({ user, className }: { user: User; className?: string }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 font-semibold text-ink-950 ring-2 ring-ink-950",
        className ?? "size-8 text-xs",
      )}
      aria-hidden
    >
      {initials(user)}
    </span>
  );
}

export function UserMenu({ user, align = "right" }: { user: User; align?: "right" | "left" }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/history", label: "Your checks", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center rounded-full transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
      >
        <Avatar user={user} />
        <span className="sr-only">Account menu</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cx(
              "absolute top-11 z-50 w-64 origin-top rounded-2xl border border-white/[0.09] bg-ink-850/95 p-1.5 shadow-[0_24px_60px_-20px_rgba(16,72,130,0.28)] backdrop-blur-xl",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar user={user} className="size-9 text-xs" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-bone-50">{user.name || "Your account"}</p>
                <p className="truncate text-xs text-bone-500">{user.email}</p>
              </div>
            </div>
            <div className="my-1 h-px bg-white/[0.06]" />
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-bone-300 transition hover:bg-white/[0.05] hover:text-bone-50"
              >
                <Icon className="size-4 text-bone-500" aria-hidden />
                {label}
              </Link>
            ))}
            <div className="my-1 h-px bg-white/[0.06]" />
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await signOut();
                router.push("/");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-bone-300 transition hover:bg-white/[0.05] hover:text-bone-50"
            >
              <LogOut className="size-4 text-bone-500" aria-hidden />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
