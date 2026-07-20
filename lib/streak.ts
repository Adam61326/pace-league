import type { SupabaseClient } from "@supabase/supabase-js";

interface StreakRow {
  user_id: string;
  streak_days: number;
}

// Un seul aller-retour SQL pour tout un lot d'utilisateurs (islands-and-gaps
// sur activity_date côté Postgres, voir migration get_user_streaks) plutôt
// que de recharger les activités en mémoire pour les recalculer ici.
export async function getStreaks(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc("get_user_streaks", {
    p_user_ids: userIds,
  });

  if (error) {
    console.error("getStreaks: rpc failed", error);
    return new Map();
  }

  return new Map((data as StreakRow[]).map((row) => [row.user_id, row.streak_days]));
}

export async function getStreak(supabase: SupabaseClient, userId: string): Promise<number> {
  const streaks = await getStreaks(supabase, [userId]);
  return streaks.get(userId) ?? 0;
}
