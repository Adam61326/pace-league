import type { SupabaseClient } from "@supabase/supabase-js";
import type { SplitElevation } from "@/lib/gpx";

// Distance d'un lap "plein" par défaut si aucune n'est choisie (voir
// SPLIT_DISTANCE_PRESETS) — anciennement une constante fixe non
// personnalisable, généralisée en paramètre pour le sélecteur "Splits par".
export const LAP_DISTANCE_KM = 1;

export const SPLIT_DISTANCE_PRESETS = [1, 2, 5, 10] as const;

// Intensité de la dérive d'allure, en continu de -1 (très positif, départ le
// plus rapide) à +1 (très négatif, fin la plus rapide), 0 = régulier.
// Remplace l'ancien enum à 3 valeurs ('positive' | 'even' | 'negative') pour
// permettre un curseur à 5 crans — voir PACE_STRATEGY_LEVELS et la migration
// 20260803000000_pace_strategy_numeric.sql. Les anciens crans "positif"/
// "négatif" correspondent exactement à ±0.5 (voir computeStrategyDeltaSecPerKm)
// pour ne pas changer l'allure déjà calculée des plans existants.
export type PaceStrategy = number;

export const PACE_STRATEGY_MIN = -1;
export const PACE_STRATEGY_MAX = 1;
export const PACE_STRATEGY_STEP = 0.5;

export const PACE_STRATEGY_LEVELS: { value: PaceStrategy; label: string }[] = [
  { value: -1, label: "Allure très positive" },
  { value: -0.5, label: "Allure positive" },
  { value: 0, label: "Allure régulière" },
  { value: 0.5, label: "Allure négative" },
  { value: 1, label: "Allure très négative" },
];

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

// Partagé entre RacePlanForm (édition d'un plan existant) et AddRaceForm
// (création d'une course) : les deux utilisent le même sélecteur de
// distance, voir CLAUDE.md "UI — SÉLECTEUR DE DISTANCE".
export function matchDistancePresetKey(distanceKm: number | null): string {
  if (distanceKm == null) return "other";
  const preset = DISTANCE_PRESETS.find((p) => p.distanceKm != null && Math.abs(p.distanceKm - distanceKm) < 0.005);
  return preset?.key ?? "other";
}

// Dérive totale à intensité maximale (±1, "très positif"/"très négatif"),
// en % de l'allure moyenne demandée, pic-à-pic. À intensité ±0.5 (anciens
// crans "positif"/"négatif"), la dérive vaut donc 10% pic-à-pic — inchangé
// par rapport à l'ancien enum, voir computeStrategyDeltaSecPerKm. Valeur par
// défaut raisonnable non spécifiée dans la demande d'origine (contrairement
// au relief, voir ci-dessous) : à ajuster si le retour terrain la juge trop
// marquée ou trop plate.
const PACE_STRATEGY_MAX_SWING_PCT = 20;

// Ajustement relief — formule confirmée explicitement avant implémentation
// (voir échange de validation) : pénalité montée ~2.3x plus forte que le
// bonus descente, en % de l'allure plutôt qu'en secondes fixes pour rester
// proportionné à tous les niveaux. Plafond de pente pour ne pas laisser un
// pic GPS erroné dans le GPX produire une allure aberrante sur un split.
// Coefficients réduits une première fois (~15%, ratio montée/descente
// conservé), puis réduits une seconde fois (~20% supplémentaires, ratio
// toujours conservé) à la demande, l'impact du relief sur le chrono étant
// encore jugé trop marqué.
const RELIEF_K_UP_PCT_PER_GRADE_PCT = 2.4;
const RELIEF_K_DOWN_PCT_PER_GRADE_PCT = 1.0;
const RELIEF_MAX_GRADE_PCT = 15;

export interface RacePlanSplit {
  lapNumber: number;
  distanceKm: number;
  targetPaceSecPerKm: number;
  isFinishLap: boolean;
  elevationGainM: number | null;
  elevationLossM: number | null;
  comment: string | null;
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
  // Bouton ON/OFF de l'éditeur : le D+/D- reste enregistré (par split et/ou
  // globalement) même désactivé, seul son impact sur l'allure cible est
  // neutralisé — voir computeRacePlanSplits. true par défaut (comportement
  // historique inchangé pour les plans déjà enregistrés).
  reliefEnabled: boolean;
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

// intensity < 0 = allure "positive" (départ rapide, fin lente) ; intensity >
// 0 = allure "négative" (départ lent, fin rapide) ; magnitude proportionnelle
// à |intensity|. Le signe négatif devant `intensity` fait que le premier
// split (linear = -0.5) reçoit un delta du signe opposé à intensity : une
// intensity négative ("positif") donne un delta négatif au premier split
// (plus rapide), cohérent avec le sens du curseur POSITIF (gauche, valeurs
// négatives) → NÉGATIF (droite, valeurs positives).
function computeStrategyDeltaSecPerKm(basePaceSecPerKm: number, intensity: PaceStrategy, index: number, total: number): number {
  if (intensity === 0 || total <= 1) return 0;
  const swingSecPerKm = basePaceSecPerKm * (PACE_STRATEGY_MAX_SWING_PCT / 100);
  const t = index / (total - 1); // 0 (premier split) .. 1 (dernier split)
  const linear = t - 0.5; // -0.5 .. 0.5
  return -intensity * linear * swingSecPerKm;
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
    reliefEnabled?: boolean;
  } = {}
): RacePlanSplit[] {
  const splitDistanceKm = options.splitDistanceKm ?? LAP_DISTANCE_KM;
  const paceStrategy = options.paceStrategy ?? 0;
  const reliefEnabled = options.reliefEnabled ?? true;
  const laps = computeSplitDistances(distanceKm, splitDistanceKm);

  return laps.map((lap, index) => {
    const strategyDelta = computeStrategyDeltaSecPerKm(targetPaceSecPerKm, paceStrategy, index, laps.length);
    const elevation = options.splitElevations?.[index] ?? null;
    const reliefDelta = reliefEnabled && elevation ? computeReliefDeltaSecPerKm(targetPaceSecPerKm, lap.distanceKm, elevation) : 0;

    return {
      lapNumber: index + 1,
      distanceKm: lap.distanceKm,
      targetPaceSecPerKm: Math.round(targetPaceSecPerKm + strategyDelta + reliefDelta),
      isFinishLap: lap.isFinishLap,
      elevationGainM: elevation?.elevationGainM ?? null,
      elevationLossM: elevation?.elevationLossM ?? null,
      // Les commentaires vivent dans une table séparée (race_plan_split_comments)
      // car cette fonction pure ne connaît pas le plan persisté — RacePlanForm
      // les superpose après coup en les associant par lapNumber, voir
      // mergeSplitComments.
      comment: null,
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
  relief_enabled: boolean;
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

interface RacePlanSplitCommentRow {
  lap_number: number;
  comment: string;
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
  "id, race_id, user_id, race_name, race_date, distance_km, target_pace_sec_per_km, elevation_gain_m, elevation_loss_m, pace_strategy, gpx_filename, split_distance_km, relief_enabled, races(name, race_date)";
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
    paceStrategy: Number(row.pace_strategy),
    gpxFilename: row.gpx_filename,
    splitDistanceKm: Number(row.split_distance_km),
    reliefEnabled: row.relief_enabled,
  };
}

function toRacePlanSplit(row: RacePlanSplitRow, comment: string | null): RacePlanSplit {
  return {
    lapNumber: row.lap_number,
    distanceKm: Number(row.distance_km),
    targetPaceSecPerKm: Number(row.target_pace_sec_per_km),
    isFinishLap: row.is_finish_lap,
    elevationGainM: row.elevation_gain_m != null ? Number(row.elevation_gain_m) : null,
    elevationLossM: row.elevation_loss_m != null ? Number(row.elevation_loss_m) : null,
    comment,
  };
}

// Les commentaires vivent dans race_plan_split_comments, une table séparée
// de race_plan_splits (régénérée en bloc à chaque enregistrement du plan,
// voir app/api/course-plan/route.ts) — jointe ici par lap_number plutôt que
// par FK directe pour survivre à cette régénération.
async function fetchSplitsForPlan(supabase: SupabaseClient, racePlanId: string): Promise<RacePlanSplit[]> {
  const [{ data: splitRows, error }, { data: commentRows, error: commentError }] = await Promise.all([
    supabase
      .from("race_plan_splits")
      .select(RACE_PLAN_SPLIT_COLUMNS)
      .eq("race_plan_id", racePlanId)
      .order("lap_number", { ascending: true })
      .returns<RacePlanSplitRow[]>(),
    supabase
      .from("race_plan_split_comments")
      .select("lap_number, comment")
      .eq("race_plan_id", racePlanId)
      .returns<RacePlanSplitCommentRow[]>(),
  ]);

  if (error) throw error;
  if (commentError) throw commentError;

  const commentsByLapNumber = new Map((commentRows ?? []).map((c) => [c.lap_number, c.comment]));
  return (splitRows ?? []).map((row) => toRacePlanSplit(row, commentsByLapNumber.get(row.lap_number) ?? null));
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
