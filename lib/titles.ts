import type { SupabaseClient } from "@supabase/supabase-js";
import { isActivityScorable, MIN_VALID_DISTANCE_KM } from "@/lib/scoring";
import {
  addDays,
  computeVitesseAxis,
  mondayOf,
  percentileOfLast,
  weekAnchors,
  type Activity,
} from "@/lib/performance";

export type TitleKey =
  | "mountain_goat"
  | "night_runner"
  | "early_bird"
  | "speed_hunter"
  | "marathon_machine";

export const TITLE_LABELS: Record<TitleKey, string> = {
  mountain_goat: "Chèvre des montagnes",
  night_runner: "Coureur nocturne",
  early_bird: "Lève-tôt",
  speed_hunter: "Chasseur de vitesse",
  marathon_machine: "Machine à marathon",
};

// Seuil "top percentile personnel" non chiffré dans le brief (Chèvre des
// montagnes / Chasseur de vitesse) : choisi par cohérence avec les autres
// pourcentages "élevés" déjà utilisés dans le produit (Sprint 12), à
// ajuster si trop permissif/restrictif en pratique.
const TITLE_PERCENTILE_THRESHOLD = 85;

// Une seule sortie nocturne isolée ne doit pas suffire à décrocher "Coureur
// nocturne"/"Lève-tôt" : minimum d'échantillon avant de calculer une
// majorité, comme MIN_WINDOW_SAMPLES pour les axes de performance.
const MIN_ACTIVITIES_FOR_TIME_TITLE = 5;

const NIGHT_HOUR_START = 21;
const NIGHT_HOUR_END = 5; // exclusif, traverse minuit
const EARLY_HOUR_START = 5;
const EARLY_HOUR_END = 7; // exclusif

const MARATHON_DISTANCE_KM = 42;
const DPLUS_WINDOW_WEEKS = 4;

interface TitleActivityRow {
  activity_date: string;
  distance_km: number | null;
  total_elevation_gain: number | null;
  moving_time_seconds: number | null;
  avg_heartrate: number | null;
  start_hour_local: number | null;
  sport_type: string | null;
}

// Idempotent : upsert ignorant les doublons (unique user_id+title_key), donc
// rejouable sans risque par le cron qui recalcule les 4 dernières semaines
// chaque nuit. Un titre déjà débloqué n'est jamais retiré, même si
// l'utilisateur ne remplit plus la condition depuis (même logique que les
// badges) : l'affichage ne montre de toute façon que le plus récent.
export async function awardTitleIfMissing(
  admin: SupabaseClient,
  userId: string,
  titleKey: TitleKey
): Promise<void> {
  const { error } = await admin
    .from("user_titles")
    .upsert({ user_id: userId, title_key: titleKey }, { onConflict: "user_id,title_key", ignoreDuplicates: true });

  if (error) throw error;
}

function computeMountainGoatPercentile(activities: Activity[]): number | null {
  const qualifying = activities.filter((a) => a.distanceKm > 0);
  if (qualifying.length === 0) return null;

  const weeks = weekAnchors(mondayOf(qualifying[0].date), mondayOf(qualifying[qualifying.length - 1].date));
  const series: number[] = [];
  for (const week of weeks) {
    const windowStart = addDays(week, -(DPLUS_WINDOW_WEEKS - 1) * 7);
    const inWindow = qualifying.filter((a) => a.date >= windowStart && a.date <= addDays(week, 6));
    if (inWindow.length === 0) continue;
    const totalDist = inWindow.reduce((sum, a) => sum + a.distanceKm, 0);
    const totalDplus = inWindow.reduce((sum, a) => sum + a.elevationGainM, 0);
    if (totalDist > 0) series.push(totalDplus / totalDist);
  }

  return percentileOfLast(series, true);
}

// Calcule et attribue les titres (CLAUDE.md Sprint 15) pour un lot
// d'utilisateurs actifs, à partir des seules données déjà en base (aucune
// nouvelle collecte). Ne considère que les activités scorables (Run/
// TrailRun, cf. lib/scoring.ts) : une sortie vélo ne doit pas influencer
// "Chèvre des montagnes" ni "Chasseur de vitesse", ni compter pour "Machine
// à marathon".
export async function checkAndAwardTitles(admin: SupabaseClient, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  const { data: rows, error } = await admin
    .from("activities")
    .select(
      "user_id, activity_date, distance_km, total_elevation_gain, moving_time_seconds, avg_heartrate, start_hour_local, sport_type"
    )
    .in("user_id", userIds)
    .gte("distance_km", MIN_VALID_DISTANCE_KM)
    .returns<(TitleActivityRow & { user_id: string })[]>();

  if (error) throw error;

  const byUser = new Map<string, TitleActivityRow[]>();
  for (const row of rows ?? []) {
    if (!isActivityScorable(row)) continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  for (const userId of userIds) {
    const userRows = byUser.get(userId) ?? [];
    if (userRows.length === 0) continue;

    if (userRows.some((r) => Number(r.distance_km ?? 0) >= MARATHON_DISTANCE_KM)) {
      await awardTitleIfMissing(admin, userId, "marathon_machine");
    }

    const activities: Activity[] = userRows
      .map((r) => ({
        date: r.activity_date,
        distanceKm: Number(r.distance_km ?? 0),
        movingTimeSeconds: r.moving_time_seconds ?? 0,
        elevationGainM: Number(r.total_elevation_gain ?? 0),
        avgHeartrate: r.avg_heartrate != null ? Number(r.avg_heartrate) : null,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const mountainPercentile = computeMountainGoatPercentile(activities);
    if (mountainPercentile != null && mountainPercentile >= TITLE_PERCENTILE_THRESHOLD) {
      await awardTitleIfMissing(admin, userId, "mountain_goat");
    }

    const vitesseAxis = computeVitesseAxis(activities.filter((a) => a.movingTimeSeconds > 0));
    if (vitesseAxis.percentile != null && vitesseAxis.percentile >= TITLE_PERCENTILE_THRESHOLD) {
      await awardTitleIfMissing(admin, userId, "speed_hunter");
    }

    const hours = userRows.map((r) => r.start_hour_local).filter((h): h is number => h != null);
    if (hours.length >= MIN_ACTIVITIES_FOR_TIME_TITLE) {
      const nightCount = hours.filter((h) => h >= NIGHT_HOUR_START || h < NIGHT_HOUR_END).length;
      const earlyCount = hours.filter((h) => h >= EARLY_HOUR_START && h < EARLY_HOUR_END).length;

      if (nightCount / hours.length > 0.5) await awardTitleIfMissing(admin, userId, "night_runner");
      if (earlyCount / hours.length > 0.5) await awardTitleIfMissing(admin, userId, "early_bird");
    }
  }
}

export interface DisplayTitle {
  key: TitleKey;
  label: string;
}

// Le titre le plus récemment débloqué par utilisateur, pour affichage
// partout où le nom s'affiche déjà (classement, cohorte, ligues privées).
// Publiquement lisible (comme country_scores/tier_cohorts) : contrairement
// aux badges, un titre est une donnée compétitive/sociale affichée aux autres.
export async function getDisplayTitles(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, DisplayTitle>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await admin
    .from("user_titles")
    .select("user_id, title_key, earned_at")
    .in("user_id", userIds)
    .order("earned_at", { ascending: false });

  if (error) throw error;

  const result = new Map<string, DisplayTitle>();
  for (const row of data ?? []) {
    if (result.has(row.user_id)) continue; // déjà le plus récent (tri desc)
    const key = row.title_key as TitleKey;
    result.set(row.user_id, { key, label: TITLE_LABELS[key] ?? key });
  }
  return result;
}
