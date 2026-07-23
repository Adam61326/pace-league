import type { SupabaseClient } from "@supabase/supabase-js";
import { isActivityScorable, MIN_VALID_DISTANCE_KM } from "@/lib/scoring";
import { getStreaks } from "@/lib/streak";
import { MIN_COHORT_SIZE_FOR_MOVEMENT } from "@/lib/tiers";

interface BadgeThreshold {
  key: string;
  threshold: number;
}

export const DISTANCE_BADGES: BadgeThreshold[] = [
  { key: "distance_5km", threshold: 5 },
  { key: "distance_10km", threshold: 10 },
  { key: "distance_21km", threshold: 21.1 },
  { key: "distance_42km", threshold: 42.2 },
  { key: "distance_100km", threshold: 100 },
  { key: "distance_500km", threshold: 500 },
  { key: "distance_1000km", threshold: 1000 },
  { key: "distance_5000km", threshold: 5000 },
  { key: "distance_10000km", threshold: 10000 },
];

export const DPLUS_BADGES: BadgeThreshold[] = [
  { key: "dplus_1000m", threshold: 1000 },
  { key: "dplus_5000m", threshold: 5000 },
  { key: "dplus_10000m", threshold: 10000 },
  { key: "dplus_50000m", threshold: 50000 },
  { key: "dplus_100000m", threshold: 100000 },
];

export const STREAK_BADGES: BadgeThreshold[] = [
  { key: "streak_7d", threshold: 7 },
  { key: "streak_30d", threshold: 30 },
  { key: "streak_100d", threshold: 100 },
  { key: "streak_365d", threshold: 365 },
];

const WORLD_RANK_THRESHOLD = 1000;
const FRANCE_TOP_THRESHOLD = 100;
const FRANCE_ELITE_THRESHOLD = 10;
const PODIUM_RANK = 3;
const PODIUM_10_THRESHOLD = 10;
const PODIUM_50_THRESHOLD = 50;

// Idempotent : upsert ignorant les doublons (unique user_id+badge_key), donc
// rejouable sans risque par le cron qui recalcule les 4 dernières semaines
// chaque nuit (lib/recompute.ts).
export async function awardBadgeIfMissing(
  admin: SupabaseClient,
  userId: string,
  badgeKey: string
): Promise<void> {
  const { error } = await admin
    .from("user_badges")
    .upsert({ user_id: userId, badge_key: badgeKey }, { onConflict: "user_id,badge_key", ignoreDuplicates: true });

  if (error) throw error;
}

function extractCountryCode(users: unknown): string | null {
  if (!users) return null;
  if (Array.isArray(users)) {
    return (users[0] as { country_code?: string } | undefined)?.country_code ?? null;
  }
  return (users as { country_code?: string }).country_code ?? null;
}

// Badges cumulatifs (distance/D+/régularité) : reflètent un total all-time,
// pas une semaine précise — vérifiés pour tous les utilisateurs actifs sur
// la période recalculée par le cron (lib/recompute.ts), pas semaine par
// semaine.
export async function checkCumulativeBadges(
  admin: SupabaseClient,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return;

  const { data: activityRows, error } = await admin
    .from("activities")
    .select("user_id, distance_km, total_elevation_gain, sport_type")
    .in("user_id", userIds)
    .gte("distance_km", MIN_VALID_DISTANCE_KM);

  if (error) throw error;

  const distanceByUser = new Map<string, number>();
  const dplusByUser = new Map<string, number>();
  for (const row of activityRows ?? []) {
    if (!isActivityScorable(row)) continue;
    distanceByUser.set(row.user_id, (distanceByUser.get(row.user_id) ?? 0) + Number(row.distance_km ?? 0));
    dplusByUser.set(
      row.user_id,
      (dplusByUser.get(row.user_id) ?? 0) + Number(row.total_elevation_gain ?? 0)
    );
  }

  const streaks = await getStreaks(admin, userIds);

  for (const userId of userIds) {
    const totalDistance = distanceByUser.get(userId) ?? 0;
    for (const badge of DISTANCE_BADGES) {
      if (totalDistance >= badge.threshold) await awardBadgeIfMissing(admin, userId, badge.key);
    }

    const totalDplus = dplusByUser.get(userId) ?? 0;
    for (const badge of DPLUS_BADGES) {
      if (totalDplus >= badge.threshold) await awardBadgeIfMissing(admin, userId, badge.key);
    }

    const streakDays = streaks.get(userId) ?? 0;
    for (const badge of STREAK_BADGES) {
      if (streakDays >= badge.threshold) await awardBadgeIfMissing(admin, userId, badge.key);
    }
  }
}

// Badges liés au classement d'une semaine précise (rang mondial/France sur
// le classement individuel existant, victoire/podiums de cohorte) :
// vérifiés une fois par semaine recalculée (lib/recompute.ts), après que
// weekly_scores et les cohortes de cette semaine ont été (re)calculés.
//
// "Victoire hebdo"/"podiums" n'est comptée que pour une cohorte d'au moins
// MIN_COHORT_SIZE_FOR_MOVEMENT joueurs actifs (même seuil que la promotion/
// relégation Sprint 13) : gagner dans une cohorte de 1 ou 2 joueurs n'est
// pas une vraie victoire.
export async function checkWeeklyPerformanceBadges(
  admin: SupabaseClient,
  weekStartStr: string
): Promise<void> {
  const { data: rankedRows, error: rankedError } = await admin
    .from("weekly_scores")
    .select("user_id, total_points, users!inner(country_code)")
    .eq("week_start_date", weekStartStr)
    .gt("total_points", 0)
    .order("total_points", { ascending: false });

  if (rankedError) throw rankedError;

  let franceRank = 0;
  for (let i = 0; i < (rankedRows ?? []).length; i++) {
    const row = rankedRows![i];
    const worldRank = i + 1;

    if (worldRank <= WORLD_RANK_THRESHOLD) {
      await awardBadgeIfMissing(admin, row.user_id, "top1000_world");
    }

    if (extractCountryCode(row.users) === "FR") {
      franceRank += 1;
      if (franceRank <= FRANCE_TOP_THRESHOLD) {
        await awardBadgeIfMissing(admin, row.user_id, "top100_france");
      }
      if (franceRank <= FRANCE_ELITE_THRESHOLD) {
        await awardBadgeIfMissing(admin, row.user_id, "top10_france");
      }
    }
  }

  const { data: podiumRows, error: podiumError } = await admin
    .from("cohort_members")
    .select("user_id, rank, tier_cohorts!inner(week_start_date, member_count)")
    .eq("tier_cohorts.week_start_date", weekStartStr)
    .gte("tier_cohorts.member_count", MIN_COHORT_SIZE_FOR_MOVEMENT)
    .lte("rank", PODIUM_RANK);

  if (podiumError) throw podiumError;

  for (const row of podiumRows ?? []) {
    if (row.rank === 1) {
      await awardBadgeIfMissing(admin, row.user_id, "weekly_win");
    }

    // Compte all-time (pas seulement cette semaine) : combien de fois cet
    // utilisateur a fini dans le top 3 d'une cohorte assez grande.
    const { count, error: countError } = await admin
      .from("cohort_members")
      .select("id, tier_cohorts!inner(member_count)", { count: "exact", head: true })
      .eq("user_id", row.user_id)
      .lte("rank", PODIUM_RANK)
      .gte("tier_cohorts.member_count", MIN_COHORT_SIZE_FOR_MOVEMENT);

    if (countError) throw countError;

    if ((count ?? 0) >= PODIUM_10_THRESHOLD) {
      await awardBadgeIfMissing(admin, row.user_id, "podium_10");
    }
    if ((count ?? 0) >= PODIUM_50_THRESHOLD) {
      await awardBadgeIfMissing(admin, row.user_id, "podium_50");
    }
  }
}
