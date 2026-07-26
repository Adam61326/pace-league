import { TIER_META, type Tier } from "@/lib/tiers";
import { IconCrown, IconCrownFilled, IconDiamondFilled, IconMedal } from "@tabler/icons-react";

function TierIcon({ tier, size, className }: { tier: Tier; size: number; className?: string }) {
  if (tier === "legend") return <IconCrownFilled size={size} className={className} />;
  if (tier === "master") return <IconCrown size={size} className={className} />;
  if (tier === "diamond") return <IconDiamondFilled size={size} className={className} />;
  return <IconMedal size={size} className={className} />;
}

// Badge de palier rond (icône + couleur par palier, CLAUDE.md Sprint 13),
// extrait de /ligues (Sprint 16) pour être réutilisé sur la page profil
// publique. Volontairement rond ici (pas l'hexagone de la maquette d'import :
// pas de composant clip-path existant dans l'app, un simple rond suffit et
// reste cohérent avec le reste de l'UI).
export function TierBadge({ tier, size = 48 }: { tier: Tier; size?: number }) {
  const meta = TIER_META[tier];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${meta.bgClass}`}
      style={{ width: size, height: size }}
    >
      <TierIcon tier={tier} size={Math.round(size * 0.5)} className={meta.colorClass} />
    </span>
  );
}
