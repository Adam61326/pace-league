import { Avatar } from "@/components/avatar";
import { SubTabs } from "@/components/sub-tabs";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import {
  findOrCreateMyCohortId,
  getCohortMembers,
  getOrCreatePlayerTier,
  TIER_META,
  type Tier,
} from "@/lib/tiers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { IconCrown, IconCrownFilled, IconDiamondFilled, IconMedal } from "@tabler/icons-react";
import { redirect } from "next/navigation";

const LEAGUES_TABS = [
  { href: "/ligues", label: "Mon palier" },
  { href: "/ligues-privees", label: "Privées" },
];

function TierIcon({ tier, className }: { tier: Tier; className?: string }) {
  if (tier === "legend") return <IconCrownFilled className={className} />;
  if (tier === "master") return <IconCrown className={className} />;
  if (tier === "diamond") return <IconDiamondFilled className={className} />;
  return <IconMedal className={className} />;
}

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

  const meta = TIER_META[tier];
  const hasMovementZones = members.some((m) => m.movement !== "stable");

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${meta.bgClass}`}>
              <TierIcon tier={tier} className={`h-6 w-6 ${meta.colorClass}`} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">{meta.label}</h1>
              <p className="text-sm text-zinc-400">
                Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
                {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
              </p>
            </div>
          </div>
          <SubTabs tabs={LEAGUES_TABS} activeHref="/ligues" />
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Pas encore de cohorte cette semaine : marque au moins une activité pour rejoindre ton
            palier {meta.label}.
          </p>
        ) : (
          <>
            <ol className="flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
              {members.map((row) => {
                const isMe = row.user_id === user.id;
                return (
                  <li
                    key={row.user_id}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${
                      row.movement === "promoted"
                        ? "bg-green-500/10"
                        : row.movement === "relegated"
                          ? "bg-red-500/10"
                          : isMe
                            ? "bg-white/[.06]"
                            : ""
                    }`}
                  >
                    <span className="w-6 text-right text-zinc-400">{row.rank}</span>
                    <Avatar
                      userId={row.user_id}
                      photoUrl={row.user.strava_profile_photo_url}
                      firstname={row.user.strava_firstname}
                      lastname={row.user.strava_lastname}
                      size={28}
                    />
                    <span aria-hidden>{getCountryFlag(row.user.country_code)}</span>
                    <span className="flex-1 font-medium text-white">
                      {formatDisplayName(row.user.strava_firstname, row.user.strava_lastname)}
                      {isMe && <span className="text-zinc-400"> (toi)</span>}
                    </span>
                    <span className="w-20 text-right font-semibold text-white">
                      {row.week_points} pts
                    </span>
                  </li>
                );
              })}
            </ol>

            {hasMovementZones ? (
              <div className="flex flex-col gap-1 text-xs text-zinc-400">
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
              <p className="text-xs text-zinc-400">
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
