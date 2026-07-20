import { initials as computeInitials } from "@/lib/display-name";
import { getAvatarGradient } from "@/lib/avatar-gradient";

// Priorité d'affichage (CLAUDE.md Sprint 9) : 1) vraie photo Strava si
// disponible, 2) sinon avatar en dégradé abstrait à deux couleurs stable
// par utilisateur.
export function Avatar({
  userId,
  photoUrl,
  firstname,
  lastname,
  size = 32,
  className = "",
}: {
  userId: string;
  photoUrl?: string | null;
  firstname: string | null;
  lastname: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };

  if (photoUrl) {
    return (
      // Photo Strava : domaine variable et non prévisible (CDN Strava),
      // next/image demanderait de whitelister chaque domaine possible.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={style}
      />
    );
  }

  const [from, to] = getAvatarGradient(userId);
  const label = computeInitials(firstname, lastname, "?");

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        ...style,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {label}
    </span>
  );
}
