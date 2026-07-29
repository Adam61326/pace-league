import { LeaderboardList, type LeaderboardRowData } from "@/components/leaderboard-list";
import { SubTabs } from "@/components/sub-tabs";
import { TierBadge } from "@/components/tier-badge";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { findOrCreateMyCohortId, getCohortMembers, getOrCreatePlayerTier, TIER_META } from "@/lib/tiers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getDisplayTitles } from "@/lib/titles";
import { redirect } from "next/navigation";

const LEAGUES_TABS = [
  { href: "/ligues", label: "Mon palier" },
  { href: "/ligues-privees", label: "Privées" },
];

export default async function LiguesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/ligues");
  }

  const admin = createAdminClient();
  const tier = await getOrCreatePlayerTier(admin, user.id);

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);

  const cohortId = await findOrCreateMyCohortId(admin, user.id, weekStartStr, weekStart, weekEnd);
  const members = cohortId ? await getCohortMembers(admin, cohortId) : [];
  const titles = await getDisplayTitles(
    admin,
    members.map((m) => m.user_id)
  );

  const meta = TIER_META[tier];
  const hasMovementZones = members.some((m) => m.movement !== "stable");

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <TierBadge tier={tier} size={48} />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                {meta.label}
              </h1>
              <p className="text-sm text-foreground-secondary">
                Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
                {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
              </p>
            </div>
          </div>
          <SubTabs tabs={LEAGUES_TABS} activeHref="/ligues" />
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-foreground-secondary">
            Pas encore de cohorte cette semaine : marque au moins une activité pour rejoindre ton
            palier {meta.label}.
          </p>
        ) : (
          <>
            <LeaderboardList
              rows={members.map(
                (row): LeaderboardRowData => ({
                  userId: row.user_id,
                  rank: row.rank,
                  displayName: row.user.display_name,
                  firstname: row.user.strava_firstname,
                  lastname: row.user.strava_lastname,
                  photoUrl: row.user.strava_profile_photo_url,
                  countryCode: row.user.country_code,
                  titleLabel: titles.get(row.user_id)?.label ?? null,
                  points: row.week_points,
                  isMe: row.user_id === user.id,
                  highlightClass:
                    row.movement === "promoted"
                      ? "bg-green-500/10"
                      : row.movement === "relegated"
                        ? "bg-red-500/10"
                        : row.user_id === user.id
                          ? "bg-white/[.06]"
                          : undefined,
                })
              )}
            />

            {hasMovementZones ? (
              <div className="flex flex-col gap-1 text-xs text-foreground-secondary">
                <p className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-green-500/10" />
                  Zone de promotion (top 5 : monte de palier en fin de semaine)
                </p>
                <p className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-red-500/10" />
                  Zone de relégation (bottom 5 : descend de palier en fin de semaine)
                </p>
              </div>
            ) : (
              <p className="text-xs text-foreground-secondary">
                Cohorte encore trop petite (moins de 10 joueurs actifs) pour un mouvement de
                palier cette semaine.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
