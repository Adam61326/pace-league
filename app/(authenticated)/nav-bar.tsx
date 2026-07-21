"use client";

import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { IconChevronDown } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Sprint 11 : navigation consolidée à 3 onglets. "Mes activités" et "Ligues
// privées" restent fonctionnelles à leurs URLs habituelles, mais ne sont
// plus atteignables que via les sous-onglets de "Tableau de bord" / "Ligues"
// (voir SubTabs sur ces pages), pas depuis la navbar principale.
const NAV_LINKS = [
  { href: "/", label: "Classement" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/ligues", label: "Ligues" },
  { href: "/hall-of-fame", label: "Hall of Fame" },
];

// "/dashboard" reste actif sur sa sous-page "/mes-activites", "/ligues" sur
// "/ligues-privees" (et ses sous-routes) : groupement ad hoc plutôt qu'un
// simple startsWith, qui matcherait "/ligues-privees" sous "/ligues" par
// erreur autrement.
function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/mes-activites");
  if (href === "/ligues") return pathname === "/ligues" || pathname.startsWith("/ligues-privees");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavBar({
  userId,
  firstname,
  lastname,
  photoUrl,
  name,
  email,
}: {
  userId: string;
  firstname: string | null;
  lastname: string | null;
  photoUrl: string | null;
  name: string;
  email: string;
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
        <Link href="/">
          <Logo size="sm" />
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = isNavActive(pathname, link.href);
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

              <Link
                href="/parametres"
                className="flex w-full items-center px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/[.06] hover:text-white"
              >
                Paramètres
              </Link>

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
