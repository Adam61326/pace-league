import type { SplitElevation } from "@/lib/gpx";
import { computeRacePlanSplits, PACE_STRATEGY_MAX, PACE_STRATEGY_MIN, type PaceStrategy } from "@/lib/race-plan";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toNullableNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toPaceStrategy(value: unknown): PaceStrategy {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(PACE_STRATEGY_MAX, Math.max(PACE_STRATEGY_MIN, n));
}

// Le client envoie les mêmes clés camelCase que SplitElevation
// (lib/gpx.ts) : calculées soit depuis un GPX fraîchement parsé, soit
// reprises du plan déjà enregistré — voir components/race-plan-form.tsx.
function toSplitElevations(value: unknown): SplitElevation[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => ({
    elevationGainM: toNullableNonNegativeNumber(entry?.elevationGainM) ?? 0,
    elevationLossM: toNullableNonNegativeNumber(entry?.elevationLossM) ?? 0,
  }));
}

// Écrit avec le client authentifié normal (RLS "users can insert/update own
// race plan", 20260801000000_add_race_plan.sql) : contrairement à
// clubs/coach, aucun effet de bord sur un autre utilisateur, pas besoin du
// client admin. Un plan par course (race_id unique, voir
// 20260802000000_add_multi_race_plans.sql) : upsert sur race_id plutôt
// qu'un create dédié, comme avant sur user_id.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const raceId = toNullableString(body.race_id);
  const distanceKm = toPositiveNumber(body.distance_km);
  const targetPaceSecPerKm = toPositiveNumber(body.target_pace_sec_per_km);
  const elevationGainM = toNullableNonNegativeNumber(body.elevation_gain_m);
  const elevationLossM = toNullableNonNegativeNumber(body.elevation_loss_m);
  const paceStrategy = toPaceStrategy(body.pace_strategy);
  const gpxFilename = toNullableString(body.gpx_filename);
  const splitDistanceKm = toPositiveNumber(body.split_distance_km) ?? 1;
  const splitElevations = toSplitElevations(body.split_elevations);
  const reliefEnabled = body.relief_enabled !== false;

  if (!raceId) {
    return NextResponse.json({ error: "invalid_race_id" }, { status: 400 });
  }
  if (!distanceKm) {
    return NextResponse.json({ error: "invalid_distance" }, { status: 400 });
  }
  if (!targetPaceSecPerKm) {
    return NextResponse.json({ error: "invalid_target_pace" }, { status: 400 });
  }

  // Vérifie l'appartenance de la course avant d'écrire dessus — la RLS sur
  // race_plans/races protège déjà l'accès, cette vérification explicite
  // évite un upsert "silencieux" avec un race_id d'une autre course.
  const { data: race, error: raceError } = await supabase.from("races").select("id, user_id").eq("id", raceId).maybeSingle();

  if (raceError) {
    console.error("course plan: race lookup failed", raceError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!race || race.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: raceUpdateError } = await supabase.from("races").update({ distance_km: distanceKm }).eq("id", raceId);

  if (raceUpdateError) {
    console.error("course plan: race distance sync failed", raceUpdateError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { data: plan, error: upsertError } = await supabase
    .from("race_plans")
    .upsert(
      {
        user_id: user.id,
        race_id: raceId,
        distance_km: distanceKm,
        target_pace_sec_per_km: targetPaceSecPerKm,
        elevation_gain_m: elevationGainM,
        elevation_loss_m: elevationLossM,
        pace_strategy: paceStrategy,
        gpx_filename: gpxFilename,
        split_distance_km: splitDistanceKm,
        relief_enabled: reliefEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "race_id" }
    )
    .select("id")
    .single();

  if (upsertError) {
    console.error("course plan: upsert failed", upsertError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Régénéré en bloc plutôt qu'un update ligne par ligne : le nombre de
  // splits change dès que distance, allure cible ou splitDistanceKm
  // changent (voir lib/race-plan.ts computeRacePlanSplits), un upsert
  // partiel laisserait des lignes orphelines de l'ancien découpage.
  const { error: deleteError } = await supabase.from("race_plan_splits").delete().eq("race_plan_id", plan.id);

  if (deleteError) {
    console.error("course plan: splits cleanup failed", deleteError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const splits = computeRacePlanSplits(distanceKm, targetPaceSecPerKm, {
    splitDistanceKm,
    paceStrategy,
    splitElevations: splitElevations ?? undefined,
    reliefEnabled,
  });

  const { error: insertError } = await supabase.from("race_plan_splits").insert(
    splits.map((split) => ({
      race_plan_id: plan.id,
      lap_number: split.lapNumber,
      distance_km: split.distanceKm,
      target_pace_sec_per_km: split.targetPaceSecPerKm,
      is_finish_lap: split.isFinishLap,
      elevation_gain_m: split.elevationGainM,
      elevation_loss_m: split.elevationLossM,
    }))
  );

  if (insertError) {
    console.error("course plan: splits insert failed", insertError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ id: plan.id });
}
