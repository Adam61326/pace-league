import { LeaderboardList, type LeaderboardRowData } from "@/components/leaderboard-list";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getDisplayTitles } from "@/lib/titles";
import { notFound, redirect } from "next/navigation";

interface MemberRow {
  user_id: string;
  display_name: string | null;
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
  total_points: number;
}

export default async function LiguePriveePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/ligues-privees/${id}`);
  }

  // RLS ("members can view their leagues") ne renvoie cette ligue que si
  // l'utilisateur courant en est membre.
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, code")
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  // Le classement mélange les scores de tous les membres : ça nécessite le
  // client admin (RLS sur weekly_scores/users ne laisse chacun voir que sa
  // propre ligne), comme pour /classement.
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("league_members")
    .select("user_id, users(display_name, strava_firstname, strava_lastname, strava_profile_photo_url)")
    .eq("league_id", id);

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);

  const { data: scores } = await admin
    .from("weekly_scores")
    .select("user_id, total_points")
    .eq("week_start_date", weekStartStr)
    .in(
      "user_id",
      (members ?? []).map((m) => m.user_id)
    );

  const pointsByUser = new Map((scores ?? []).map((s) => [s.user_id, Number(s.total_points)]));
  const titles = await getDisplayTitles(
    admin,
    (members ?? []).map((m) => m.user_id)
  );

  const leaderboard: MemberRow[] = (members ?? [])
    .map((m) => {
      const profile = Array.isArray(m.users) ? m.users[0] : m.users;
      return {
        user_id: m.user_id,
        display_name: profile?.display_name ?? null,
        strava_firstname: profile?.strava_firstname ?? null,
        strava_lastname: profile?.strava_lastname ?? null,
        strava_profile_photo_url: profile?.strava_profile_photo_url ?? null,
        total_points: pointsByUser.get(m.user_id) ?? 0,
      };
    })
    .sort((a, b) => b.total_points - a.total_points);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {league.name}
          </h1>
          <p className="text-sm text-foreground-secondary">
            Code : <span className="font-mono tracking-widest text-foreground">{league.code}</span> · Semaine du{" "}
            {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
            {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
          </p>
        </div>

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
              titleLabel: titles.get(member.user_id)?.label ?? null,
              points: member.total_points,
              isMe: member.user_id === user.id,
            })
          )}
        />
      </div>
    </div>
  );
}
