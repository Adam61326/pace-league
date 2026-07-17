import { createClient } from "@/lib/supabase/server";
import { getStravaAuthorizeUrl, STRAVA_OAUTH_STATE_COOKIE } from "@/lib/strava";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?redirectTo=/dashboard", request.url));
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = new URL("/api/strava/callback", request.url).toString();
  const response = NextResponse.redirect(getStravaAuthorizeUrl(redirectUri, state));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
