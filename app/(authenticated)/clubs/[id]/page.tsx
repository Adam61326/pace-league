import { Avatar } from "@/components/avatar";
import { LeaderboardList, type LeaderboardRowData } from "@/components/leaderboard-list";
import { formatDisplayName } from "@/lib/display-name";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { IconMailForward, IconUserPlus } from "@tabler/icons-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

interface MemberRow {
  user_id: string;
  role: "admin" | "member";
  display_name: string | null;
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
  total_points: number;
}

interface PendingInvitationRow {
  id: string;
  created_at: string;
  invited_user_id: string;
  invited_user:
    | { display_name: string | null; strava_firstname: string | null; strava_lastname: string | null }
    | { display_name: string | null; strava_firstname: string | null; strava_lastname: string | null }[]
    | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// Detail d'un club (Sprint 18) : classement interne sur le meme principe que
// /ligues-privees/[id] (weekly_scores agrege par membres), mais via
// club_members - aucune reutilisation de leagues/league_members.
export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/clubs/${id}`);
  }

  // RLS "members can view their clubs" : ne renvoie ce club que si
  // l'utilisateur courant en est membre.
  const { data: club } = await supabase.from("clubs").select("id, name, is_official, description").eq("id", id).maybeSingle();

  if (!club) notFound();

  const { data: myMembership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = myMembership?.role === "admin";

  // Le classement mélange les scores de tous les membres : nécessite le
  // client admin (RLS sur weekly_scores/users ne laisse chacun voir que sa
  // propre ligne), comme pour /ligues-privees/[id].
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("club_members")
    .select("user_id, role, users(display_name, strava_firstname, strava_lastname, strava_profile_photo_url)")
    .eq("club_id", id);

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);

  const memberIds = (members ?? []).map((m) => m.user_id);

  const { data: scores } = await admin
    .from("weekly_scores")
    .select("user_id, total_points")
    .eq("week_start_date", weekStartStr)
    .in("user_id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

  const pointsByUser = new Map((scores ?? []).map((s) => [s.user_id, Number(s.total_points)]));

  const leaderboard: MemberRow[] = (members ?? [])
    .map((m) => {
      const profile = Array.isArray(m.users) ? m.users[0] : m.users;
      return {
        user_id: m.user_id,
        role: m.role as "admin" | "member",
        display_name: profile?.display_name ?? null,
        strava_firstname: profile?.strava_firstname ?? null,
        strava_lastname: profile?.strava_lastname ?? null,
        strava_profile_photo_url: profile?.strava_profile_photo_url ?? null,
        total_points: pointsByUser.get(m.user_id) ?? 0,
      };
    })
    .sort((a, b) => b.total_points - a.total_points);

  // Invitations en cours (admin uniquement) : RLS "club admins can view
  // invitations for their clubs" les rend lisibles via le client normal.
  const { data: pendingInvitations } = isAdmin
    ? await supabase
        .from("club_invitations")
        .select("id, created_at, invited_user_id, invited_user:users!invited_user_id(display_name, strava_firstname, strava_lastname)")
        .eq("club_id", id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .returns<PendingInvitationRow[]>()
    : { data: null };

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground">
              {club.name}
              {club.is_official && (
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent uppercase">
                  Officiel
                </span>
              )}
            </h1>
            {club.description && <p className="mt-1 text-sm text-foreground-secondary">{club.description}</p>}
            <p className="mt-1 text-xs text-foreground-tertiary">
              Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
              {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
            </p>
          </div>
          {isAdmin && (
            <Link
              href={`/recherche?club=${club.id}`}
              className="gradient-signature flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <IconUserPlus size={16} />
              Inviter des membres
            </Link>
          )}
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Classement du club</h2>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-foreground-secondary">Aucun membre pour le moment.</p>
          ) : (
            <LeaderboardList
              rows={leaderboard.map(
                (member, index): LeaderboardRowData => ({
                  userId: member.user_id,
                  rank: index + 1,
                  displayName: member.display_name,
                  firstname: member.strava_firstname,
                  lastname: member.strava_lastname,
                  photoUrl: member.strava_profile_photo_url,
                  countryCode: null,
                  titleLabel: member.role === "admin" ? "Admin" : null,
                  points: member.total_points,
                  isMe: member.user_id === user.id,
                })
              )}
            />
          )}
        </section>

        {isAdmin && (
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
              <IconMailForward size={16} stroke={1.75} />
              Invitations en cours
            </h2>
            {!pendingInvitations || pendingInvitations.length === 0 ? (
              <p className="text-sm text-foreground-secondary">Aucune invitation en attente.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
                {pendingInvitations.map((invitation) => {
                  const invitedUser = Array.isArray(invitation.invited_user)
                    ? invitation.invited_user[0]
                    : invitation.invited_user;
                  return (
                    <div key={invitation.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <Avatar
                        userId={invitation.invited_user_id}
                        photoUrl={null}
                        firstname={invitedUser?.strava_firstname ?? null}
                        lastname={invitedUser?.strava_lastname ?? null}
                        size={32}
                      />
                      <span className="flex-1 font-medium text-foreground">
                        {formatDisplayName(
                          invitedUser?.display_name ?? null,
                          invitedUser?.strava_firstname ?? null,
                          invitedUser?.strava_lastname ?? null
                        )}
                      </span>
                      <span className="text-xs text-foreground-tertiary">
                        Invité le {formatDate(invitation.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
