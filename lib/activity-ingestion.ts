import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchStravaActivity,
  fetchStravaActivityPhotos,
  firstPhotoUrl,
} from "@/lib/strava";
import { fetchWeatherForActivity } from "@/lib/weather";

// Filtre anti-triche (CLAUDE.md) : vitesse jugée non plausible en course à
// pied grand public au-delà de ce seuil.
const MAX_PLAUSIBLE_SPEED_KMH = 22;

export type IngestOutcome =
  | "inserted"
  | "duplicate"
  | "filtered_no_gps"
  | "filtered_speed"
  | "error";

export interface IngestResult {
  outcome: IngestOutcome;
  activityId: number;
  error?: unknown;
}

// Traitement complet d'une activité Strava (détail, filtres anti-triche,
// photo, météo, best_efforts) : identique que l'activité arrive via le
// webhook temps réel (app/api/strava/webhook) ou via le rattrapage
// d'historique déclenché à la connexion Strava (app/api/strava/callback).
// Idempotent (upsert sur strava_activity_id), donc rejouable sans risque de
// doublon si les deux flux se recoupent sur une même activité.
export async function ingestStravaActivity(
  admin: SupabaseClient,
  userId: string,
  activityId: number,
  accessToken: string
): Promise<IngestResult> {
  try {
    const activity = await fetchStravaActivity(activityId, accessToken);

    const hasGps = Array.isArray(activity.start_latlng) && activity.start_latlng.length === 2;
    if (!hasGps) {
      return { outcome: "filtered_no_gps", activityId };
    }

    const avgSpeedKmh = activity.average_speed * 3.6;
    if (avgSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
      return { outcome: "filtered_speed", activityId };
    }

    // Best-effort : une activité sans photo attachée est un cas normal, pas
    // une erreur. Un échec ici ne doit jamais bloquer l'insertion de
    // l'activité elle-même.
    let photoUrl: string | null = null;
    try {
      const photos = await fetchStravaActivityPhotos(activity.id, accessToken);
      photoUrl = firstPhotoUrl(photos);
    } catch (err) {
      console.error("ingestStravaActivity: photos fetch failed", activity.id, err);
    }

    // Best-effort également : pas de météo si Open-Meteo n'a pas de donnée
    // pour cette date/heure (voir lib/weather.ts) — jamais bloquant.
    let weather: Awaited<ReturnType<typeof fetchWeatherForActivity>> = null;
    if (activity.start_latlng) {
      try {
        const [lat, lng] = activity.start_latlng;
        weather = await fetchWeatherForActivity(lat, lng, activity.start_date_local);
      } catch (err) {
        console.error("ingestStravaActivity: weather fetch failed", activity.id, err);
      }
    }

    const { data: insertedActivity, error: insertError } = await admin
      .from("activities")
      .upsert(
        {
          user_id: userId,
          strava_activity_id: String(activity.id),
          name: activity.name,
          distance_km: activity.distance / 1000,
          moving_time_seconds: activity.moving_time,
          avg_speed_kmh: avgSpeedKmh,
          total_elevation_gain: activity.total_elevation_gain,
          has_gps: true,
          activity_date: activity.start_date_local.slice(0, 10),
          avg_heartrate: activity.average_heartrate ?? null,
          route_polyline: activity.map?.summary_polyline ?? null,
          photo_url: photoUrl,
          weather_temp_celsius: weather?.temperatureCelsius ?? null,
          weather_wind_kmh: weather?.windSpeedKmh ?? null,
        },
        { onConflict: "strava_activity_id", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("ingestStravaActivity: activity insert failed", insertError);
      return { outcome: "error", activityId, error: insertError };
    }

    // ignoreDuplicates fait renvoyer `null` par PostgREST si la ligne
    // existait déjà (retry webhook, ou activité déjà backfillée) : dans ce
    // cas les best_efforts auraient déjà été insérés au premier passage.
    if (!insertedActivity) {
      return { outcome: "duplicate", activityId };
    }

    if (activity.best_efforts && activity.best_efforts.length > 0) {
      const rows = activity.best_efforts.map((effort) => ({
        user_id: userId,
        activity_id: insertedActivity.id,
        distance_label: effort.name,
        elapsed_time_seconds: effort.elapsed_time,
        achieved_at: activity.start_date_local.slice(0, 10),
      }));

      const { error: bestEffortsError } = await admin
        .from("best_efforts")
        .upsert(rows, { onConflict: "activity_id,distance_label" });

      if (bestEffortsError) {
        console.error(
          "ingestStravaActivity: best_efforts insert failed",
          activity.id,
          bestEffortsError
        );
      }
    }

    return { outcome: "inserted", activityId };
  } catch (err) {
    console.error("ingestStravaActivity: activity fetch failed", activityId, err);
    return { outcome: "error", activityId, error: err };
  }
}
