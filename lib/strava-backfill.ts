import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestStravaActivity } from "@/lib/activity-ingestion";
import { recomputeRecentWeeks } from "@/lib/recompute";
import { fetchStravaActivitiesSince, StravaRateLimitExceededError } from "@/lib/strava";

// 4 semaines glissantes (CLAUDE.md Sprint 13 : "récupération des activités
// des 4 dernières semaines" à la connexion Strava).
const BACKFILL_WINDOW_DAYS = 28;

// Récupère et ingère les activités des 4 dernières semaines d'un utilisateur
// qui vient de (re)connecter Strava, avec exactement le même traitement par
// activité que le webhook (voir lib/activity-ingestion.ts), puis déclenche
// immédiatement le recalcul des scores/cohortes (lib/recompute.ts) plutôt
// que d'attendre le prochain passage nocturne du cron.
//
// Best-effort par conception : appelée en tâche de fond (next/server
// `after()`) depuis app/api/strava/callback, après que la redirection vers
// le dashboard a déjà été renvoyée au navigateur. Un échec ici (quota Strava
// atteint, activité individuelle en erreur...) ne doit jamais faire échouer
// la connexion Strava elle-même, déjà confirmée à ce stade.
export async function backfillRecentStravaActivities(
  admin: SupabaseClient,
  userId: string,
  accessToken: string
): Promise<void> {
  const after = new Date();
  after.setUTCDate(after.getUTCDate() - BACKFILL_WINDOW_DAYS);
  const afterEpochSeconds = Math.floor(after.getTime() / 1000);

  let activities;
  try {
    activities = await fetchStravaActivitiesSince(accessToken, afterEpochSeconds);
  } catch (err) {
    console.error("strava backfill: activities list fetch failed", userId, err);
    return;
  }

  console.log(
    `strava backfill: ${activities.length} activité(s) trouvée(s) pour l'utilisateur ${userId} depuis ${after.toISOString()}`
  );

  for (const summary of activities) {
    const result = await ingestStravaActivity(admin, userId, summary.id, accessToken);

    if (result.outcome === "error" && result.error instanceof StravaRateLimitExceededError) {
      console.warn(
        "strava backfill: arrêt anticipé, quota Strava proche de la limite",
        userId,
        result.error.message
      );
      break;
    }
  }

  try {
    await recomputeRecentWeeks(admin);
  } catch (err) {
    console.error("strava backfill: recalcul post-backfill échoué", userId, err);
  }
}
