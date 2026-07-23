import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCumulativeBadges, checkWeeklyPerformanceBadges } from "@/lib/badges";
import { archiveHallOfFameForWeek } from "@/lib/hall-of-fame";
import { computeCountryScores, computeWeeklyScores, getWeekBounds, toDateString } from "@/lib/scoring";
import { checkSeasonCompletion } from "@/lib/seasons";
import { computeTierCohortsForWeek } from "@/lib/tiers";
import { checkAndAwardTitles } from "@/lib/titles";

// getWeekBounds() sans argument résout toujours "la semaine de maintenant" :
// une activité qui arrive en retard sur sa semaine (backfill, resynchro
// Strava tardive...) n'était donc jamais recalculée après coup. On recalcule
// les RECOMPUTE_WEEKS dernières semaines à chaque appel plutôt qu'une seule :
// idempotent pour weekly_scores/country_scores (upsert), et pour les
// cohortes de paliers une semaine déjà figée (movements_applied=true) est
// simplement ignorée (cf. lib/tiers.ts computeTierCohortsForWeek).
const RECOMPUTE_WEEKS = 4;

export interface RecomputedWeek {
  weekStart: string;
  weeklyResult: Awaited<ReturnType<typeof computeWeeklyScores>>;
  countryResult: Awaited<ReturnType<typeof computeCountryScores>>;
  tierResult: Awaited<ReturnType<typeof computeTierCohortsForWeek>>;
  hallOfFameResult: Awaited<ReturnType<typeof archiveHallOfFameForWeek>>;
}

// Recalcule saisons/weekly_scores/country_scores/cohortes/Hall of
// Fame/badges/titres pour les RECOMPUTE_WEEKS dernières semaines, de la plus
// ancienne à la plus récente (important pour les cohortes : un mouvement de
// palier appliqué sur une semaine ancienne doit être visible avant de
// calculer la cohorte de la semaine suivante).
//
// Utilisée par le cron nocturne (app/api/cron/compute-scores) et par le
// rattrapage déclenché à la reconnexion Strava (app/api/strava/callback).
export async function recomputeRecentWeeks(
  admin: SupabaseClient,
  weeks: number = RECOMPUTE_WEEKS
): Promise<RecomputedWeek[]> {
  // Clôture de saison (Sprint 15) : doit s'exécuter avant la boucle
  // hebdomadaire, pour qu'une saison tout juste créée soit déjà active pour
  // le calcul de country_scores de la semaine en cours.
  await checkSeasonCompletion(admin);

  const { weekStart: currentWeekStart } = getWeekBounds();
  const now = new Date();

  const recomputedWeeks: RecomputedWeek[] = [];
  const activeUserIds = new Set<string>();

  for (let i = weeks - 1; i >= 0; i--) {
    const reference = new Date(currentWeekStart);
    reference.setUTCDate(reference.getUTCDate() - i * 7);
    const { weekStart, weekEnd } = getWeekBounds(reference);
    const weekStartStr = toDateString(weekStart);

    const weeklyResult = await computeWeeklyScores(admin, weekStart, weekEnd);
    const countryResult = await computeCountryScores(admin, weekStart, weekEnd);
    const tierResult = await computeTierCohortsForWeek(admin, weekStart, weekEnd, now);
    await checkWeeklyPerformanceBadges(admin, weekStartStr);
    const hallOfFameResult = await archiveHallOfFameForWeek(admin, weekStartStr, weekEnd, now);

    const { data: weekUsers } = await admin
      .from("weekly_scores")
      .select("user_id")
      .eq("week_start_date", weekStartStr)
      .gt("total_points", 0);
    for (const row of weekUsers ?? []) activeUserIds.add(row.user_id);

    recomputedWeeks.push({
      weekStart: weekStartStr,
      weeklyResult,
      countryResult,
      tierResult,
      hallOfFameResult,
    });
  }

  // Badges/titres cumulatifs : vérifiés une seule fois pour l'ensemble des
  // utilisateurs actifs sur toute la fenêtre recalculée, plutôt qu'à chaque
  // semaine (un total all-time ne dépend pas de la semaine).
  const activeUserIdsArray = Array.from(activeUserIds);
  await checkCumulativeBadges(admin, activeUserIdsArray);
  await checkAndAwardTitles(admin, activeUserIdsArray);

  return recomputedWeeks;
}
