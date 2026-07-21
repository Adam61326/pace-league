import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCumulativeBadges, checkWeeklyPerformanceBadges } from "@/lib/badges";
import { archiveHallOfFameForWeek } from "@/lib/hall-of-fame";
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
  hallOfFameResult: Awaited<ReturnType<typeof archiveHallOfFameForWeek>>;
}

// Recalcule weekly_scores, country_scores (déprécié Sprint 13, conservé pour
// ne pas perdre l'historique si les ligues par pays reviennent un jour), les
// cohortes de paliers, le Hall of Fame et les badges (Sprint 14) pour les
// RECOMPUTE_WEEKS dernières semaines, de la plus ancienne à la plus récente
// (important pour les cohortes : un mouvement de palier appliqué sur une
// semaine ancienne doit être visible avant de calculer la cohorte de la
// semaine suivante).
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

  // Badges cumulatifs (distance/D+/régularité) : vérifiés une seule fois pour
  // l'ensemble des utilisateurs actifs sur toute la fenêtre recalculée,
  // plutôt que 4 fois (un total all-time ne dépend pas de la semaine).
  await checkCumulativeBadges(admin, Array.from(activeUserIds));

  return recomputedWeeks;
}
