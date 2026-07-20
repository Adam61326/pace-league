interface Props {
  // Clé 'YYYY-MM-DD' -> km cumulés ce jour-là (toutes activités synchronisées,
  // pas seulement celles qui comptent pour le score).
  kmByDate: Map<string, number>;
  weekStartDates: string[]; // lundis, du plus ancien au plus récent
}

function levelFor(km: number): 0 | 1 | 2 | 3 {
  if (km <= 0) return 0;
  if (km < 5) return 1;
  if (km < 10) return 2;
  return 3;
}

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-white/[.06]",
  1: "bg-accent/25",
  2: "bg-accent/60",
  3: "bg-accent",
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
}

// Grille façon "contributions GitHub" : colonnes = semaines (la plus
// ancienne à gauche), lignes = jours lundi -> dimanche (convention de
// semaine du produit, cf. CLAUDE.md).
export function ContributionCalendar({ kmByDate, weekStartDates }: Props) {
  return (
    <div className="flex gap-[3px]">
      {weekStartDates.map((weekStart) => (
        <div key={weekStart} className="flex flex-col gap-[3px]">
          {Array.from({ length: 7 }, (_, dayOffset) => {
            const date = addDays(weekStart, dayOffset);
            const km = kmByDate.get(date) ?? 0;
            const level = levelFor(km);
            const title = km > 0 ? `${formatDate(date)} — ${km.toFixed(1)} km` : formatDate(date);
            return (
              <div
                key={date}
                title={title}
                className={`h-[11px] w-[11px] rounded-sm ${LEVEL_CLASSES[level]}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
