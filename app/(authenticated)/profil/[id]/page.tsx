import { Avatar } from "@/components/avatar";
import { PerformanceRadar } from "@/components/performance-radar";
import { TierBadge } from "@/components/tier-badge";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { getPublicProfileData } from "@/lib/profile-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TIER_META } from "@/lib/tiers";
import { notFound, redirect } from "next/navigation";

const CATEGORY_LABELS: Record<string, string> = {
  distance: "Distance",
  dplus: "Dénivelé (D+)",
  regularity: "Régularité",
  performance: "Performance",
};

const CATEGORY_ORDER = ["distance", "dplus", "regularity", "performance"];

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

// Profil public (Sprint 16) : visible par tout utilisateur connecté à
// PaceLeague, pas seulement le propriétaire du profil — proxy.ts protège ce
// chemin (redirige vers /login si non connecté), même modèle que
// /dashboard, /ligues, etc. Périmètre volontairement limité aux stats
// hebdomadaires et aux badges : ni trophées de saison ni titres ici (voir
// CLAUDE.md Sprint 16).
export default async function ProfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/profil/${id}`);
  }

  const admin = createAdminClient();
  const profile = await getPublicProfileData(admin, id);

  if (!profile) notFound();

  const name = formatDisplayName(profile.user.displayName, profile.user.firstname, profile.user.lastname);
  const tierMeta = TIER_META[profile.tier];

  const badgesByCategory = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    items: profile.badges.filter((b) => b.category === category),
  })).filter((c) => c.items.length > 0);

  const statTiles = [
    { label: "Distance", value: `${profile.weekly.totalKm.toFixed(1)} km` },
    { label: "D+", value: `${Math.round(profile.weekly.totalDplus)} m` },
    { label: "Sorties", value: String(profile.weekly.totalRuns) },
    { label: "Allure moy.", value: formatPace(profile.weekly.avgPaceSecPerKm) },
  ];

  return (
    <div className="flex flex-1 flex-col items-center gap-10 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-wrap items-center gap-6">
          <Avatar
            userId={profile.user.id}
            photoUrl={profile.user.photoUrl}
            firstname={profile.user.firstname}
            lastname={profile.user.lastname}
            size={80}
          />
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
            <div className="flex items-center gap-2 text-sm text-foreground-secondary">
              <span aria-hidden>{getCountryFlag(profile.user.countryCode)}</span>
              <span className={tierMeta.colorClass}>{tierMeta.label}</span>
            </div>
          </div>
          <TierBadge tier={profile.tier} size={72} />
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Cette semaine</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statTiles.map((tile) => (
              <div key={tile.label} className="flex flex-col gap-2 rounded-[10px] border border-border p-4">
                <span className="font-mono text-lg font-semibold tracking-tight text-foreground">{tile.value}</span>
                <span className="text-xs text-foreground-secondary">{tile.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Performance</h2>
          <div className="flex justify-center">
            <PerformanceRadar axes={profile.performanceAxes} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Badges</h2>
          {badgesByCategory.length === 0 ? (
            <p className="text-sm text-foreground-secondary">Pas encore de badge débloqué.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {badgesByCategory.map((cat) => (
                <div key={cat.category} className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">{cat.label}</h3>
                  <div className="flex flex-wrap gap-2">
                    {cat.items.map((badge) => (
                      <span
                        key={badge.key}
                        className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-foreground"
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
