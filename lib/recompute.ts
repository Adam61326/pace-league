import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCountryScores, computeWeeklyScores, getWeekBounds, toDateString } from "@/lib/scoring";
import { computeTierCohortsForWeek } from "@/lib/tiers";

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
}

// Recalcule weekly_scores, country_scores (déprécié Sprint 13, conservé pour
// ne pas perdre l'historique si les ligues par pays reviennent un jour) et
// les cohortes de paliers pour les RECOMPUTE_WEEKS dernières semaines,
// de la plus ancienne à la plus récente (important pour les cohortes : un
// mouvement de palier appliqué sur une semaine ancienne doit être visible
// avant de calculer la cohorte de la semaine suivante).
//
// Utilisée par le cron nocturne (app/api/cron/compute-scores) et par le
// rattrapage déclenché à la reconnexion Strava (app/api/strava/callback).
export async function recomputeRecentWeeks(
  admin: SupabaseClient,
  weeks: number = RECOMPUTE_WEEKS
): Promise<RecomputedWeek[]> {
  const { weekStart: currentWeekStart } = getWeekBounds();
  const now = new Date();

  const recomputedWeeks: RecomputedWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const reference = new Date(currentWeekStart);
    reference.setUTCDate(reference.getUTCDate() - i * 7);
    const { weekStart, weekEnd } = getWeekBounds(reference);

    const weeklyResult = await computeWeeklyScores(admin, weekStart, weekEnd);
    const countryResult = await computeCountryScores(admin, weekStart, weekEnd);
    const tierResult = await computeTierCohortsForWeek(admin, weekStart, weekEnd, now);

    recomputedWeeks.push({
      weekStart: toDateString(weekStart),
      weeklyResult,
      countryResult,
      tierResult,
    });
  }

  return recomputedWeeks;
}
