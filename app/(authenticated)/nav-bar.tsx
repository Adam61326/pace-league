"use client";

import { IconChevronDown } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/classement", label: "Classement" },
  { href: "/ligues", label: "Ligues" },
  { href: "/ligues-privees", label: "Ligues privées" },
];

export function NavBar({ initials, name }: { initials: string; name: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-black/[.08] bg-zinc-50/80 backdrop-blur dark:border-white/[.145] dark:bg-black/80">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-6">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          PaceLeague
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-foreground underline underline-offset-4"
                    : "text-zinc-600 hover:text-foreground dark:text-zinc-400"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
              {initials}
            </span>
            <IconChevronDown size={16} className="text-zinc-500 dark:text-zinc-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-md border border-black/[.08] bg-background py-1 shadow-lg dark:border-white/[.145]">
              <p className="truncate border-b border-black/[.08] px-3 py-2 text-sm font-medium dark:border-white/[.145]">
                {name}
              </p>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                >
                  Se déconnecter
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
