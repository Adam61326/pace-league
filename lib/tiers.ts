import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateString } from "@/lib/scoring";

// Ordre croissant : bronze_3 est le palier minimum, legend le maximum.
export const TIER_ORDER = [
  "bronze_3", "bronze_2", "bronze_1",
  "silver_3", "silver_2", "silver_1",
  "gold_3", "gold_2", "gold_1",
  "diamond", "master", "legend",
] as const;

export type Tier = (typeof TIER_ORDER)[number];

export const DEFAULT_TIER: Tier = "bronze_3";

export interface TierMeta {
  label: string;
  colorClass: string;
  bgClass: string;
}

// Une couleur par groupe (bronze/argent/or/diamant/master/legend), CLAUDE.md
// Sprint 13 "badge de palier bien visible (icône/couleur par palier)".
export const TIER_META: Record<Tier, TierMeta> = {
  bronze_3: { label: "Bronze III", colorClass: "text-amber-600", bgClass: "bg-amber-600/15" },
  bronze_2: { label: "Bronze II", colorClass: "text-amber-600", bgClass: "bg-amber-600/15" },
  bronze_1: { label: "Bronze I", colorClass: "text-amber-600", bgClass: "bg-amber-600/15" },
  silver_3: { label: "Argent III", colorClass: "text-zinc-300", bgClass: "bg-zinc-300/15" },
  silver_2: { label: "Argent II", colorClass: "text-zinc-300", bgClass: "bg-zinc-300/15" },
  silver_1: { label: "Argent I", colorClass: "text-zinc-300", bgClass: "bg-zinc-300/15" },
  gold_3: { label: "Or III", colorClass: "text-yellow-400", bgClass: "bg-yellow-400/15" },
  gold_2: { label: "Or II", colorClass: "text-yellow-400", bgClass: "bg-yellow-400/15" },
  gold_1: { label: "Or I", colorClass: "text-yellow-400", bgClass: "bg-yellow-400/15" },
  diamond: { label: "Diamant", colorClass: "text-cyan-300", bgClass: "bg-cyan-300/15" },
  master: { label: "Master", colorClass: "text-violet-400", bgClass: "bg-violet-400/15" },
  legend: { label: "Legend", colorClass: "text-rose-400", bgClass: "bg-rose-400/15" },
};

const COHORT_SIZE = 30;
const PROMOTION_ZONE = 5;
const RELEGATION_ZONE = 5;
// En dessous de ce seuil, les zones de promotion et de relégation se
// chevaucheraient (ex: cohorte de 6 joueurs -> le rang 5 serait à la fois
// dans le top 5 et dans le bottom 5). Pas de mouvement tant qu'une cohorte
// n'atteint pas cette taille. Exportée : lib/badges.ts applique le même
// seuil aux badges "victoire hebdo"/"podiums" (Sprint 14), pour la même
// raison — gagner dans une cohorte de 2 joueurs n'est pas une vraie victoire.
export const MIN_COHORT_SIZE_FOR_MOVEMENT = 10;

export function nextTierUp(tier: Tier): Tier | null {
  const idx = TIER_ORDER.indexOf(tier);
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

export function nextTierDown(tier: Tier): Tier | null {
  const idx = TIER_ORDER.indexOf(tier);
  return idx > 0 ? TIER_ORDER[idx - 1] : null;
}

// Filet de sécurité : le trigger handle_new_user (ou le backfill de
// migration 20260721000000) crée normalement toujours cette ligne. On la
// crée ici à la demande si un cas limite l'avait manquée, plutôt que de
// bloquer l'affichage.
export async function getOrCreatePlayerTier(
  admin: SupabaseClient,
  userId: string
): Promise<Tier> {
  const { data, error } = await admin
    .from("player_tiers")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data.tier as Tier;

  const { error: insertError } = await admin
    .from("player_tiers")
    .insert({ user_id: userId, tier: DEFAULT_TIER });

  if (insertError) throw insertError;
  return DEFAULT_TIER;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface ActivePlayer {
  user_id: string;
  week_points: number;
}

export interface TierCohortsResult {
  weekStartDate: string;
  tiersProcessed: number;
  cohortsCreated: number;
  movementsApplied: boolean;
  skipped?: "already_finalized";
}

// Recalcule les cohortes hebdomadaires de chaque palier actif (joueurs ayant
// scoré au moins 1 point cette semaine), classées par total_points. Si la
// semaine est terminée (weekEnd < now), applique aussi les mouvements de
// palier une seule fois : la cohorte est alors figée via
// tier_cohorts.movements_applied pour ne jamais être rejouée par un passage
// ultérieur du cron (qui recalcule les 4 dernières semaines chaque nuit,
// cf. app/api/cron/compute-scores).
//
// Tant que la semaine est en cours, cette fonction peut être rappelée sans
// risque : les cohortes non figées sont entièrement reconstruites à chaque
// appel (nouvelle photo des joueurs actifs à l'instant T).
export async function computeTierCohortsForWeek(
  admin: SupabaseClient,
  weekStart: Date,
  weekEnd: Date,
  now: Date = new Date()
): Promise<TierCohortsResult> {
  const weekStartStr = toDateString(weekStart);

  const { data: alreadyFinalized, error: finalizedError } = await admin
    .from("tier_cohorts")
    .select("id")
    .eq("week_start_date", weekStartStr)
    .eq("movements_applied", true)
    .limit(1);

  if (finalizedError) throw finalizedError;

  if (alreadyFinalized && alreadyFinalized.length > 0) {
    return {
      weekStartDate: weekStartStr,
      tiersProcessed: 0,
      cohortsCreated: 0,
      movementsApplied: false,
      skipped: "already_finalized",
    };
  }

  const { data: existingCohorts, error: existingError } = await admin
    .from("tier_cohorts")
    .select("id")
    .eq("week_start_date", weekStartStr);

  if (existingError) throw existingError;

  if (existingCohorts && existingCohorts.length > 0) {
    const { error: deleteError } = await admin
      .from("tier_cohorts")
      .delete()
      .in("id", existingCohorts.map((c) => c.id));
    if (deleteError) throw deleteError;
  }

  const { data: weeklyRows, error: weeklyError } = await admin
    .from("weekly_scores")
    .select("user_id, total_points")
    .eq("week_start_date", weekStartStr)
    .gt("total_points", 0);

  if (weeklyError) throw weeklyError;

  if (!weeklyRows || weeklyRows.length === 0) {
    return { weekStartDate: weekStartStr, tiersProcessed: 0, cohortsCreated: 0, movementsApplied: false };
  }

  const userIds = weeklyRows.map((r) => r.user_id);
  const { data: tierRows, error: tierError } = await admin
    .from("player_tiers")
    .select("user_id, tier")
    .in("user_id", userIds);

  if (tierError) throw tierError;

  const tierByUser = new Map((tierRows ?? []).map((r) => [r.user_id, r.tier as Tier]));
  const pointsByUser = new Map(weeklyRows.map((r) => [r.user_id, Number(r.total_points)]));

  const byTier = new Map<Tier, ActivePlayer[]>();
  for (const userId of userIds) {
    const tier = tierByUser.get(userId);
    if (!tier) continue; // pas de palier connu (cf. backfill migration) : ignoré défensivement
    const list = byTier.get(tier) ?? [];
    list.push({ user_id: userId, week_points: pointsByUser.get(userId) ?? 0 });
    byTier.set(tier, list);
  }

  const weekEnded = weekEnd.getTime() < now.getTime();
  let cohortsCreated = 0;

  for (const [tier, players] of byTier.entries()) {
    // Assignation déterministe : triée par user_id puis découpée en
    // tranches de COHORT_SIZE (CLAUDE.md Sprint 13).
    const sorted = [...players].sort((a, b) => a.user_id.localeCompare(b.user_id));
    const cohorts = chunk(sorted, COHORT_SIZE);

    for (const cohortPlayers of cohorts) {
      const { data: cohortRow, error: cohortInsertError } = await admin
        .from("tier_cohorts")
        .insert({ tier, week_start_date: weekStartStr, member_count: cohortPlayers.length })
        .select("id")
        .single();

      if (cohortInsertError) throw cohortInsertError;
      cohortsCreated += 1;

      const ranked = [...cohortPlayers].sort((a, b) => b.week_points - a.week_points);
      const canMove = ranked.length >= MIN_COHORT_SIZE_FOR_MOVEMENT;

      const memberRows = ranked.map((player, index) => {
        const rank = index + 1;
        const movement: "promoted" | "relegated" | "stable" =
          canMove && rank <= PROMOTION_ZONE
            ? "promoted"
            : canMove && rank > ranked.length - RELEGATION_ZONE
              ? "relegated"
              : "stable";

        return {
          cohort_id: cohortRow.id as string,
          user_id: player.user_id,
          week_points: player.week_points,
          rank,
          movement,
        };
      });

      const { error: memberError } = await admin.from("cohort_members").insert(memberRows);
      if (memberError) throw memberError;

      if (weekEnded) {
        for (const member of memberRows) {
          if (member.movement === "stable") continue;

          const newTier =
            member.movement === "promoted" ? nextTierUp(tier) : nextTierDown(tier);

          if (!newTier) continue; // déjà au palier max (legend) ou min (bronze_3)

          const { error: updateError } = await admin
            .from("player_tiers")
            .update({ tier: newTier, updated_at: new Date().toISOString() })
            .eq("user_id", member.user_id);

          if (updateError) throw updateError;
        }
      }
    }
  }

  if (weekEnded) {
    const { error: finalizeError } = await admin
      .from("tier_cohorts")
      .update({ movements_applied: true })
      .eq("week_start_date", weekStartStr);

    if (finalizeError) throw finalizeError;
  }

  return {
    weekStartDate: weekStartStr,
    tiersProcessed: byTier.size,
    cohortsCreated,
    movementsApplied: weekEnded,
  };
}

export interface CohortMemberProfile {
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
  country_code: string;
}

export interface CohortMemberInfo {
  user_id: string;
  week_points: number;
  rank: number;
  movement: "promoted" | "relegated" | "stable";
  user: CohortMemberProfile;
}

function extractCohortUser(users: unknown): CohortMemberProfile | null {
  if (!users) return null;
  if (Array.isArray(users)) {
    return (users[0] as CohortMemberProfile | undefined) ?? null;
  }
  return users as CohortMemberProfile;
}

export async function findMyCohortId(
  admin: SupabaseClient,
  userId: string,
  weekStartStr: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("cohort_members")
    .select("cohort_id, tier_cohorts!inner(week_start_date)")
    .eq("user_id", userId)
    .eq("tier_cohorts.week_start_date", weekStartStr)
    .maybeSingle();

  if (error) throw error;
  return data?.cohort_id ?? null;
}

// Retrouve la cohorte de l'utilisateur pour cette semaine ; si aucune
// cohorte n'existe encore (première visite avant le premier passage du cron
// sur cette semaine), la calcule à la demande plutôt que de renvoyer vide en
// attendant la nuit prochaine. Partagée par /ligues et le widget "Rivaux" du
// dashboard (Sprint 14) — auparavant dupliquée dans app/(authenticated)/ligues/page.tsx.
export async function findOrCreateMyCohortId(
  admin: SupabaseClient,
  userId: string,
  weekStartStr: string,
  weekStart: Date,
  weekEnd: Date
): Promise<string | null> {
  const existing = await findMyCohortId(admin, userId, weekStartStr);
  if (existing) return existing;

  await computeTierCohortsForWeek(admin, weekStart, weekEnd);

  // Un très léger délai de cohérence lecture-après-écriture a été observé
  // ponctuellement juste après l'insertion (PostgREST/pooler Supabase) :
  // une seconde tentative après une courte pause absorbe ce cas plutôt que
  // d'afficher une cohorte vide alors qu'elle vient d'être créée.
  const firstAttempt = await findMyCohortId(admin, userId, weekStartStr);
  if (firstAttempt) return firstAttempt;

  await new Promise((resolve) => setTimeout(resolve, 300));
  return findMyCohortId(admin, userId, weekStartStr);
}

export async function getCohortMembers(
  admin: SupabaseClient,
  cohortId: string
): Promise<CohortMemberInfo[]> {
  const { data, error } = await admin
    .from("cohort_members")
    .select(
      "user_id, week_points, rank, movement, users!inner(strava_firstname, strava_lastname, strava_profile_photo_url, country_code)"
    )
    .eq("cohort_id", cohortId)
    .order("rank", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .map((row) => ({ ...row, user: extractCohortUser(row.users) }))
    .filter((row): row is typeof row & { user: CohortMemberProfile } => row.user !== null);
}
