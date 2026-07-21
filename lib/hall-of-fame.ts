import type { SupabaseClient } from "@supabase/supabase-js";

const TOP_N = 3;

export interface HallOfFameResult {
  weekStartDate: string;
  archived: boolean;
  skipped?: "week_in_progress" | "already_archived" | "no_scores";
}

// Archive le top 3 mondial (tous paliers confondus) d'une semaine terminée,
// par total_points de weekly_scores (même calcul individuel que les autres
// niveaux de classement, CLAUDE.md). Figé définitivement une fois écrit —
// même logique que tier_cohorts.movements_applied (CLAUDE.md Sprint 13) :
// si des lignes existent déjà pour cette semaine, elles ne sont jamais
// recalculées, même si des données arrivent en retard. L'intégrité d'un
// "Hall of Fame" suppose qu'un résultat annoncé ne change plus.
export async function archiveHallOfFameForWeek(
  admin: SupabaseClient,
  weekStartStr: string,
  weekEnd: Date,
  now: Date = new Date()
): Promise<HallOfFameResult> {
  if (weekEnd.getTime() >= now.getTime()) {
    return { weekStartDate: weekStartStr, archived: false, skipped: "week_in_progress" };
  }

  const { data: existing, error: existingError } = await admin
    .from("hall_of_fame")
    .select("id")
    .eq("week_start_date", weekStartStr)
    .limit(1);

  if (existingError) throw existingError;

  if (existing && existing.length > 0) {
    return { weekStartDate: weekStartStr, archived: false, skipped: "already_archived" };
  }

  const { data: topRows, error } = await admin
    .from("weekly_scores")
    .select("user_id, total_points")
    .eq("week_start_date", weekStartStr)
    .gt("total_points", 0)
    .order("total_points", { ascending: false })
    .limit(TOP_N);

  if (error) throw error;

  if (!topRows || topRows.length === 0) {
    return { weekStartDate: weekStartStr, archived: false, skipped: "no_scores" };
  }

  const rows = topRows.map((row, index) => ({
    week_start_date: weekStartStr,
    rank: index + 1,
    user_id: row.user_id,
    total_points: row.total_points,
  }));

  const { error: insertError } = await admin.from("hall_of_fame").insert(rows);
  if (insertError) throw insertError;

  return { weekStartDate: weekStartStr, archived: true };
}
