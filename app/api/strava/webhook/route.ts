import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchStravaActivity,
  getValidAccessToken,
  type StravaActivityDetail,
} from "@/lib/strava";
import { NextResponse, type NextRequest } from "next/server";

// Filtres anti-triche (CLAUDE.md) : vitesse jugée non plausible en course à
// pied grand public au-delà de ce seuil.
const MAX_PLAUSIBLE_SPEED_KMH = 22;

interface StravaWebhookEvent {
  aspect_type: "create" | "update" | "delete";
  event_time: number;
  object_id: number;
  object_type: "activity" | "athlete";
  owner_id: number;
  subscription_id: number;
  updates: Record<string, string>;
}

// Validation initiale de la subscription (voir Strava webhook docs) :
// Strava appelle ce GET une fois à la création de la subscription et attend
// qu'on lui renvoie hub.challenge tel quel si hub.verify_token correspond.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

// Strava attend un 200 sous 2 secondes ; au-delà (ou en cas de non-200) il
// retente avec un backoff. Le traitement ci-dessous est synchrone mais
// idempotent (upsert sur strava_activity_id) pour supporter ces retries sans
// risque de doublon.
export async function POST(request: NextRequest) {
  const event: StravaWebhookEvent = await request.json();

  if (event.object_type !== "activity" || event.aspect_type !== "create") {
    return NextResponse.json({});
  }

  const admin = createAdminClient();

  const { data: user, error: userError } = await admin
    .from("users")
    .select("id, strava_access_token, strava_refresh_token, strava_token_expires_at")
    .eq("strava_athlete_id", String(event.owner_id))
    .maybeSingle();

  if (userError) {
    console.error("strava webhook: user lookup failed", userError);
    return NextResponse.json({ error: "user lookup failed" }, { status: 500 });
  }

  // Athlète inconnu de notre système (ne devrait pas arriver, la subscription
  // est app-wide côté Strava) : rien à faire, on acquitte quand même.
  if (!user) {
    return NextResponse.json({});
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(admin, user);
  } catch (err) {
    // Refresh token révoqué/invalide : erreur permanente, inutile que Strava
    // retente. On log et on acquitte.
    console.error("strava webhook: token refresh failed", user.id, err);
    return NextResponse.json({});
  }

  let activity: StravaActivityDetail;
  try {
    activity = await fetchStravaActivity(event.object_id, accessToken);
  } catch (err) {
    console.error("strava webhook: activity fetch failed", event.object_id, err);
    return NextResponse.json({ error: "activity fetch failed" }, { status: 500 });
  }

  const hasGps = Array.isArray(activity.start_latlng) && activity.start_latlng.length === 2;
  const avgSpeedKmh = activity.average_speed * 3.6;

  if (!hasGps || avgSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
    return NextResponse.json({});
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
    console.error("strava webhook: activity insert failed", insertError);
    return NextResponse.json({ error: "activity insert failed" }, { status: 500 });
  }

  return NextResponse.json({});
}
