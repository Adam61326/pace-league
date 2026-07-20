import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/strava";
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

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("users")
    .select("strava_access_token, strava_refresh_token, strava_token_expires_at")
    .eq("id", user.id)
    .single();

  // getValidAccessToken rafraîchit le token si besoin (comme le webhook) avant
  // qu'on tente de révoquer côté Strava : envoyer le token stocké tel quel
  // échoue silencieusement s'il a expiré, laissant Strava croire que le
  // compte est toujours connecté (vécu en prod : ça a fait planter la limite
  // d'1 athlète connecté du plan développeur gratuit). Un échec malgré tout
  // (refresh_token aussi invalide, Strava indisponible...) ne doit jamais
  // bloquer la déconnexion côté utilisateur : on vide les colonnes dans tous
  // les cas.
  if (profile?.strava_access_token && profile.strava_refresh_token) {
    try {
      const accessToken = await getValidAccessToken(admin, {
        id: user.id,
        strava_access_token: profile.strava_access_token,
        strava_refresh_token: profile.strava_refresh_token,
        strava_token_expires_at: profile.strava_token_expires_at,
      });
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
      console.error("strava disconnect: revocation failed (token refresh or deauthorize)", user.id, err);
    }
  }

  const { error } = await admin
    .from("users")
    .update({
      strava_athlete_id: null,
      strava_access_token: null,
      strava_refresh_token: null,
      strava_token_expires_at: null,
      strava_firstname: null,
      strava_lastname: null,
      strava_profile_photo_url: null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("strava disconnect: failed to clear columns", user.id, error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
