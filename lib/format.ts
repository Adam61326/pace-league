// Formatters partagés entre composants serveur (app/(authenticated)/plan-entrainement/page.tsx)
// et client (components/race-list.tsx) — doit rester un module sans "use client"
// pour être appelable depuis les deux.
export function formatRaceDate(raceDate: string | null): string | null {
  if (!raceDate) return null;
  const date = new Date(`${raceDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

// Titre du modal "Ajouter une séance" (components/training-session-modal.tsx) :
// date complète en toutes lettres et en majuscules, ex. "23 JUILLET 2026".
export function formatFullDateUpper(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(date)
    .toUpperCase();
}

export function formatDistanceKm(distanceKm: number): string {
  return `${distanceKm.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} km`;
}

// Colonnes SEGMENT/CUMUL du tableau de splits : durée d'un segment ou temps
// cumulé depuis le départ, en MM:SS (ou H:MM:SS au-delà d'une heure).
export function formatDuration(totalSeconds: number): string {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
