// Script ponctuel : à exécuter une seule fois à la main, PAS une route de
// l'app. Sert à rattraper les activités des 7 derniers jours pour le compte
// Strava déjà connecté, restées invisibles côté webhook (créées avant la
// création de la subscription webhook, donc jamais notifiées).
//
// Usage : npx tsx scripts/backfill-recent-activities.ts
//
// Réutilise volontairement les mêmes filtres anti-triche et le même mapping
// de colonnes que app/api/strava/webhook/route.ts, pour produire des lignes
// `activities` identiques à ce que le webhook aurait inséré.

process.loadEnvFile(".env.local");

import { createAdminClient } from "../lib/supabase/admin";
import { getValidAccessToken, type StravaActivityDetail } from "../lib/strava";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const MAX_PLAUSIBLE_SPEED_KMH = 22; // identique au webhook
const LOOKBACK_DAYS = 7;

async function fetchRecentActivities(accessToken: string): Promise<StravaActivityDetail[]> {
  const after = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 24 * 60 * 60;
  const url = `${STRAVA_API_BASE}/athlete/activities?after=${after}&per_page=100`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Strava activities list fetch failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function main() {
  const admin = createAdminClient();

  // Compte de test unique pour ce backfill ponctuel : le seul utilisateur
  // ayant un compte Strava connecté.
  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, strava_access_token, strava_refresh_token, strava_token_expires_at")
    .not("strava_access_token", "is", null);

  if (usersError) throw usersError;
  if (!users || users.length === 0) {
    throw new Error("Aucun utilisateur avec un compte Strava connecté trouvé.");
  }
  if (users.length > 1) {
    throw new Error(
      `${users.length} utilisateurs Strava connectés trouvés — ce script ne gère qu'un seul compte de test, à adapter avant usage.`
    );
  }

  const user = users[0];
  console.log("strava_token_expires_at:", user.strava_token_expires_at, "| now:", new Date().toISOString());
  const accessToken = await getValidAccessToken(admin, user);

  const activities = await fetchRecentActivities(accessToken);
  console.log(`${activities.length} activité(s) récupérée(s) sur les ${LOOKBACK_DAYS} derniers jours.`);

  let inserted = 0;
  let filteredOut = 0;

  for (const activity of activities) {
    const hasGps = Array.isArray(activity.start_latlng) && activity.start_latlng.length === 2;
    const avgSpeedKmh = activity.average_speed * 3.6;

    if (!hasGps || avgSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
      filteredOut++;
      console.log(
        `  ignorée (filtre anti-triche) : id=${activity.id} hasGps=${hasGps} avgSpeedKmh=${avgSpeedKmh.toFixed(1)}`
      );
      continue;
    }

    const { error: insertError } = await admin.from("activities").upsert(
      {
        user_id: user.id,
        strava_activity_id: String(activity.id),
        distance_km: activity.distance / 1000,
        moving_time_seconds: activity.moving_time,
        avg_speed_kmh: avgSpeedKmh,
        total_elevation_gain: activity.total_elevation_gain,
        has_gps: true,
        activity_date: activity.start_date_local.slice(0, 10),
      },
      { onConflict: "strava_activity_id", ignoreDuplicates: true }
    );

    if (insertError) {
      console.error(`  échec insertion id=${activity.id}:`, insertError);
      continue;
    }

    inserted++;
    console.log(`  insérée : id=${activity.id} date=${activity.start_date_local.slice(0, 10)}`);
  }

  console.log(`Terminé. ${inserted} insérée(s), ${filteredOut} filtrée(s) par les règles anti-triche.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
