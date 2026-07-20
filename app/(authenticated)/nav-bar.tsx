"use client";

import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { getCountryName } from "@/lib/countries";
import { IconChevronDown } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StravaActions } from "./strava-actions";

const NAV_LINKS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/mes-activites", label: "Mes activités" },
  { href: "/classement", label: "Classement" },
  { href: "/ligues", label: "Ligues" },
  { href: "/ligues-privees", label: "Ligues privées" },
];

export function NavBar({
  userId,
  firstname,
  lastname,
  photoUrl,
  name,
  email,
  countryCode,
  isStravaConnected,
}: {
  userId: string;
  firstname: string | null;
  lastname: string | null;
  photoUrl: string | null;
  name: string;
  email: string;
  countryCode: string | null;
  isStravaConnected: boolean;
}) {
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
    <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-6">
        <Link href="/dashboard">
          <Logo size="sm" />
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-accent/15 text-accent" : "text-zinc-400 hover:text-white"
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
            className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-white/[.06]"
          >
            <Avatar userId={userId} photoUrl={photoUrl} firstname={firstname} lastname={lastname} size={32} />
            <IconChevronDown size={16} className="text-zinc-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-md border border-white/10 bg-surface py-1 shadow-xl">
              <div className="border-b border-white/10 px-3 py-2">
                <p className="truncate text-sm font-medium text-white">{name}</p>
                <p className="truncate text-xs text-zinc-400">{email}</p>
              </div>

              <div className="flex flex-col gap-2 border-b border-white/10 px-3 py-3 text-xs">
                <p className="flex items-center justify-between">
                  <span className="text-zinc-400">Pays</span>
                  <span className="text-white">
                    {countryCode ? getCountryName(countryCode) : "—"}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-zinc-400">Strava</span>
                  <span className="text-white">
                    {isStravaConnected ? "connecté" : "non connecté"}
                  </span>
                </p>
                <StravaActions isConnected={isStravaConnected} />
              </div>

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/[.06] hover:text-white"
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
