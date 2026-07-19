import type { SupabaseClient } from "@supabase/supabase-js";

// Barème Sprint 3 (précisé explicitement par le produit, remplace le
// brouillon "Logique de scoring" du CLAUDE.md pour ce qui est implémenté ici).
export const MIN_VALID_DISTANCE_KM = 1.5; // filtre anti-spam
const DISTANCE_POINTS_PER_KM = 2;
const MAX_DAILY_DISTANCE_KM = 40;
const ELEVATION_POINTS_PER_METERS = 20; // 1 point / tranche de 20m
const MAX_DAILY_ELEVATION_M = 1500;
const PARTICIPATION_FIRST = 10;
const PARTICIPATION_SECOND = 5;
const REGULARITY_3_DAYS = 30;
const REGULARITY_5_DAYS = 60;

export interface ScoredActivity {
  activity_date: string; // 'YYYY-MM-DD'
  distance_km: number | null;
  total_elevation_gain: number | null;
}

export interface WeeklyScoreResult {
  base_points: number;
  distance_points: number;
  dplus_points: number;
  progression_bonus: number;
  regularity_bonus: number;
  total_points: number;
}

export interface DayScore {
  distance_points: number;
  dplus_points: number;
  participation_points: number;
  total_points: number;
}

// Une activité sous ce seuil n'est jamais prise en compte dans le score
// (anti-spam), qu'elle soit seule ou groupée avec d'autres le même jour.
export function isActivityScorable(activity: { distance_km: number | null }): boolean {
  return (activity.distance_km ?? 0) >= MIN_VALID_DISTANCE_KM;
}

// Score d'une seule journée à partir de ses activités déjà filtrées
// (isActivityScorable) : le calcul est plafonné au niveau du jour, pas de
// l'activité individuelle (une sortie de 30km et une de 15km le même jour
// comptent ensemble pour 40km max, pas 40+15).
export function computeDayScore(dayActivities: ScoredActivity[]): DayScore {
  const dailyDistanceKm = dayActivities.reduce((sum, a) => sum + (a.distance_km ?? 0), 0);
  const dailyElevationM = dayActivities.reduce(
    (sum, a) => sum + (a.total_elevation_gain ?? 0),
    0
  );

  const distance_points = DISTANCE_POINTS_PER_KM * Math.min(dailyDistanceKm, MAX_DAILY_DISTANCE_KM);
  const dplus_points = Math.floor(
    Math.min(dailyElevationM, MAX_DAILY_ELEVATION_M) / ELEVATION_POINTS_PER_METERS
  );
  const participation_points =
    dayActivities.length >= 2
      ? PARTICIPATION_FIRST + PARTICIPATION_SECOND
      : dayActivities.length === 1
        ? PARTICIPATION_FIRST
        : 0;

  return {
    distance_points,
    dplus_points,
    participation_points,
    total_points: distance_points + dplus_points + participation_points,
  };
}

// Score hebdomadaire d'un utilisateur à partir de ses activités de la
// semaine (déjà filtrées GPS/vitesse par le webhook). progression_bonus
// reste à 0 : le bonus de progression individuelle n'est pas encore implémenté.
export function computeUserWeeklyScore(activities: ScoredActivity[]): WeeklyScoreResult {
  const byDay = new Map<string, ScoredActivity[]>();

  for (const activity of activities) {
    if (!isActivityScorable(activity)) continue;

    const day = byDay.get(activity.activity_date) ?? [];
    day.push(activity);
    byDay.set(activity.activity_date, day);
  }

  let base_points = 0;
  let distance_points = 0;
  let dplus_points = 0;

  for (const dayActivities of byDay.values()) {
    const day = computeDayScore(dayActivities);
    distance_points += day.distance_points;
    dplus_points += day.dplus_points;
    base_points += day.total_points;
  }

  const distinctActiveDays = byDay.size;
  const regularity_bonus =
    distinctActiveDays >= 5 ? REGULARITY_5_DAYS : distinctActiveDays >= 3 ? REGULARITY_3_DAYS : 0;

  const progression_bonus = 0;

  return {
    base_points,
    distance_points,
    dplus_points,
    progression_bonus,
    regularity_bonus,
    total_points: base_points + progression_bonus + regularity_bonus,
  };
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Round = 1 semaine, lundi 00:00:00 UTC -> dimanche 23:59:59.999 UTC (CLAUDE.md).
export function getWeekBounds(reference: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const utcDay = reference.getUTCDay(); // 0 = dimanche
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;

  const weekStart = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())
  );
  weekStart.setUTCDate(weekStart.getUTCDate() + diffToMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

// Calcule et persiste le score hebdomadaire de chaque utilisateur ayant au
// moins une activité dans [weekStart, weekEnd]. Idempotent (upsert sur
// user_id + week_start_date) : peut être rejoué à chaque exécution du cron.
export async function computeWeeklyScores(
  admin: SupabaseClient,
  weekStart: Date,
  weekEnd: Date
): Promise<{ usersProcessed: number }> {
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekEnd);

  const { data: activities, error } = await admin
    .from("activities")
    .select("user_id, activity_date, distance_km, total_elevation_gain")
    .gte("activity_date", weekStartStr)
    .lte("activity_date", weekEndStr);

  if (error) throw error;

  const byUser = new Map<string, ScoredActivity[]>();
  for (const row of activities ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const rows = Array.from(byUser.entries()).map(([user_id, userActivities]) => {
    const score = computeUserWeeklyScore(userActivities);
    return {
      user_id,
      week_start_date: weekStartStr,
      base_points: score.base_points,
      distance_points: score.distance_points,
      dplus_points: score.dplus_points,
      progression_bonus: score.progression_bonus,
      regularity_bonus: score.regularity_bonus,
      total_points: score.total_points,
    };
  });

  if (rows.length === 0) return { usersProcessed: 0 };

  const { error: upsertError } = await admin
    .from("weekly_scores")
    .upsert(rows, { onConflict: "user_id,week_start_date" });

  if (upsertError) throw upsertError;

  return { usersProcessed: rows.length };
}

interface CountryScoreRow {
  country_code: string;
  season_id: string;
  week_start_date: string;
  total_points: number;
  active_runners_count: number;
  division: "A" | "B" | "C";
}

// Agrège les weekly_scores par pays et détermine la division en fonction du
// nombre de coureurs actifs sur les 4 dernières semaines glissantes
// (CLAUDE.md). Nécessite une saison au statut "active" couvrant la semaine ;
// sans elle, l'agrégation est ignorée (aucune table de gestion des saisons
// n'existe encore côté produit).
export async function computeCountryScores(
  admin: SupabaseClient,
  weekStart: Date,
  weekEnd: Date
): Promise<{ countriesProcessed: number; skipped?: string }> {
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekEnd);

  const { data: season, error: seasonError } = await admin
    .from("seasons")
    .select("id")
    .eq("status", "active")
    .lte("start_date", weekStartStr)
    .gte("end_date", weekStartStr)
    .maybeSingle();

  if (seasonError) throw seasonError;

  if (!season) {
    return { countriesProcessed: 0, skipped: "no_active_season" };
  }

  const totalsByCountry = new Map<string, number>();
  {
    const { data: weeklyRows, error } = await admin
      .from("weekly_scores")
      .select("total_points, users(country_code)")
      .eq("week_start_date", weekStartStr);

    if (error) throw error;

    for (const row of weeklyRows ?? []) {
      const countryCode = extractCountryCode(row.users);
      if (!countryCode) continue;
      totalsByCountry.set(
        countryCode,
        (totalsByCountry.get(countryCode) ?? 0) + Number(row.total_points)
      );
    }
  }

  const activeUsersByCountry = new Map<string, Set<string>>();
  {
    const fourWeekStart = new Date(weekStart);
    fourWeekStart.setUTCDate(fourWeekStart.getUTCDate() - 21);

    const { data: activeRows, error } = await admin
      .from("activities")
      .select("user_id, users(country_code)")
      .gte("activity_date", toDateString(fourWeekStart))
      .lte("activity_date", weekEndStr);

    if (error) throw error;

    for (const row of activeRows ?? []) {
      const countryCode = extractCountryCode(row.users);
      if (!countryCode) continue;
      const set = activeUsersByCountry.get(countryCode) ?? new Set<string>();
      set.add(row.user_id);
      activeUsersByCountry.set(countryCode, set);
    }
  }

  const countryCodes = new Set([...totalsByCountry.keys(), ...activeUsersByCountry.keys()]);

  const rows: CountryScoreRow[] = Array.from(countryCodes).map((countryCode) => {
    const activeRunnersCount = activeUsersByCountry.get(countryCode)?.size ?? 0;
    return {
      country_code: countryCode,
      season_id: season.id,
      week_start_date: weekStartStr,
      total_points: totalsByCountry.get(countryCode) ?? 0,
      active_runners_count: activeRunnersCount,
      division: activeRunnersCount >= 200 ? "A" : activeRunnersCount >= 50 ? "B" : "C",
    };
  });

  if (rows.length === 0) return { countriesProcessed: 0 };

  const { error: upsertError } = await admin
    .from("country_scores")
    .upsert(rows, { onConflict: "country_code,season_id,week_start_date" });

  if (upsertError) throw upsertError;

  return { countriesProcessed: rows.length };
}

// La relation users peut être renvoyée comme objet (belongs-to) ou tableau
// selon l'inférence PostgREST ; on gère les deux formes défensivement.
function extractCountryCode(users: unknown): string | null {
  if (!users) return null;
  if (Array.isArray(users)) {
    return (users[0] as { country_code?: string } | undefined)?.country_code ?? null;
  }
  return (users as { country_code?: string }).country_code ?? null;
}
