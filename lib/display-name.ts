// Priorité (Sprint 16) : nom personnalisé choisi par l'utilisateur, sinon
// nom Strava ("Prénom I."), sinon nom générique — jamais deux sources de
// vérité affichées à des endroits différents, tous les appelants passent
// systématiquement display_name en premier argument.
export function formatDisplayName(
  displayName: string | null,
  firstname: string | null,
  lastname: string | null
): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  if (!firstname) return "Coureur Strava";
  const lastInitial = lastname ? `${lastname.charAt(0).toUpperCase()}.` : "";
  return [firstname, lastInitial].filter(Boolean).join(" ");
}

export function initials(firstname: string | null, lastname: string | null, fallback = "?"): string {
  if (!firstname) return fallback;
  return [firstname.charAt(0), lastname?.charAt(0)]
    .filter(Boolean)
    .join("")
    .toUpperCase();
}
