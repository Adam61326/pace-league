import Link from "next/link";

interface SubTab {
  href: string;
  label: string;
}

// Sous-navigation entre deux vues d'un même onglet principal (ex: Tableau de
// bord / Mes activités, Ligues par pays / Ligues privées). Purement
// présentationnel : chaque page connaît déjà sa propre route, pas besoin de
// usePathname ni de "use client".
export function SubTabs({ tabs, activeHref }: { tabs: SubTab[]; activeHref: string }) {
  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            tab.href === activeHref
              ? "gradient-signature text-white"
              : "border border-border text-foreground-secondary hover:bg-white/[.06]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
