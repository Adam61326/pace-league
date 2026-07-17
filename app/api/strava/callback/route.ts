import { encryptToken } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import { exchangeStravaCode, STRAVA_OAUTH_STATE_COOKIE } from "@/lib/strava";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const dashboardUrl = new URL("/dashboard", origin);

  if (searchParams.get("error")) {
    dashboardUrl.searchParams.set("strava_error", "access_denied");
    return NextResponse.redirect(dashboardUrl);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STRAVA_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(STRAVA_OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    dashboardUrl.searchParams.set("strava_error", "invalid_state");
    return NextResponse.redirect(dashboardUrl);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?redirectTo=/dashboard", origin));
  }

  try {
    const tokenResponse = await exchangeStravaCode(code);

    const { error } = await supabase
      .from("users")
      .update({
        strava_athlete_id: String(tokenResponse.athlete.id),
        strava_access_token: encryptToken(tokenResponse.access_token),
        strava_refresh_token: encryptToken(tokenResponse.refresh_token),
        strava_token_expires_at: new Date(tokenResponse.expires_at * 1000).toISOString(),
      })
      .eq("id", user.id);

    if (error) throw error;

    dashboardUrl.searchParams.set("strava", "connected");
  } catch {
    dashboardUrl.searchParams.set("strava_error", "exchange_failed");
  }

  return NextResponse.redirect(dashboardUrl);
}
