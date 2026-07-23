// Titre le plus récemment débloqué (Sprint 15), affiché sous le pseudo
// partout où le nom d'un utilisateur s'affiche déjà (classement, cohorte,
// ligues privées) — un seul à la fois, jamais plusieurs empilés.
export function TitleBadge({ label }: { label: string }) {
  return <span className="block text-xs text-accent">{label}</span>;
}
