import { decryptToken, encryptToken } from "@/lib/crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export const STRAVA_SCOPE = "activity:read";
export const STRAVA_OAUTH_STATE_COOKIE = "strava_oauth_state";

// Quota gratuit Strava (CLAUDE.md) : 100 req/15min, 1000/jour. Strava renvoie
// l'usage courant sur chaque réponse via ces deux en-têtes ("court terme,
// jour" séparés par une virgule) : on s'en sert pour logger et, si besoin,
// interrompre un traitement par lot (backfill d'historique) avant de
// dépasser le quota — le webhook (1 activité à la fois) n'en a jamais besoin.
export interface StravaRateLimitInfo {
  usage15min: number;
  limit15min: number;
  usageDaily: number;
  limitDaily: number;
}

const RATE_LIMIT_WARNING_RATIO = 0.85;
const RATE_LIMIT_CRITICAL_RATIO = 0.95;

export class StravaRateLimitExceededError extends Error {}

function parseStravaRateLimitHeaders(response: Response): StravaRateLimitInfo | null {
  const limitHeader = response.headers.get("x-ratelimit-limit");
  const usageHeader = response.headers.get("x-ratelimit-usage");
  if (!limitHeader || !usageHeader) return null;

  const [limit15min, limitDaily] = limitHeader.split(",").map(Number);
  const [usage15min, usageDaily] = usageHeader.split(",").map(Number);
  return { usage15min, limit15min, usageDaily, limitDaily };
}

function checkStravaRateLimit(scope: string, response: Response): void {
  const info = parseStravaRateLimitHeaders(response);
  if (!info) return;

  const ratio15min = info.usage15min / info.limit15min;
  const ratioDaily = info.usageDaily / info.limitDaily;

  if (ratio15min >= RATE_LIMIT_CRITICAL_RATIO || ratioDaily >= RATE_LIMIT_CRITICAL_RATIO) {
    throw new StravaRateLimitExceededError(
      `strava rate limit critical (${scope}): ${JSON.stringify(info)}`
    );
  }

  if (ratio15min >= RATE_LIMIT_WARNING_RATIO || ratioDaily >= RATE_LIMIT_WARNING_RATIO) {
    console.warn(`strava: rate limit approaching (${scope})`, info);
  }
}

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
  // Strava renvoie ce résumé athlète dès l'échange du code, sans scope
  // supplémentaire requis (firstname/lastname peuvent être vides si
  // l'athlète a masqué son nom réel dans ses réglages de confidentialité).
  // profile_medium/profile sont les URLs de photo (moyenne/grande) ; Strava
  // renvoie une silhouette générique par défaut si l'athlète n'a jamais
  // uploadé de photo, voir normalizeProfilePhotoUrl.
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile_medium?: string | null;
    profile?: string | null;
  };
}

// Strava renvoie systématiquement une URL de photo, même sans upload : dans
// ce cas l'URL pointe vers une silhouette générique reconnaissable par
// "avatar/athlete/{large|medium}" dans le chemin. On ne veut jamais afficher
// ce logo Strava par défaut sur le site : on stocke null à la place.
export function normalizeProfilePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/avatar\/athlete\/(large|medium)/i.test(url)) return null;
  return url;
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
    const body = await response.text();
    throw new Error(`Strava token refresh failed: ${response.status} ${body}`);
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
  name: string;
  distance: number; // mètres
  moving_time: number; // secondes
  average_speed: number; // m/s
  total_elevation_gain: number; // mètres
  start_date_local: string; // ISO 8601
  start_latlng: [number, number] | null;
  manual: boolean;
  // Absent (pas juste 0) si l'activité n'a pas de donnée cardiaque.
  average_heartrate?: number | null;
  map?: { summary_polyline?: string | null } | null;
  // Segments de distance standard (name: "5k", "10k", "Half-Marathon"...)
  // détectés par Strava dans l'activité, quand un effort continu les couvre.
  // Absent si l'activité est trop courte ou trop irrégulière pour qu'aucun
  // segment standard ne s'y prête.
  best_efforts?: { name: string; elapsed_time: number }[] | null;
}

export interface StravaActivityPhoto {
  urls?: Record<string, string> | null;
}

// GET /activities/{id}/photos : jamais d'échec bloquant côté appelant, une
// activité peut simplement n'avoir aucune photo attachée.
export async function fetchStravaActivityPhotos(
  activityId: number | string,
  accessToken: string
): Promise<StravaActivityPhoto[]> {
  const response = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/photos?photo_sources=true&size=600`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  checkStravaRateLimit("activity photos", response);

  if (!response.ok) {
    throw new Error(`Strava activity photos fetch failed: ${response.status}`);
  }

  return response.json();
}

// La clé de `urls` est la largeur en pixels demandée ; Strava ne garantit pas
// qu'elle corresponde exactement à `size` demandé plus haut, donc on prend
// la première URL disponible plutôt que d'indexer une clé fixe.
export function firstPhotoUrl(photos: StravaActivityPhoto[]): string | null {
  const urls = photos[0]?.urls;
  if (!urls) return null;
  const values = Object.values(urls);
  return values[0] ?? null;
}

export interface StravaAthleteSummary {
  id: number;
  profile_medium?: string | null;
  profile?: string | null;
}

// Utilisée par le webhook : les événements d'activité ne portent que
// owner_id, jamais la photo de l'athlète, donc un appel séparé est
// nécessaire pour la garder à jour (l'athlète peut avoir changé sa photo
// Strava depuis la dernière connexion).
export async function fetchStravaAthlete(accessToken: string): Promise<StravaAthleteSummary> {
  const response = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  checkStravaRateLimit("athlete", response);

  if (!response.ok) {
    throw new Error(`Strava athlete fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchStravaActivity(
  activityId: number | string,
  accessToken: string
): Promise<StravaActivityDetail> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  checkStravaRateLimit("activity detail", response);

  if (!response.ok) {
    throw new Error(`Strava activity fetch failed: ${response.status}`);
  }

  return response.json();
}

export interface StravaActivitySummary {
  id: number;
}

// GET /athlete/activities?after=... : utilisé uniquement pour le rattrapage
// d'historique à la connexion Strava (app/api/strava/callback), pas par le
// webhook. Un seul appel (per_page=50) couvre largement une fenêtre de 4
// semaines de course à pied grand public — pas besoin de pagination ici.
export async function fetchStravaActivitiesSince(
  accessToken: string,
  afterEpochSeconds: number,
  perPage = 50
): Promise<StravaActivitySummary[]> {
  const response = await fetch(
    `${STRAVA_API_BASE}/athlete/activities?after=${afterEpochSeconds}&per_page=${perPage}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  checkStravaRateLimit("activities list", response);

  if (!response.ok) {
    throw new Error(`Strava activities list fetch failed: ${response.status}`);
  }

  return response.json();
}
