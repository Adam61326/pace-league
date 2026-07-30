// Formatters partagés entre composants serveur (app/(authenticated)/plan-entrainement/page.tsx)
// et client (components/race-list.tsx) — doit rester un module sans "use client"
// pour être appelable depuis les deux.
export function formatRaceDate(raceDate: string | null): string | null {
  if (!raceDate) return null;
  const date = new Date(`${raceDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatDistanceKm(distanceKm: number): string {
  return `${distanceKm.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} km`;
}
