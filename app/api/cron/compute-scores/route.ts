import { createAdminClient } from "@/lib/supabase/admin";
import { computeCountryScores, computeWeeklyScores, getWeekBounds } from "@/lib/scoring";
import { NextResponse, type NextRequest } from "next/server";

// Vercel Cron ajoute automatiquement ce header quand CRON_SECRET est défini
// sur le projet : https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { weekStart, weekEnd } = getWeekBounds();

  const weeklyResult = await computeWeeklyScores(admin, weekStart, weekEnd);
  const countryResult = await computeCountryScores(admin, weekStart, weekEnd);

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    weeklyResult,
    countryResult,
  });
}
