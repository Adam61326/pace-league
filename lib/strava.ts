const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

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

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
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
