import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/strava";
import { NextResponse } from "next/server";

const STRAVA_DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";

// Suppression définitive du compte (bouton "Supprimer mon compte" sur
// /parametres). Révoque Strava en best-effort (même logique que
// /api/strava/disconnect), puis supprime le compte auth.users via l'API
// admin Supabase : public.users (et tout ce qui en dépend — activities,
// weekly_scores, best_efforts, league_members, leagues créées par cet
// utilisateur) est nettoyé automatiquement par les FK "on delete cascade"
// posées dès le schéma initial, pas de suppression manuelle table par table.
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
        console.error("account delete: strava deauthorize rejected", user.id, response.status);
      }
    } catch (err) {
      console.error("account delete: strava revocation failed", user.id, err);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error("account delete: deleteUser failed", user.id, error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
