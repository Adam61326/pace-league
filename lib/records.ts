import type { SupabaseClient } from "@supabase/supabase-js";

// Distances standard affichees, dans cet ordre — best_efforts peut contenir
// d'autres libelles Strava (ex: "400m", "1 mile") qu'on capture tous mais
// n'affiche pas ici pour rester lisible. Casse exacte des libelles Strava
// verifiee en base ("5K"/"10K"/"15K", pas "5k") : ne pas la "normaliser".
export const STANDARD_DISTANCES = ["5K", "10K", "15K", "Half-Marathon", "Marathon"];

export interface PersonalRecords {
  longestRun: { distance_km: number; activity_date: string } | null;
  biggestClimb: { total_elevation_gain: number; activity_date: string } | null;
  bestPaceActivity: { avg_speed_kmh: number; activity_date: string } | null;
  bestEffortByDistance: Map<string, { elapsedTimeSeconds: number; achievedAt: string }>;
}

// Records personnels d'un utilisateur (Sprint 12/17) : extrait de
// /dashboard pour etre reutilise tel quel par /records (page standalone),
// sans dupliquer les requetes.
export async function getPersonalRecords(
  supabase: SupabaseClient,
  userId: string
): Promise<PersonalRecords> {
  const [{ data: longestRun }, { data: biggestClimb }, { data: bestPaceActivity }, { data: bestEffortsRows }] =
    await Promise.all([
      supabase
        .from("activities")
        .select("distance_km, activity_date")
        .eq("user_id", userId)
        .order("distance_km", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("activities")
        .select("total_elevation_gain, activity_date")
        .eq("user_id", userId)
        .order("total_elevation_gain", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("activities")
        .select("avg_speed_kmh, activity_date")
        .eq("user_id", userId)
        .gte("distance_km", 3)
        .order("avg_speed_kmh", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("best_efforts").select("distance_label, elapsed_time_seconds, achieved_at").eq("user_id", userId),
    ]);

  // Table petite par utilisateur, on recupere tout et on garde le meilleur
  // (temps le plus court) par distance_label en memoire plutot que 5 requetes
  // separees.
  const bestEffortByDistance = new Map<string, { elapsedTimeSeconds: number; achievedAt: string }>();
  for (const row of bestEffortsRows ?? []) {
    const current = bestEffortByDistance.get(row.distance_label);
    if (!current || row.elapsed_time_seconds < current.elapsedTimeSeconds) {
      bestEffortByDistance.set(row.distance_label, {
        elapsedTimeSeconds: row.elapsed_time_seconds,
        achievedAt: row.achieved_at,
      });
    }
  }

  return {
    longestRun: longestRun
      ? { distance_km: Number(longestRun.distance_km), activity_date: longestRun.activity_date }
      : null,
    biggestClimb: biggestClimb
      ? { total_elevation_gain: Number(biggestClimb.total_elevation_gain), activity_date: biggestClimb.activity_date }
      : null,
    bestPaceActivity: bestPaceActivity
      ? { avg_speed_kmh: Number(bestPaceActivity.avg_speed_kmh), activity_date: bestPaceActivity.activity_date }
      : null,
    bestEffortByDistance,
  };
}
