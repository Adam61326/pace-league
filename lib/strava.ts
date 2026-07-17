import { decryptToken, encryptToken } from "@/lib/crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export const STRAVA_SCOPE = "activity:read";
export const STRAVA_OAUTH_STATE_COOKIE = "strava_oauth_state";

export function getStravaAuthorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(`${STRAVA_OAUTH_BASE}/authorize`);
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

interface StravaRefreshResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
}

// Réponse à l'échange initial du code d'autorisation : contient en plus
// l'athlète Strava, absent des réponses de refresh.
export interface StravaTokenResponse extends StravaRefreshResponse {
  athlete: { id: number };
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Strava token exchange failed: ${response.status}`);
  }

  return response.json();
}

async function refreshStravaToken(refreshToken: string): Promise<StravaRefreshResponse> {
  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed: ${response.status}`);
  }

  return response.json();
}

interface StravaUserRow {
  id: string;
  strava_access_token: string | null;
  strava_refresh_token: string | null;
  strava_token_expires_at: string | null;
}

// Renvoie un access_token Strava valide en clair, en le rafraîchissant et en
// persistant le nouveau couple de tokens (chiffrés) si celui stocké a expiré.
export async function getValidAccessToken(
  admin: SupabaseClient,
  user: StravaUserRow
): Promise<string> {
  if (!user.strava_access_token || !user.strava_refresh_token) {
    throw new Error(`User ${user.id} has no Strava tokens`);
  }

  const expiresAt = user.strava_token_expires_at
    ? new Date(user.strava_token_expires_at).getTime()
    : 0;
  const isExpiringSoon = expiresAt <= Date.now() + 60_000;

  if (!isExpiringSoon) {
    return decryptToken(user.strava_access_token);
  }

  const refreshed = await refreshStravaToken(decryptToken(user.strava_refresh_token));

  const { error } = await admin
    .from("users")
    .update({
      strava_access_token: encryptToken(refreshed.access_token),
      strava_refresh_token: encryptToken(refreshed.refresh_token),
      strava_token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    })
    .eq("id", user.id);

  if (error) throw error;

  return refreshed.access_token;
}

export interface StravaActivityDetail {
  id: number;
  distance: number; // mètres
  moving_time: number; // secondes
  average_speed: number; // m/s
  start_date_local: string; // ISO 8601
  start_latlng: [number, number] | null;
  manual: boolean;
}

export async function fetchStravaActivity(
  activityId: number | string,
  accessToken: string
): Promise<StravaActivityDetail> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Strava activity fetch failed: ${response.status}`);
  }

  return response.json();
}
