import { TierBadge } from "@/components/tier-badge";
import { createClient } from "@/lib/supabase/server";
import { TIER_META, type Tier } from "@/lib/tiers";
import { IconTrophy } from "@tabler/icons-react";
import { redirect } from "next/navigation";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface SeasonTrophyRow {
  best_tier_reached: Tier;
  seasons: { season_number: number; start_date: string; end_date: string } | { season_number: number; start_date: string; end_date: string }[] | null;
}

// Historique de saisons (Sprint 17) : meilleur palier atteint par saison
// passee (season_trophies, archive definitivement a la cloture de chaque
// saison de 12 semaines — voir lib/seasons.ts checkSeasonCompletion). Le
// palier courant, lui, ne reset jamais (player_tiers) : ceci n'est qu'un
// instantane, pas un doublon d'/mes-activites.
export default async function HistoriquePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/historique");
  }

  const [{ data: activeSeason }, { data: playerTier }, { data: trophyRows }] = await Promise.all([
    supabase.from("seasons").select("season_number, start_date, end_date").eq("status", "active").maybeSingle(),
    supabase.from("player_tiers").select("tier, best_tier_this_season").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("season_trophies")
      .select("best_tier_reached, seasons(season_number, start_date, end_date)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<SeasonTrophyRow[]>(),
  ]);

  const pastTrophies = (trophyRows ?? []).map((row) => {
    const season = Array.isArray(row.seasons) ? row.seasons[0] : row.seasons;
    return {
      seasonNumber: season?.season_number ?? null,
      startDate: season?.start_date ?? null,
      endDate: season?.end_date ?? null,
      tier: row.best_tier_reached,
    };
  });

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Historique</h1>
          <p className="text-sm text-foreground-secondary">Meilleur palier atteint, saison après saison.</p>
        </div>

        {activeSeason && playerTier && (
          <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-6">
            <TierBadge tier={playerTier.best_tier_this_season as Tier} size={64} />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wide text-foreground-secondary uppercase">
                Saison {activeSeason.season_number} — en cours
              </span>
              <span className={`font-display text-lg font-semibold ${TIER_META[playerTier.best_tier_this_season as Tier].colorClass}`}>
                {TIER_META[playerTier.best_tier_this_season as Tier].label}
              </span>
              <span className="text-xs text-foreground-tertiary">
                {formatDate(activeSeason.start_date)} → {formatDate(activeSeason.end_date)}
              </span>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
            <IconTrophy size={16} stroke={1.75} />
            Saisons passées
          </h2>
          {pastTrophies.length === 0 ? (
            <p className="text-sm text-foreground-secondary">
              Pas encore de saison terminée — reviens à la fin de la saison en cours.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border">
              {pastTrophies.map((trophy, index) => {
                const meta = TIER_META[trophy.tier];
                return (
                  <li key={index} className="flex items-center gap-4 px-4 py-3">
                    <TierBadge tier={trophy.tier} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        {trophy.seasonNumber != null ? `Saison ${trophy.seasonNumber}` : "Saison"}
                      </p>
                      {trophy.startDate && trophy.endDate && (
                        <p className="text-xs text-foreground-tertiary">
                          {formatDate(trophy.startDate)} → {formatDate(trophy.endDate)}
                        </p>
                      )}
                    </div>
                    <span className={`text-sm font-semibold ${meta.colorClass}`}>{meta.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
