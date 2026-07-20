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
              ? "bg-accent text-black"
              : "border border-white/10 text-zinc-300 hover:bg-white/[.06]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
