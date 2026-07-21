import { createAdminClient } from "@/lib/supabase/admin";
import { ingestStravaActivity } from "@/lib/activity-ingestion";
import {
  fetchStravaAthlete,
  getValidAccessToken,
  normalizeProfilePhotoUrl,
} from "@/lib/strava";
import { NextResponse, type NextRequest } from "next/server";

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
// idempotent (upsert sur strava_activity_id via ingestStravaActivity) pour
// supporter ces retries sans risque de doublon.
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

  // Best-effort : les événements d'activité ne portent pas la photo de
  // l'athlète, donc on la rafraîchit à chaque activité reçue (l'athlète a pu
  // la changer depuis la dernière connexion). Un échec ici ne doit jamais
  // bloquer l'ingestion de l'activité, qui est le rôle principal du webhook.
  try {
    const athlete = await fetchStravaAthlete(accessToken);
    await admin
      .from("users")
      .update({
        strava_profile_photo_url: normalizeProfilePhotoUrl(
          athlete.profile_medium ?? athlete.profile
        ),
      })
      .eq("id", user.id);
  } catch (err) {
    console.error("strava webhook: athlete photo refresh failed", user.id, err);
  }

  const result = await ingestStravaActivity(admin, user.id, event.object_id, accessToken);

  if (result.outcome === "error") {
    return NextResponse.json({ error: "activity ingestion failed" }, { status: 500 });
  }

  return NextResponse.json({});
}
