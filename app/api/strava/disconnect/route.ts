import { decryptToken } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const STRAVA_DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("strava_access_token")
    .eq("id", user.id)
    .single();

  // On tente de révoquer côté Strava, mais un échec (token déjà invalide,
  // Strava indisponible...) ne doit jamais bloquer la déconnexion côté
  // utilisateur : on vide les colonnes dans tous les cas.
  if (profile?.strava_access_token) {
    try {
      const accessToken = decryptToken(profile.strava_access_token);
      const response = await fetch(
        `${STRAVA_DEAUTHORIZE_URL}?access_token=${encodeURIComponent(accessToken)}`,
        { method: "POST" }
      );
      if (!response.ok) {
        console.error(
          "strava disconnect: deauthorize call rejected by Strava",
          user.id,
          response.status
        );
      }
    } catch (err) {
      console.error("strava disconnect: deauthorize request failed", user.id, err);
    }
  }

  const { error } = await supabase
    .from("users")
    .update({
      strava_athlete_id: null,
      strava_access_token: null,
      strava_refresh_token: null,
      strava_token_expires_at: null,
      strava_firstname: null,
      strava_lastname: null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("strava disconnect: failed to clear columns", user.id, error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
