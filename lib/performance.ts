import { getWeekBounds, SCORABLE_SPORT_TYPES, toDateString } from "@/lib/scoring";
import type { SupabaseClient } from "@supabase/supabase-js";

// Algorithme de performance à 4 axes (Sprint 12). Principe commun aux 3 axes
// "percentile" (Endurance, Vitesse, Montée) : jamais de comparaison
// inter-utilisateurs (CLAUDE.md — positionnement inclusif), uniquement un
// classement de la valeur actuelle dans l'historique personnel de
// l'utilisateur, via une série de fenêtres glissantes échantillonnées chaque
// semaine. L'axe Efficacité suit une logique différente (tendance vs
// percentile), voir plus bas.

const MIN_WINDOW_SAMPLES = 4; // en dessous, un percentile est trop bruité pour être honnête

const ENDURANCE_WINDOW_WEEKS = 6;
const VITESSE_WINDOW_DAYS = 90;
const MONTEE_WINDOW_WEEKS = 6; // non spécifié dans le brief, aligné sur Endurance par cohérence
const MONTEE_HILLY_THRESHOLD_M_PER_KM = 15;
const EFFICACITE_WINDOW_WEEKS = 4;
const EFFICACITE_TREND_THRESHOLD_PCT = 3; // en dessous de cet écart, on affiche "stable"

export interface PerformanceAxis {
  key: "endurance" | "vitesse" | "montee" | "efficacite";
  label: string;
  percentile: number | null; // 0-100, position sur le radar
  unavailableReason: string | null; // motif si percentile === null
  detail: string | null; // valeur actuelle formatée, pour affichage à côté du radar
  trend: "hausse" | "stable" | "baisse" | null; // uniquement renseigné pour Efficacité
}

export interface Activity {
  date: string;
  distanceKm: number;
  movingTimeSeconds: number;
  elevationGainM: number;
  avgHeartrate: number | null;
}

export function mondayOf(dateStr: string): string {
  const { weekStart } = getWeekBounds(new Date(`${dateStr}T00:00:00Z`));
  return toDateString(weekStart);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

// Tous les lundis de `firstWeek` à `lastWeek` inclus.
export function weekAnchors(firstWeek: string, lastWeek: string): string[] {
  const result: string[] = [];
  let cursor = firstWeek;
  while (cursor <= lastWeek) {
    result.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return result;
}

// Percentile du dernier point d'une série vs le reste de sa propre
// histoire. higherIsBetter=false pour un axe où une valeur plus basse est
// meilleure (temps prédit Vitesse) : le percentile reste alors "% de
// l'historique moins bon que maintenant", cohérent avec les autres axes où
// 100 = "meilleur que jamais".
export function percentileOfLast(series: number[], higherIsBetter: boolean): number | null {
  if (series.length < MIN_WINDOW_SAMPLES) return null;
  const current = series[series.length - 1];
  const notBetterCount = higherIsBetter
    ? series.filter((v) => v <= current).length
    : series.filter((v) => v >= current).length;
  return Math.round((notBetterCount / series.length) * 100);
}

// ============================================================================
// Endurance : charge d'entraînement (TRIMP, formule exponentielle de
// Banister), agrégée sur des fenêtres glissantes de 6 semaines.
//
// TRIMP = duree_min × HRr × 0.64 × e^(1.92 × HRr), HRr = (FC - FC_repos) / (FC_max - FC_repos)
//
// Vérification manuelle (avant implémentation) :
//   Sortie de 45 min, FC moy 150, FC repos 50, FC max 190
//   HRr = (150-50)/(190-50) = 0.7143
//   TRIMP = 45 × 0.7143 × 0.64 × e^(1.92×0.7143) = 45 × 0.7143 × 0.64 × e^1.3714
//         ≈ 45 × 0.7143 × 0.64 × 3.9407 ≈ 81.1
//   Footing récupération 30 min, FC moy 120, mêmes repos/max :
//   HRr = (120-50)/140 = 0.5 ; TRIMP = 30×0.5×0.64×e^0.96 ≈ 30×0.5×0.64×2.611 ≈ 25.1
//   → un effort nettement plus dur (81) pèse ~3x plus qu'une récup (25) pour
//   une durée proche : comportement attendu d'un TRIMP exponentiel.
// ============================================================================
function computeTrimp(durationMin: number, avgHr: number, hrRest: number, hrMax: number): number {
  const hrr = (avgHr - hrRest) / (hrMax - hrRest);
  return durationMin * hrr * 0.64 * Math.exp(1.92 * hrr);
}

function computeEnduranceAxis(
  activities: Activity[],
  hrMax: number | null,
  hrRest: number | null
): PerformanceAxis {
  const base: Omit<PerformanceAxis, "percentile" | "unavailableReason" | "detail"> = {
    key: "endurance",
    label: "Endurance",
    trend: null,
  };

  if (hrMax == null || hrRest == null || hrRest >= hrMax) {
    return {
      ...base,
      percentile: null,
      detail: null,
      unavailableReason: "Renseigne ta FC max et ta FC de repos dans Paramètres pour débloquer cet axe.",
    };
  }

  const withHr = activities.filter((a) => a.avgHeartrate != null && a.movingTimeSeconds > 0);
  if (withHr.length === 0) {
    return {
      ...base,
      percentile: null,
      detail: null,
      unavailableReason: "Pas assez de données pour cet axe.",
    };
  }

  const trimpByWeek = new Map<string, number>();
  for (const a of withHr) {
    const week = mondayOf(a.date);
    const trimp = computeTrimp(a.movingTimeSeconds / 60, a.avgHeartrate!, hrRest, hrMax);
    trimpByWeek.set(week, (trimpByWeek.get(week) ?? 0) + trimp);
  }

  const weeks = weekAnchors(mondayOf(withHr[0].date), mondayOf(withHr[withHr.length - 1].date));
  const series = weeks.map((_, i) => {
    const windowWeeks = weeks.slice(Math.max(0, i - (ENDURANCE_WINDOW_WEEKS - 1)), i + 1);
    return windowWeeks.reduce((sum, w) => sum + (trimpByWeek.get(w) ?? 0), 0);
  });

  const percentile = percentileOfLast(series, true);
  const currentTrimp = series[series.length - 1];

  return {
    ...base,
    percentile,
    detail: `${Math.round(currentTrimp)} TRIMP sur ${ENDURANCE_WINDOW_WEEKS} semaines`,
    unavailableReason: percentile == null ? "Pas assez de données pour cet axe." : null,
  };
}

// ============================================================================
// Vitesse : conversion Riegel de chaque sortie en équivalent 10 km,
// meilleur équivalent sur 90 jours glissants.
//
// temps_predit = temps_reel × (10 / distance_km)^1.06
//
// Vérification manuelle : 5 km en 25:00 (1500 s)
//   predit_10k = 1500 × (10/5)^1.06 = 1500 × 2^1.06 ≈ 1500 × 2.0847 ≈ 3127 s ≈ 52:07
//   → 5:12/km prédit sur 10 km contre 5:00/km sur 5 km : légèrement plus
//   lent, cohérent avec la dégradation d'allure attendue sur une distance
//   double (Riegel prédit toujours un peu plus lent, jamais un rythme
//   identique ou meilleur).
// ============================================================================
function riegelPredicted10kSeconds(distanceKm: number, movingTimeSeconds: number): number {
  return movingTimeSeconds * Math.pow(10 / distanceKm, 1.06);
}

export function computeVitesseAxis(activities: Activity[]): PerformanceAxis {
  const base: Omit<PerformanceAxis, "percentile" | "unavailableReason" | "detail"> = {
    key: "vitesse",
    label: "Vitesse",
    trend: null,
  };

  const qualifying = activities.filter((a) => a.distanceKm > 0 && a.movingTimeSeconds > 0);
  if (qualifying.length === 0) {
    return {
      ...base,
      percentile: null,
      detail: null,
      unavailableReason: "Pas assez de données pour cet axe.",
    };
  }

  const weeks = weekAnchors(mondayOf(qualifying[0].date), mondayOf(qualifying[qualifying.length - 1].date));

  const series: number[] = [];
  for (const week of weeks) {
    const windowEnd = addDays(week, 6); // dimanche de la semaine ancre
    const windowStart = addDays(windowEnd, -VITESSE_WINDOW_DAYS + 1);
    const inWindow = qualifying.filter((a) => a.date >= windowStart && a.date <= windowEnd);
    if (inWindow.length === 0) continue;
    const best = Math.min(...inWindow.map((a) => riegelPredicted10kSeconds(a.distanceKm, a.movingTimeSeconds)));
    series.push(best);
  }

  const percentile = percentileOfLast(series, false);
  const currentBestSeconds = series[series.length - 1];

  return {
    ...base,
    percentile,
    detail: currentBestSeconds != null ? `${formatDuration(currentBestSeconds)} équiv. 10km` : null,
    unavailableReason: percentile == null ? "Pas assez de données pour cet axe." : null,
  };
}

// ============================================================================
// Montée : distance effective = distance_km + (D+ / 100), compare l'allure
// (ajustée du D+) des sorties vallonnées (D+ > 15 m/km) à l'allure plate
// habituelle. Convention "1m de D+ ≈ 10m de plat" (corrigée après revue
// produit — la version initiale (D+/10)/1000 ne créditait presque rien).
//
// Vérification manuelle : sortie vallonnée 10 km, D+ 300 m, en 55:00 (3300 s)
//   distance_effective = 10 + 300/100 = 10 + 3 = 13 km
//   allure_effective = 3300 / 13 ≈ 253.8 s/km (≈ 4:14/km)
//   Avec une allure plate habituelle de 5:00/km (300 s/km) :
//   climb_score = 300 / 253.8 ≈ 1.182 → une fois le D+ crédité à ce taux, la
//   sortie vallonnée ressort ~18% plus rapide que la référence plate : un
//   300m de D+ sur 10km représente un effort significatif, donc un bon
//   score une fois ajusté est plausible. Le ratio réagit toujours dans le
//   bon sens (climb_score > 1 si la sortie vallonnée, une fois ajustée, est
//   aussi rapide ou plus rapide que le plat) — même comportement qualitatif
//   qu'avant, juste une magnitude de crédit D+ réaliste.
// ============================================================================
function effectiveDistanceKm(distanceKm: number, elevationGainM: number): number {
  return distanceKm + elevationGainM / 100;
}

function computeMonteeAxis(activities: Activity[]): PerformanceAxis {
  const base: Omit<PerformanceAxis, "percentile" | "unavailableReason" | "detail"> = {
    key: "montee",
    label: "Montée",
    trend: null,
  };

  const withDistance = activities.filter((a) => a.distanceKm > 0 && a.movingTimeSeconds > 0);
  const flat = withDistance.filter(
    (a) => a.elevationGainM / a.distanceKm <= MONTEE_HILLY_THRESHOLD_M_PER_KM
  );
  const hilly = withDistance.filter(
    (a) => a.elevationGainM / a.distanceKm > MONTEE_HILLY_THRESHOLD_M_PER_KM
  );

  if (flat.length === 0 || hilly.length === 0) {
    return {
      ...base,
      percentile: null,
      detail: null,
      unavailableReason: "Pas assez de données pour cet axe.",
    };
  }

  // Allure plate habituelle : moyenne pondérée par la distance (plus robuste
  // qu'une moyenne simple des allures, qu'une sortie courte et lente
  // fausserait disproportionnellement).
  const flatTotalTime = flat.reduce((sum, a) => sum + a.movingTimeSeconds, 0);
  const flatTotalDist = flat.reduce((sum, a) => sum + a.distanceKm, 0);
  const flatBaselineSecPerKm = flatTotalTime / flatTotalDist;

  const climbScoreByDate = hilly.map((a) => {
    const effKm = effectiveDistanceKm(a.distanceKm, a.elevationGainM);
    const hillyPaceSecPerKm = a.movingTimeSeconds / effKm;
    return { date: a.date, score: flatBaselineSecPerKm / hillyPaceSecPerKm };
  });

  const weeks = weekAnchors(mondayOf(hilly[0].date), mondayOf(hilly[hilly.length - 1].date));
  const series: number[] = [];
  for (const week of weeks) {
    const windowStart = addDays(week, -(MONTEE_WINDOW_WEEKS - 1) * 7);
    const inWindow = climbScoreByDate.filter((c) => c.date >= windowStart && c.date <= addDays(week, 6));
    if (inWindow.length === 0) continue;
    series.push(inWindow.reduce((sum, c) => sum + c.score, 0) / inWindow.length);
  }

  const percentile = percentileOfLast(series, true);
  const currentScore = series[series.length - 1];

  return {
    ...base,
    percentile,
    detail: currentScore != null ? `${Math.round(currentScore * 100)}% de l'allure plate en côte` : null,
    unavailableReason: percentile == null ? "Pas assez de données pour cet axe." : null,
  };
}

// ============================================================================
// Efficacité : EF = (distance_km / durée_min) / FC moyenne, moyenne mobile 4
// semaines, tendance vs les 4 semaines précédentes.
//
// Vérification manuelle : 8 km en 42:00 (2520 s ⇒ 42 min), FC moy 155
//   EF = (8/42) / 155 = 0.1905 / 155 ≈ 0.001229
//   Une sortie plus rapide à FC égale (8km en 38 min) donne
//   EF = (8/38)/155 ≈ 0.2105/155 ≈ 0.001358, une valeur d'EF plus haute :
//   le sens de variation est correct (plus efficace ⇒ EF plus grand),
//   utilisé uniquement en comparaison relative (tendance), jamais affiché
//   comme un chiffre absolu à interpréter seul.
// ============================================================================
function efficiencyFactor(distanceKm: number, movingTimeSeconds: number, avgHr: number): number {
  const minutes = movingTimeSeconds / 60;
  return distanceKm / minutes / avgHr;
}

function computeEfficaciteAxis(activities: Activity[]): PerformanceAxis {
  const base: Omit<PerformanceAxis, "percentile" | "unavailableReason" | "detail"> = {
    key: "efficacite",
    label: "Efficacité",
    trend: null,
  };

  const qualifying = activities.filter(
    (a) => a.distanceKm > 0 && a.movingTimeSeconds > 0 && a.avgHeartrate != null
  );
  if (qualifying.length === 0) {
    return {
      ...base,
      percentile: null,
      detail: null,
      unavailableReason: "Pas assez de données pour cet axe (nécessite la fréquence cardiaque).",
    };
  }

  const efByDate = qualifying.map((a) => ({
    date: a.date,
    ef: efficiencyFactor(a.distanceKm, a.movingTimeSeconds, a.avgHeartrate!),
  }));

  const weeks = weekAnchors(mondayOf(qualifying[0].date), mondayOf(qualifying[qualifying.length - 1].date));
  const series: number[] = [];
  for (const week of weeks) {
    const windowStart = addDays(week, -(EFFICACITE_WINDOW_WEEKS - 1) * 7);
    const inWindow = efByDate.filter((e) => e.date >= windowStart && e.date <= addDays(week, 6));
    if (inWindow.length === 0) continue;
    series.push(inWindow.reduce((sum, e) => sum + e.ef, 0) / inWindow.length);
  }

  const percentile = percentileOfLast(series, true);

  // Tendance : moyenne 4-semaines actuelle vs celle d'il y a 4 semaines
  // (fenêtre non chevauchante précédente) — nécessite au moins 2 fenêtres
  // pleines d'écart dans la série.
  let trend: PerformanceAxis["trend"] = null;
  if (series.length >= EFFICACITE_WINDOW_WEEKS + 1) {
    const current = series[series.length - 1];
    const previous = series[series.length - 1 - EFFICACITE_WINDOW_WEEKS];
    const changePct = ((current - previous) / previous) * 100;
    trend =
      changePct > EFFICACITE_TREND_THRESHOLD_PCT
        ? "hausse"
        : changePct < -EFFICACITE_TREND_THRESHOLD_PCT
          ? "baisse"
          : "stable";
  }

  return {
    ...base,
    percentile,
    detail: null,
    trend,
    unavailableReason: percentile == null ? "Pas assez de données pour cet axe." : null,
  };
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Filet de sécurité, pas une vraie pagination (même logique que MAX_ROWS
// ailleurs dans l'app) : largement suffisant pour l'historique d'un seul
// utilisateur à ce stade du produit.
const MAX_ACTIVITIES = 2000;

export async function computePerformanceAxes(
  supabase: SupabaseClient,
  userId: string,
  hrMax: number | null,
  hrRest: number | null
): Promise<PerformanceAxis[]> {
  const { data: rows } = await supabase
    .from("activities")
    .select("activity_date, distance_km, moving_time_seconds, total_elevation_gain, avg_heartrate, sport_type")
    .eq("user_id", userId)
    .order("activity_date", { ascending: true })
    .limit(MAX_ACTIVITIES);

  // sport_type (Sprint 15) : une sortie vélo/marche ne doit pas influencer
  // les axes de performance, tous pensés pour la course à pied (Riegel,
  // TRIMP...). Même filtre que lib/scoring.ts isActivityScorable.
  const activities: Activity[] = (rows ?? [])
    .filter((r) => SCORABLE_SPORT_TYPES.includes(r.sport_type as (typeof SCORABLE_SPORT_TYPES)[number]))
    .map((r) => ({
      date: r.activity_date,
      distanceKm: Number(r.distance_km ?? 0),
      movingTimeSeconds: r.moving_time_seconds ?? 0,
      elevationGainM: Number(r.total_elevation_gain ?? 0),
      avgHeartrate: r.avg_heartrate != null ? Number(r.avg_heartrate) : null,
    }))
    .filter((a) => a.distanceKm > 0 && a.movingTimeSeconds > 0);

  return [
    computeEnduranceAxis(activities, hrMax, hrRest),
    computeVitesseAxis(activities),
    computeMonteeAxis(activities),
    computeEfficaciteAxis(activities),
  ];
}
