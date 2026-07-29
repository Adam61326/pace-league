import { Avatar } from "@/components/avatar";
import { CoachInvitationActions } from "@/components/coach-invitation-actions";
import { CoachLeaveButton } from "@/components/coach-leave-button";
import { PerformanceRadar } from "@/components/performance-radar";
import { TierBadge } from "@/components/tier-badge";
import { getCoachedAthletes, getMyCoach, getPendingCoachInvitations, getSentCoachInvitations } from "@/lib/coach";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { getPublicProfileData } from "@/lib/profile-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TIER_META } from "@/lib/tiers";
import { IconMailForward, IconUserPlus, IconUserStar, IconUsers } from "@tabler/icons-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const CATEGORY_LABELS: Record<string, string> = {
  distance: "Distance",
  dplus: "Dénivelé (D+)",
  regularity: "Régularité",
  performance: "Performance",
};

const CATEGORY_ORDER = ["distance", "dplus", "regularity", "performance"];

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

// Vue Coach (Sprint 19) : n'importe quel utilisateur peut coacher, page à
// double audience (comme /clubs) — la même personne peut à la fois être
// coachée (section "Ma relation coach") et coach d'autres coureurs (section
// "Mes coureurs coachés"). Le profil d'un coureur coaché réutilise
// getPublicProfileData tel quel (mêmes données que /profil/[id] et
// /dashboard) : aucune nouvelle logique de calcul.
export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/coach");
  }

  const admin = createAdminClient();
  const [pendingInvitations, myCoach, coachedAthletes, sentInvitations] = await Promise.all([
    getPendingCoachInvitations(admin, user.id),
    getMyCoach(admin, user.id),
    getCoachedAthletes(admin, user.id),
    getSentCoachInvitations(admin, user.id),
  ]);

  const params = await searchParams;
  const requestedAthleteId = typeof params.athlete === "string" ? params.athlete : undefined;
  const selectedAthleteId =
    (requestedAthleteId && coachedAthletes.some((a) => a.athleteId === requestedAthleteId)
      ? requestedAthleteId
      : coachedAthletes[0]?.athleteId) ?? null;

  const selectedProfile = selectedAthleteId ? await getPublicProfileData(admin, selectedAthleteId) : null;

  const badgesByCategory = selectedProfile
    ? CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        items: selectedProfile.badges.filter((b) => b.category === category),
      })).filter((c) => c.items.length > 0)
    : [];

  const statTiles = selectedProfile
    ? [
        { label: "Distance", value: `${selectedProfile.weekly.totalKm.toFixed(1)} km` },
        { label: "D+", value: `${Math.round(selectedProfile.weekly.totalDplus)} m` },
        { label: "Sorties", value: String(selectedProfile.weekly.totalRuns) },
        { label: "Allure moy.", value: formatPace(selectedProfile.weekly.avgPaceSecPerKm) },
      ]
    : [];

  const hasNothing =
    pendingInvitations.length === 0 && !myCoach && coachedAthletes.length === 0 && sentInvitations.length === 0;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vue Coach</h1>
          <p className="text-sm text-foreground-secondary">
            Suis la progression des coureurs que tu coaches, et gère ta propre relation coach.
          </p>
        </div>

        {pendingInvitations.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
              <IconMailForward size={16} stroke={1.75} />
              Invitation reçue
            </h2>
            <div className="flex flex-col gap-3">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-3">
                    <Avatar
                      userId={invitation.coach?.id ?? invitation.id}
                      photoUrl={invitation.coach?.photoUrl ?? null}
                      firstname={invitation.coach?.firstname ?? null}
                      lastname={invitation.coach?.lastname ?? null}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {invitation.coach
                          ? formatDisplayName(invitation.coach.displayName, invitation.coach.firstname, invitation.coach.lastname)
                          : "Un coach"}
                      </p>
                      <p className="text-xs text-foreground-secondary">propose de devenir ton coach</p>
                    </div>
                  </div>
                  <CoachInvitationActions invitationId={invitation.id} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Ma relation coach</h2>
          {myCoach ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <Avatar
                userId={myCoach.coach?.id ?? myCoach.coachId}
                photoUrl={myCoach.coach?.photoUrl ?? null}
                firstname={myCoach.coach?.firstname ?? null}
                lastname={myCoach.coach?.lastname ?? null}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {myCoach.coach
                    ? formatDisplayName(myCoach.coach.displayName, myCoach.coach.firstname, myCoach.coach.lastname)
                    : "Coach"}
                </p>
                <p className="text-xs text-foreground-secondary">Coach depuis le {formatDate(myCoach.startedAt)}</p>
              </div>
              <CoachLeaveButton />
            </div>
          ) : (
            <p className="text-sm text-foreground-secondary">Tu n&apos;as pas de coach actuellement.</p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
              <IconUsers size={16} stroke={1.75} />
              Mes coureurs coachés
            </h2>
            <Link
              href={`/recherche?coach=${user.id}`}
              className="gradient-signature flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <IconUserPlus size={14} />
              Inviter un coureur
            </Link>
          </div>

          {coachedAthletes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border py-12 text-center">
              <IconUserStar size={28} className="text-foreground-tertiary" />
              <p className="text-sm text-foreground-secondary">
                Tu ne coaches personne pour le moment — invite un coureur depuis la recherche.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {coachedAthletes.map((athlete) => {
                  const isActive = athlete.athleteId === selectedAthleteId;
                  return (
                    <Link
                      key={athlete.athleteId}
                      href={`/coach?athlete=${athlete.athleteId}`}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive ? "bg-accent/15 text-accent" : "border border-border text-foreground-secondary hover:bg-white/[.06]"
                      }`}
                    >
                      <Avatar
                        userId={athlete.athleteId}
                        photoUrl={athlete.athlete?.photoUrl ?? null}
                        firstname={athlete.athlete?.firstname ?? null}
                        lastname={athlete.athlete?.lastname ?? null}
                        size={22}
                      />
                      {athlete.athlete
                        ? formatDisplayName(athlete.athlete.displayName, athlete.athlete.firstname, athlete.athlete.lastname)
                        : "Coureur"}
                    </Link>
                  );
                })}
              </div>

              {selectedProfile && (
                <div className="flex flex-col gap-8 rounded-2xl border border-border bg-surface p-6">
                  <div className="flex flex-wrap items-center gap-6">
                    <Avatar
                      userId={selectedProfile.user.id}
                      photoUrl={selectedProfile.user.photoUrl}
                      firstname={selectedProfile.user.firstname}
                      lastname={selectedProfile.user.lastname}
                      size={64}
                    />
                    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                      <p className="font-display text-xl font-semibold tracking-tight text-foreground">
                        {formatDisplayName(
                          selectedProfile.user.displayName,
                          selectedProfile.user.firstname,
                          selectedProfile.user.lastname
                        )}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-foreground-secondary">
                        <span aria-hidden>{getCountryFlag(selectedProfile.user.countryCode)}</span>
                        <span className={TIER_META[selectedProfile.tier].colorClass}>
                          {TIER_META[selectedProfile.tier].label}
                        </span>
                      </div>
                    </div>
                    <TierBadge tier={selectedProfile.tier} size={56} />
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">
                      Cette semaine
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {statTiles.map((tile) => (
                        <div key={tile.label} className="flex flex-col gap-2 rounded-[10px] border border-border p-4">
                          <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                            {tile.value}
                          </span>
                          <span className="text-xs text-foreground-secondary">{tile.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">
                      Performance
                    </h3>
                    <div className="flex justify-center">
                      <PerformanceRadar axes={selectedProfile.performanceAxes} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">Badges</h3>
                    {badgesByCategory.length === 0 ? (
                      <p className="text-sm text-foreground-secondary">Pas encore de badge débloqué.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {badgesByCategory.map((cat) => (
                          <div key={cat.category} className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold tracking-wide text-foreground-tertiary uppercase">
                              {cat.label}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {cat.items.map((badge) => (
                                <span
                                  key={badge.key}
                                  className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-foreground"
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {sentInvitations.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
              <IconMailForward size={16} stroke={1.75} />
              Invitations envoyées en attente
            </h2>
            <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
              {sentInvitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Avatar
                    userId={invitation.athlete?.id ?? invitation.id}
                    photoUrl={invitation.athlete?.photoUrl ?? null}
                    firstname={invitation.athlete?.firstname ?? null}
                    lastname={invitation.athlete?.lastname ?? null}
                    size={32}
                  />
                  <span className="flex-1 font-medium text-foreground">
                    {invitation.athlete
                      ? formatDisplayName(invitation.athlete.displayName, invitation.athlete.firstname, invitation.athlete.lastname)
                      : "Coureur"}
                  </span>
                  <span className="text-xs text-foreground-tertiary">Invité le {formatDate(invitation.createdAt)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {hasNothing && (
          <p className="text-sm text-foreground-tertiary">
            Aucune activité coach pour le moment — invite un coureur depuis la recherche, ou attends
            une invitation.
          </p>
        )}
      </div>
    </div>
  );
}
