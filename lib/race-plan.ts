import type { SupabaseClient } from "@supabase/supabase-js";
import type { SplitElevation } from "@/lib/gpx";

// Distance d'un lap "plein" par défaut si aucune n'est choisie (voir
// SPLIT_DISTANCE_PRESETS) — anciennement une constante fixe non
// personnalisable, généralisée en paramètre pour le sélecteur "Splits par".
export const LAP_DISTANCE_KM = 1;

export const SPLIT_DISTANCE_PRESETS = [1, 2, 5, 10] as const;

export type PaceStrategy = "positive" | "even" | "negative";

export interface DistancePreset {
  key: string;
  label: string;
  distanceKm: number | null; // null = saisie libre (Trail / Autre)
}

// Ordre imposé par CLAUDE.md "UI — SÉLECTEUR DE DISTANCE".
export const DISTANCE_PRESETS: DistancePreset[] = [
  { key: "5k", label: "5 km", distanceKm: 5 },
  { key: "10k", label: "10 km", distanceKm: 10 },
  { key: "half_marathon", label: "Semi-marathon (21,1 km)", distanceKm: 21.1 },
  { key: "marathon", label: "Marathon (42,195 km)", distanceKm: 42.195 },
  { key: "10mi", label: "10 miles (16,09 km)", distanceKm: 16.09 },
  { key: "trail", label: "Trail", distanceKm: null },
  { key: "other", label: "Autre", distanceKm: null },
];

// Dérive totale (premier → dernier split), en % de l'allure moyenne demandée
// — pic-à-pic (ex: 10% => premier split à -5%, dernier à +5% pour la
// stratégie "positive"). Valeur par défaut raisonnable non spécifiée dans la
// demande d'origine (contrairement au relief, voir ci-dessous) : à ajuster
// si le retour terrain la juge trop marquée ou trop plate.
const STRATEGY_SWING_PCT = 10;

// Ajustement relief — formule confirmée explicitement avant implémentation
// (voir échange de validation) : pénalité montée ~2.3x plus forte que le
// bonus descente, en % de l'allure plutôt qu'en secondes fixes pour rester
// proportionné à tous les niveaux. Plafond de pente pour ne pas laisser un
// pic GPS erroné dans le GPX produire une allure aberrante sur un split.
const RELIEF_K_UP_PCT_PER_GRADE_PCT = 3.5;
const RELIEF_K_DOWN_PCT_PER_GRADE_PCT = 1.5;
const RELIEF_MAX_GRADE_PCT = 15;

export interface RacePlanSplit {
  lapNumber: number;
  distanceKm: number;
  targetPaceSecPerKm: number;
  isFinishLap: boolean;
  elevationGainM: number | null;
  elevationLossM: number | null;
}

export interface RacePlan {
  id: string;
  raceId: string;
  userId: string;
  raceName: string | null;
  raceDate: string | null;
  distanceKm: number;
  targetPaceSecPerKm: number;
  elevationGainM: number | null;
  elevationLossM: number | null;
  paceStrategy: PaceStrategy;
  gpxFilename: string | null;
  splitDistanceKm: number;
}

export interface RaceSummary {
  id: string;
  name: string;
  raceDate: string | null;
  distanceKm: number;
  isActive: boolean;
  hasPlan: boolean;
}

function computeSplitDistances(distanceKm: number, splitDistanceKm: number): { distanceKm: number; isFinishLap: boolean }[] {
  const fullLaps = Math.floor(distanceKm / splitDistanceKm);
  const remainderKm = Math.round((distanceKm - fullLaps * splitDistanceKm) * 1000) / 1000;

  const laps: { distanceKm: number; isFinishLap: boolean }[] = [];
  for (let i = 0; i < fullLaps; i++) {
    laps.push({ distanceKm: splitDistanceKm, isFinishLap: false });
  }
  if (remainderKm > 0.001) {
    laps.push({ distanceKm: remainderKm, isFinishLap: true });
  }
  return laps;
}

function computeStrategyDeltaSecPerKm(basePaceSecPerKm: number, strategy: PaceStrategy, index: number, total: number): number {
  if (strategy === "even" || total <= 1) return 0;
  const swingSecPerKm = basePaceSecPerKm * (STRATEGY_SWING_PCT / 100);
  const t = index / (total - 1); // 0 (premier split) .. 1 (dernier split)
  const linear = t - 0.5; // -0.5 .. 0.5
  const sign = strategy === "positive" ? 1 : -1;
  return sign * linear * swingSecPerKm;
}

function computeReliefDeltaSecPerKm(basePaceSecPerKm: number, splitDistanceKm: number, elevation: SplitElevation): number {
  const distanceM = splitDistanceKm * 1000;
  if (distanceM <= 0) return 0;
  const gradeUpPct = Math.min(RELIEF_MAX_GRADE_PCT, (elevation.elevationGainM / distanceM) * 100);
  const gradeDownPct = Math.min(RELIEF_MAX_GRADE_PCT, (elevation.elevationLossM / distanceM) * 100);
  return (
    basePaceSecPerKm *
    ((RELIEF_K_UP_PCT_PER_GRADE_PCT / 100) * gradeUpPct - (RELIEF_K_DOWN_PCT_PER_GRADE_PCT / 100) * gradeDownPct)
  );
}

// Découpe une distance totale en splits de `splitDistanceKm` + un éventuel
// split d'arrivée (distance restante), et calcule l'allure cible de chaque
// split = allure moyenne demandée + ajustement stratégie (dérive linéaire) +
// ajustement relief (si D+/D- fournis, voir lib/gpx.ts) — voir CLAUDE.md
// "RÈGLE DE COMBINAISON STRATÉGIE + RELIEF".
export function computeRacePlanSplits(
  distanceKm: number,
  targetPaceSecPerKm: number,
  options: {
    splitDistanceKm?: number;
    paceStrategy?: PaceStrategy;
    splitElevations?: (SplitElevation | null)[];
  } = {}
): RacePlanSplit[] {
  const splitDistanceKm = options.splitDistanceKm ?? LAP_DISTANCE_KM;
  const paceStrategy = options.paceStrategy ?? "even";
  const laps = computeSplitDistances(distanceKm, splitDistanceKm);

  return laps.map((lap, index) => {
    const strategyDelta = computeStrategyDeltaSecPerKm(targetPaceSecPerKm, paceStrategy, index, laps.length);
    const elevation = options.splitElevations?.[index] ?? null;
    const reliefDelta = elevation ? computeReliefDeltaSecPerKm(targetPaceSecPerKm, lap.distanceKm, elevation) : 0;

    return {
      lapNumber: index + 1,
      distanceKm: lap.distanceKm,
      targetPaceSecPerKm: Math.round(targetPaceSecPerKm + strategyDelta + reliefDelta),
      isFinishLap: lap.isFinishLap,
      elevationGainM: elevation?.elevationGainM ?? null,
      elevationLossM: elevation?.elevationLossM ?? null,
    };
  });
}

interface RacePlanRow {
  id: string;
  race_id: string;
  user_id: string;
  race_name: string | null;
  race_date: string | null;
  distance_km: number;
  target_pace_sec_per_km: number;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  pace_strategy: PaceStrategy;
  gpx_filename: string | null;
  split_distance_km: number;
  races: { name: string; race_date: string | null } | null;
}

interface RacePlanSplitRow {
  lap_number: number;
  distance_km: number;
  target_pace_sec_per_km: number;
  is_finish_lap: boolean;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
}

interface RaceRow {
  id: string;
  name: string;
  race_date: string | null;
  distance_km: number;
  is_active: boolean;
}

// races(name, race_date) : la course référencée est la source canonique du
// nom/date affichés (ex: nom du workout dans le TCX exporté) — race_plans
// garde race_name/race_date en colonnes vestigiales pour compat avec les
// plans migrés depuis le sprint précédent (20260802000000), mais aucune
// écriture n'y passe plus (voir app/api/course-plan/route.ts).
const RACE_PLAN_COLUMNS =
  "id, race_id, user_id, race_name, race_date, distance_km, target_pace_sec_per_km, elevation_gain_m, elevation_loss_m, pace_strategy, gpx_filename, split_distance_km, races(name, race_date)";
const RACE_PLAN_SPLIT_COLUMNS = "lap_number, distance_km, target_pace_sec_per_km, is_finish_lap, elevation_gain_m, elevation_loss_m";

function toRacePlan(row: RacePlanRow): RacePlan {
  return {
    id: row.id,
    raceId: row.race_id,
    userId: row.user_id,
    raceName: row.races?.name ?? row.race_name,
    raceDate: row.races?.race_date ?? row.race_date,
    distanceKm: Number(row.distance_km),
    targetPaceSecPerKm: Number(row.target_pace_sec_per_km),
    elevationGainM: row.elevation_gain_m != null ? Number(row.elevation_gain_m) : null,
    elevationLossM: row.elevation_loss_m != null ? Number(row.elevation_loss_m) : null,
    paceStrategy: row.pace_strategy,
    gpxFilename: row.gpx_filename,
    splitDistanceKm: Number(row.split_distance_km),
  };
}

function toRacePlanSplit(row: RacePlanSplitRow): RacePlanSplit {
  return {
    lapNumber: row.lap_number,
    distanceKm: Number(row.distance_km),
    targetPaceSecPerKm: Number(row.target_pace_sec_per_km),
    isFinishLap: row.is_finish_lap,
    elevationGainM: row.elevation_gain_m != null ? Number(row.elevation_gain_m) : null,
    elevationLossM: row.elevation_loss_m != null ? Number(row.elevation_loss_m) : null,
  };
}

async function fetchSplitsForPlan(supabase: SupabaseClient, racePlanId: string): Promise<RacePlanSplit[]> {
  const { data: splitRows, error } = await supabase
    .from("race_plan_splits")
    .select(RACE_PLAN_SPLIT_COLUMNS)
    .eq("race_plan_id", racePlanId)
    .order("lap_number", { ascending: true })
    .returns<RacePlanSplitRow[]>();

  if (error) throw error;
  return (splitRows ?? []).map(toRacePlanSplit);
}

// Liste des courses d'un utilisateur pour la section "Course à préparer"
// (CLAUDE.md "UI — LISTE DE COURSES"), triée par date (ordre simple, pas de
// tri avancé demandé ce sprint). hasPlan = une ligne race_plans existe pour
// cette course (voir "état vide" dans la migration).
export async function getRacesForUser(supabase: SupabaseClient, userId: string): Promise<RaceSummary[]> {
  const { data: raceRows, error: raceError } = await supabase
    .from("races")
    .select("id, name, race_date, distance_km, is_active")
    .eq("user_id", userId)
    .order("race_date", { ascending: true, nullsFirst: false })
    .returns<RaceRow[]>();

  if (raceError) throw raceError;
  if (!raceRows || raceRows.length === 0) return [];

  const { data: planRows, error: planError } = await supabase
    .from("race_plans")
    .select("race_id")
    .in(
      "race_id",
      raceRows.map((r) => r.id)
    )
    .returns<{ race_id: string }[]>();

  if (planError) throw planError;
  const racesWithPlan = new Set((planRows ?? []).map((p) => p.race_id));

  return raceRows.map((r) => ({
    id: r.id,
    name: r.name,
    raceDate: r.race_date,
    distanceKm: Number(r.distance_km),
    isActive: r.is_active,
    hasPlan: racesWithPlan.has(r.id),
  }));
}

export async function getRaceById(supabase: SupabaseClient, raceId: string): Promise<RaceSummary | null> {
  const { data: raceRow, error } = await supabase
    .from("races")
    .select("id, name, race_date, distance_km, is_active")
    .eq("id", raceId)
    .maybeSingle<RaceRow>();

  if (error) throw error;
  if (!raceRow) return null;

  const { data: planRow, error: planError } = await supabase
    .from("race_plans")
    .select("id")
    .eq("race_id", raceId)
    .maybeSingle<{ id: string }>();

  if (planError) throw planError;

  return {
    id: raceRow.id,
    name: raceRow.name,
    raceDate: raceRow.race_date,
    distanceKm: Number(raceRow.distance_km),
    isActive: raceRow.is_active,
    hasPlan: !!planRow,
  };
}

// Utilisé côté page (client authentifié normal) et côté route d'export
// (client admin, après vérification explicite propriétaire/coach — voir
// app/api/course-plan/[id]/export-tcx/route.ts).
export async function getRacePlanForRace(
  supabase: SupabaseClient,
  raceId: string
): Promise<{ plan: RacePlan; splits: RacePlanSplit[] } | null> {
  const { data: planRow, error: planError } = await supabase
    .from("race_plans")
    .select(RACE_PLAN_COLUMNS)
    .eq("race_id", raceId)
    .maybeSingle<RacePlanRow>();

  if (planError) throw planError;
  if (!planRow) return null;

  return { plan: toRacePlan(planRow), splits: await fetchSplitsForPlan(supabase, planRow.id) };
}

export async function getRacePlanById(
  supabase: SupabaseClient,
  racePlanId: string
): Promise<{ plan: RacePlan; splits: RacePlanSplit[] } | null> {
  const { data: planRow, error: planError } = await supabase
    .from("race_plans")
    .select(RACE_PLAN_COLUMNS)
    .eq("id", racePlanId)
    .maybeSingle<RacePlanRow>();

  if (planError) throw planError;
  if (!planRow) return null;

  return { plan: toRacePlan(planRow), splits: await fetchSplitsForPlan(supabase, planRow.id) };
}
