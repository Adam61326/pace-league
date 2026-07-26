import type { SupabaseClient } from "@supabase/supabase-js";

export interface WeeklyUserSummary {
  totalKm: number;
  totalDplus: number;
  activeDays: number;
  totalRuns: number;
  avgPaceSecPerKm: number | null;
  avgHeartrate: number | null;
}

// Résumé "cette semaine" d'un utilisateur : toutes les activités
// synchronisées de la semaine (pas seulement celles qui comptent pour le
// score — le seuil anti-spam de 1.5km n'exclut qu'une poignée de sorties,
// cette vue reste plus honnête en montrant tout ce qui a été fait). Extrait
// du dashboard (Sprint 12) pour être réutilisé par la page profil publique et
// le panel stats hebdo (Sprint 16), qui ont besoin des mêmes chiffres pour
// des utilisateurs autres que le visiteur courant (client admin requis).
export async function getWeeklyUserSummary(
  supabase: SupabaseClient,
  userId: string,
  weekStartStr: string,
  weekEndStr: string
): Promise<WeeklyUserSummary> {
  const { data: weekActivities } = await supabase
    .from("activities")
    .select("activity_date, distance_km, total_elevation_gain, moving_time_seconds, avg_heartrate")
    .eq("user_id", userId)
    .gte("activity_date", weekStartStr)
    .lte("activity_date", weekEndStr);

  const rows = weekActivities ?? [];

  const totalKm = rows.reduce((sum, a) => sum + Number(a.distance_km ?? 0), 0);
  const totalDplus = rows.reduce((sum, a) => sum + Number(a.total_elevation_gain ?? 0), 0);
  const totalMovingTime = rows.reduce((sum, a) => sum + (a.moving_time_seconds ?? 0), 0);
  const activeDays = new Set(rows.map((a) => a.activity_date)).size;
  const avgPaceSecPerKm = totalKm > 0 ? totalMovingTime / totalKm : null;

  // Moyenne de fréquence cardiaque de la semaine : seulement si au moins une
  // activité a la donnée (pas de capteur = absente, jamais traitée comme 0).
  const heartrateReadings = rows
    .map((a) => (a.avg_heartrate != null ? Number(a.avg_heartrate) : null))
    .filter((v): v is number => v != null);
  const avgHeartrate =
    heartrateReadings.length > 0
      ? heartrateReadings.reduce((sum, v) => sum + v, 0) / heartrateReadings.length
      : null;

  return {
    totalKm,
    totalDplus,
    activeDays,
    totalRuns: rows.length,
    avgPaceSecPerKm,
    avgHeartrate,
  };
}
