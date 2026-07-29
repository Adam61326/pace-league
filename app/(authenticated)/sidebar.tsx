"use client";

import { Avatar } from "@/components/avatar";
import { InvitationsBell } from "@/components/invitations-bell";
import { Logo } from "@/components/logo";
import type { PendingClubInvitation } from "@/lib/club-invitations";
import type { PendingCoachInvitation } from "@/lib/coach";
import {
  IconChevronDown,
  IconClipboardList,
  IconCrown,
  IconHistory,
  IconLayoutDashboard,
  IconListNumbers,
  IconMenu2,
  IconMessageCircle,
  IconSearch,
  IconStairsUp,
  IconTournament,
  IconTrophy,
  IconUserStar,
  IconUsersGroup,
  IconX,
  IconChartRadar,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof IconSearch;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Sidebar verticale (Sprint 17, remplace la navbar horizontale a 5 liens) :
// 13 destinations desormais, regroupees par section plutot qu'un menu
// "Plus" fourre-tout — chaque groupe garde un sens produit (competition /
// progression individuelle / communaute).
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Compétition",
    items: [
      { href: "/", label: "Classement", icon: IconListNumbers },
      { href: "/ligues", label: "Ligues", icon: IconStairsUp },
      { href: "/hall-of-fame", label: "Hall of Fame", icon: IconCrown },
      { href: "/competitions", label: "Compétitions", icon: IconTournament },
      { href: "/clubs", label: "Clubs", icon: IconUsersGroup },
    ],
  },
  {
    label: "Ma progression",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: IconLayoutDashboard },
      { href: "/historique", label: "Historique", icon: IconHistory },
      { href: "/records", label: "Records", icon: IconTrophy },
      { href: "/statistiques", label: "Statistiques", icon: IconChartRadar },
      { href: "/plan-entrainement", label: "Plan d'entraînement", icon: IconClipboardList },
    ],
  },
  {
    label: "Communauté",
    items: [
      { href: "/recherche", label: "Recherche", icon: IconSearch },
      { href: "/messagerie", label: "Messagerie", icon: IconMessageCircle },
      { href: "/coach", label: "Vue Coach", icon: IconUserStar },
    ],
  },
];

// "/dashboard" reste actif sur sa sous-page "/mes-activites", "/ligues" sur
// "/ligues-privees" (et ses sous-routes) : groupement ad hoc plutôt qu'un
// simple startsWith, qui matcherait "/ligues-privees" sous "/ligues" par erreur.
function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/mes-activites");
  if (href === "/ligues") return pathname === "/ligues" || pathname.startsWith("/ligues-privees");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="px-3 text-[11px] font-semibold tracking-wide text-foreground-tertiary uppercase">
            {group.label}
          </span>
          {group.items.map((item) => {
            const isActive = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-accent/15 text-accent" : "text-foreground-secondary hover:bg-white/[.06] hover:text-foreground"
                }`}
              >
                <Icon size={18} stroke={1.75} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserMenu({
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
    <div ref={menuRef} className="relative border-t border-border p-3">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="flex w-full items-center gap-2 rounded-[10px] py-1.5 pr-2 pl-1.5 transition-colors hover:bg-white/[.06]"
      >
        <Avatar userId={userId} photoUrl={photoUrl} firstname={firstname} lastname={lastname} size={32} />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground">{name}</span>
        <IconChevronDown size={16} className="shrink-0 text-foreground-secondary" />
      </button>

      {menuOpen && (
        <div className="absolute right-3 bottom-full left-3 mb-2 rounded-2xl border border-border bg-surface py-1 shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-foreground-secondary">{email}</p>
          </div>

          <Link
            href="/parametres"
            className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-white/[.06] hover:text-foreground"
          >
            Paramètres
          </Link>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-white/[.06] hover:text-foreground"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  userId,
  firstname,
  lastname,
  photoUrl,
  name,
  email,
  pendingClubInvitations,
  pendingCoachInvitations,
}: {
  userId: string;
  firstname: string | null;
  lastname: string | null;
  photoUrl: string | null;
  name: string;
  email: string;
  pendingClubInvitations: PendingClubInvitation[];
  pendingCoachInvitations: PendingCoachInvitation[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const userMenu = <UserMenu userId={userId} firstname={firstname} lastname={lastname} photoUrl={photoUrl} name={name} email={email} />;

  return (
    <>
      {/* Barre mobile : logo + cloche + bouton menu, sidebar en overlay au clic */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
        <Link href="/">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <InvitationsBell clubInvitations={pendingClubInvitations} coachInvitations={pendingCoachInvitations} />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-foreground-secondary hover:bg-white/[.06] hover:text-foreground"
          >
            <IconMenu2 size={20} />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/60" aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-background">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo size="sm" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-foreground-secondary hover:bg-white/[.06] hover:text-foreground"
              >
                <IconX size={18} />
              </button>
            </div>
            <NavContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            {userMenu}
          </div>
        </div>
      )}

      {/* Sidebar desktop, toujours visible */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link href="/">
            <Logo size="sm" />
          </Link>
          <InvitationsBell
            clubInvitations={pendingClubInvitations}
            coachInvitations={pendingCoachInvitations}
            align="left"
          />
        </div>
        <NavContent pathname={pathname} />
        {userMenu}
      </aside>
    </>
  );
}
