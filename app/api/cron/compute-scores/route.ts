import { createAdminClient } from "@/lib/supabase/admin";
import { computeCountryScores, computeWeeklyScores, getWeekBounds, toDateString } from "@/lib/scoring";
import { NextResponse, type NextRequest } from "next/server";

// getWeekBounds() sans argument résout toujours "la semaine de maintenant" :
// une activité qui arrive en retard sur sa semaine (backfill, resynchro
// Strava tardive...) n'était donc jamais recalculée après coup, ce passage
// quotidien ne regardant que la semaine en cours. Recalcule maintenant les
// RECOMPUTE_WEEKS dernières semaines à chaque passage plutôt qu'une seule :
// idempotent (upsert user_id+week_start_date / country_code+season_id+
// week_start_date déjà en place), donc rejouer une semaine déjà scorée
// écrase proprement l'ancienne valeur sans créer de doublon.
const RECOMPUTE_WEEKS = 4;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { weekStart: currentWeekStart } = getWeekBounds();

  const recomputedWeeks = [];
  for (let i = RECOMPUTE_WEEKS - 1; i >= 0; i--) {
    const reference = new Date(currentWeekStart);
    reference.setUTCDate(reference.getUTCDate() - i * 7);
    const { weekStart, weekEnd } = getWeekBounds(reference);

    const weeklyResult = await computeWeeklyScores(admin, weekStart, weekEnd);
    const countryResult = await computeCountryScores(admin, weekStart, weekEnd);

    recomputedWeeks.push({
      weekStart: toDateString(weekStart),
      weeklyResult,
      countryResult,
    });
  }

  return NextResponse.json({ recomputedWeeks });
}
