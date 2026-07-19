export function formatDisplayName(firstname: string | null, lastname: string | null): string {
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
