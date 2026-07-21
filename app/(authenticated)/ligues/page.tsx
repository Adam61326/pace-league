import { Avatar } from "@/components/avatar";
import { SubTabs } from "@/components/sub-tabs";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { computeTierCohortsForWeek, getOrCreatePlayerTier, TIER_META, type Tier } from "@/lib/tiers";
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

interface CohortMemberUser {
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
  country_code: string;
}

interface CohortMemberRow {
  user_id: string;
  week_points: number;
  rank: number;
  movement: "promoted" | "relegated" | "stable";
  users: CohortMemberUser | CohortMemberUser[] | null;
}

function extractUser(users: CohortMemberRow["users"]): CohortMemberUser | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

// Retrouve la cohorte de l'utilisateur pour cette semaine ; si aucune
// cohorte n'existe encore (première visite avant le premier passage du cron
// sur cette semaine), la calcule à la demande plutôt que d'afficher une page
// vide en attendant la nuit prochaine.
async function findOrCreateMyCohort(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  weekStartStr: string,
  weekStart: Date,
  weekEnd: Date
): Promise<string | null> {
  const findCohortId = async () => {
    const { data, error } = await admin
      .from("cohort_members")
      .select("cohort_id, tier_cohorts!inner(week_start_date)")
      .eq("user_id", userId)
      .eq("tier_cohorts.week_start_date", weekStartStr)
      .maybeSingle();

    if (error) throw error;
    return data?.cohort_id ?? null;
  };

  const existing = await findCohortId();
  if (existing) return existing;

  await computeTierCohortsForWeek(admin, weekStart, weekEnd);

  // Un très léger délai de cohérence lecture-après-écriture a été observé
  // ponctuellement juste après l'insertion (PostgREST/pooler Supabase) :
  // une seconde tentative après une courte pause absorbe ce cas plutôt que
  // d'afficher une cohorte vide alors qu'elle vient d'être créée.
  const firstAttempt = await findCohortId();
  if (firstAttempt) return firstAttempt;

  await new Promise((resolve) => setTimeout(resolve, 300));
  return findCohortId();
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

  const cohortId = await findOrCreateMyCohort(admin, user.id, weekStartStr, weekStart, weekEnd);

  let members: (CohortMemberRow & { user: CohortMemberUser })[] = [];
  if (cohortId) {
    const { data: rows } = await admin
      .from("cohort_members")
      .select(
        "user_id, week_points, rank, movement, users!inner(strava_firstname, strava_lastname, strava_profile_photo_url, country_code)"
      )
      .eq("cohort_id", cohortId)
      .order("rank", { ascending: true })
      .returns<CohortMemberRow[]>();

    members = (rows ?? [])
      .map((row) => ({ ...row, user: extractUser(row.users) }))
      .filter((row): row is typeof row & { user: CohortMemberUser } => row.user !== null);
  }

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
