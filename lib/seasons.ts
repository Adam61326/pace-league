import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateString } from "@/lib/scoring";

const SEASON_LENGTH_WEEKS = 12;

export interface SeasonCompletionResult {
  completed: boolean;
  seasonId?: string;
  trophiesArchived?: number;
  nextSeasonId?: string;
}

// Clôture la saison active si sa end_date est dépassée : archive pour
// chaque utilisateur actif durant la saison son meilleur palier atteint
// (player_tiers.best_tier_this_season, mis à jour à chaque mouvement —
// lib/tiers.ts), marque la saison 'completed', crée automatiquement la
// suivante (12 semaines, démarre le lendemain), puis réinitialise
// best_tier_this_season au palier courant de chacun pour la nouvelle saison.
//
// Le palier lui-même (player_tiers.tier) n'est JAMAIS reset : seul le
// "meilleur atteint" de la saison écoulée est archivé en instantané dans
// season_trophies (CLAUDE.md Sprint 15).
//
// Appelée en tout début de lib/recompute.ts, avant la boucle hebdomadaire :
// une saison qui vient d'être créée doit déjà être visible par
// computeCountryScores pour la semaine en cours.
export async function checkSeasonCompletion(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<SeasonCompletionResult> {
  const todayStr = toDateString(now);

  const { data: activeSeason, error: seasonError } = await admin
    .from("seasons")
    .select("id, season_number, start_date, end_date")
    .eq("status", "active")
    .lte("end_date", todayStr)
    .order("end_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (seasonError) throw seasonError;
  if (!activeSeason) return { completed: false };

  // Utilisateurs actifs de la saison : au moins un point marqué sur une
  // semaine de la période [start_date, end_date].
  const { data: activeRows, error: activeError } = await admin
    .from("weekly_scores")
    .select("user_id")
    .gte("week_start_date", activeSeason.start_date)
    .lte("week_start_date", activeSeason.end_date)
    .gt("total_points", 0);

  if (activeError) throw activeError;

  const activeUserIds = Array.from(new Set((activeRows ?? []).map((r) => r.user_id)));

  let trophiesArchived = 0;
  if (activeUserIds.length > 0) {
    const { data: tierRows, error: tierError } = await admin
      .from("player_tiers")
      .select("user_id, best_tier_this_season")
      .in("user_id", activeUserIds);

    if (tierError) throw tierError;

    const trophyRows = (tierRows ?? []).map((row) => ({
      user_id: row.user_id,
      season_id: activeSeason.id,
      best_tier_reached: row.best_tier_this_season,
    }));

    if (trophyRows.length > 0) {
      const { error: insertError } = await admin
        .from("season_trophies")
        .upsert(trophyRows, { onConflict: "user_id,season_id", ignoreDuplicates: true });

      if (insertError) throw insertError;
      trophiesArchived = trophyRows.length;
    }
  }

  const { error: completeError } = await admin
    .from("seasons")
    .update({ status: "completed" })
    .eq("id", activeSeason.id);

  if (completeError) throw completeError;

  const nextStart = new Date(`${activeSeason.end_date}T00:00:00Z`);
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const nextEnd = new Date(nextStart);
  nextEnd.setUTCDate(nextEnd.getUTCDate() + SEASON_LENGTH_WEEKS * 7);

  const { data: nextSeason, error: createError } = await admin
    .from("seasons")
    .insert({
      season_number: activeSeason.season_number + 1,
      start_date: toDateString(nextStart),
      end_date: toDateString(nextEnd),
      status: "active",
    })
    .select("id")
    .single();

  if (createError) throw createError;

  // Nouvelle saison : le meilleur palier "de la saison" repart du palier
  // courant de chacun (pas de reset du palier lui-même). Upsert en un seul
  // aller-retour plutôt qu'une mise à jour ligne par ligne.
  const { data: allTiers, error: allTiersError } = await admin
    .from("player_tiers")
    .select("user_id, tier");

  if (allTiersError) throw allTiersError;

  if (allTiers && allTiers.length > 0) {
    const { error: resetError } = await admin.from("player_tiers").upsert(
      allTiers.map((row) => ({ user_id: row.user_id, tier: row.tier, best_tier_this_season: row.tier })),
      { onConflict: "user_id" }
    );

    if (resetError) throw resetError;
  }

  return {
    completed: true,
    seasonId: activeSeason.id,
    trophiesArchived,
    nextSeasonId: nextSeason.id,
  };
}
