import type { SupabaseClient } from "@supabase/supabase-js";
import type { PerformanceAxis } from "@/lib/performance";
import { computePerformanceAxes } from "@/lib/performance";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { getOrCreatePlayerTier, type Tier } from "@/lib/tiers";
import { getWeeklyUserSummary, type WeeklyUserSummary } from "@/lib/weekly-stats";

export interface PublicProfileUser {
  id: string;
  displayName: string | null;
  firstname: string | null;
  lastname: string | null;
  photoUrl: string | null;
  countryCode: string;
}

export interface EarnedBadge {
  key: string;
  category: string;
  label: string;
  earnedAt: string;
}

export interface PublicProfileData {
  user: PublicProfileUser;
  tier: Tier;
  weekly: WeeklyUserSummary;
  performanceAxes: PerformanceAxis[];
  badges: EarnedBadge[];
}

interface BadgeRow {
  badge_key: string;
  earned_at: string;
  badges: { label: string; category: string } | { label: string; category: string }[] | null;
}

// Assemble les données d'un profil public (Sprint 16) : réutilisé par
// app/(authenticated)/profil/[id]/page.tsx (page complète) et
// app/api/profil/[id]/route.ts (JSON du panel slide-in), pour ne jamais
// dupliquer ces requêtes à deux endroits. `admin` requis : ces données
// concernent potentiellement un autre utilisateur que le visiteur courant,
// hors de portée de RLS (même contrainte que /classement, /ligues, etc.).
export async function getPublicProfileData(
  admin: SupabaseClient,
  userId: string
): Promise<PublicProfileData | null> {
  const { data: profile } = await admin
    .from("users")
    .select(
      "id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url, country_code, hr_max, hr_rest"
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekEnd);

  const [tier, weekly, performanceAxes, badgeRows] = await Promise.all([
    getOrCreatePlayerTier(admin, userId),
    getWeeklyUserSummary(admin, userId, weekStartStr, weekEndStr),
    computePerformanceAxes(admin, userId, profile.hr_max ?? null, profile.hr_rest ?? null),
    admin
      .from("user_badges")
      .select("badge_key, earned_at, badges(label, category)")
      .eq("user_id", userId)
      .order("earned_at", { ascending: false })
      .returns<BadgeRow[]>(),
  ]);

  const badges: EarnedBadge[] = (badgeRows.data ?? []).map((row) => {
    const badge = Array.isArray(row.badges) ? row.badges[0] : row.badges;
    return {
      key: row.badge_key,
      category: badge?.category ?? "distance",
      label: badge?.label ?? row.badge_key,
      earnedAt: row.earned_at,
    };
  });

  return {
    user: {
      id: profile.id,
      displayName: profile.display_name,
      firstname: profile.strava_firstname,
      lastname: profile.strava_lastname,
      photoUrl: profile.strava_profile_photo_url,
      countryCode: profile.country_code,
    },
    tier,
    weekly,
    performanceAxes,
    badges,
  };
}
