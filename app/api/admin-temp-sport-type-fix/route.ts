// SCRIPT PONCTUEL — Sprint 15, à supprimer après exécution (voir mémoire
// no-premature-backfill : convention établie pour les corrections
// ponctuelles de données déjà synchronisées).
//
// 1. Rétro-corrige sport_type/start_hour_local des activités déjà
//    synchronisées avant l'ajout du filtre par type d'activité, en
//    re-récupérant chaque activité concernée depuis Strava.
// 2. Ré-ouvre (supprime) les cohortes de paliers et le Hall of Fame déjà
//    figés sur des semaines potentiellement contaminées par des sorties
//    vélo/marche comptées à tort, puis relance un recalcul complet — sinon
//    weekly_scores serait corrigé mais tier_cohorts/hall_of_fame resteraient
//    figés sur l'ancien score faux (voir CLAUDE.md pour la discussion de
//    cette exception ponctuelle à la règle de verrouillage définitif).
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeRecentWeeks } from "@/lib/recompute";
import { fetchStravaActivity, getValidAccessToken } from "@/lib/strava";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: rows, error: rowsError } = await admin
    .from("activities")
    .select("id, user_id, strava_activity_id")
    .is("sport_type", null);

  if (rowsError) {
    return NextResponse.json({ error: "fetch_failed", detail: rowsError.message }, { status: 500 });
  }

  const byUser = new Map<string, typeof rows>();
  for (const row of rows ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const results: Array<{ activityId: string; sportType?: string | null; error?: string }> = [];

  for (const [userId, userRows] of byUser.entries()) {
    const { data: user } = await admin
      .from("users")
      .select("id, strava_access_token, strava_refresh_token, strava_token_expires_at")
      .eq("id", userId)
      .maybeSingle();

    if (!user?.strava_access_token) {
      for (const row of userRows) {
        results.push({ activityId: row.strava_activity_id, error: "no_strava_token" });
      }
      continue;
    }

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(admin, user);
    } catch (err) {
      for (const row of userRows) {
        results.push({ activityId: row.strava_activity_id, error: `token_refresh_failed: ${err}` });
      }
      continue;
    }

    for (const row of userRows) {
      try {
        const activity = await fetchStravaActivity(row.strava_activity_id, accessToken);
        const sportType = activity.sport_type ?? activity.type ?? null;
        const startHourLocal = Number.parseInt(activity.start_date_local.slice(11, 13), 10);

        const { error: updateError } = await admin
          .from("activities")
          .update({ sport_type: sportType, start_hour_local: startHourLocal })
          .eq("id", row.id);

        if (updateError) throw updateError;

        results.push({ activityId: row.strava_activity_id, sportType });
      } catch (err) {
        results.push({ activityId: row.strava_activity_id, error: String(err) });
      }
    }
  }

  const { data: earliestActivity } = await admin
    .from("activities")
    .select("activity_date")
    .order("activity_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const rangeStart = earliestActivity?.activity_date ?? null;
  let deletedCohorts = 0;
  let deletedHallOfFame = 0;

  if (rangeStart) {
    const { data: cohortsToDelete } = await admin
      .from("tier_cohorts")
      .select("id")
      .gte("week_start_date", rangeStart);
    if (cohortsToDelete && cohortsToDelete.length > 0) {
      await admin
        .from("tier_cohorts")
        .delete()
        .in("id", cohortsToDelete.map((c) => c.id));
      deletedCohorts = cohortsToDelete.length;
    }

    const { data: hofToDelete } = await admin
      .from("hall_of_fame")
      .select("id")
      .gte("week_start_date", rangeStart);
    if (hofToDelete && hofToDelete.length > 0) {
      await admin
        .from("hall_of_fame")
        .delete()
        .in("id", hofToDelete.map((h) => h.id));
      deletedHallOfFame = hofToDelete.length;
    }
  }

  let weeksToRecompute = 4;
  if (rangeStart) {
    const earliest = new Date(`${rangeStart}T00:00:00Z`);
    const now = new Date();
    weeksToRecompute =
      Math.ceil((now.getTime() - earliest.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  }

  const recomputed = await recomputeRecentWeeks(admin, weeksToRecompute);

  return NextResponse.json({
    backfillResults: results,
    deletedCohorts,
    deletedHallOfFame,
    weeksToRecompute,
    recomputed,
  });
}
