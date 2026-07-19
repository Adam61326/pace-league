import { getWeekBounds, toDateString } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

function formatDisplayName(firstname: string | null, lastname: string | null): string {
  if (!firstname) return "Coureur Strava";
  const lastInitial = lastname ? `${lastname.charAt(0).toUpperCase()}.` : "";
  return [firstname, lastInitial].filter(Boolean).join(" ");
}

function initials(firstname: string | null, lastname: string | null): string {
  if (!firstname) return "?";
  return [firstname.charAt(0), lastname?.charAt(0)]
    .filter(Boolean)
    .join("")
    .toUpperCase();
}

interface MemberRow {
  user_id: string;
  strava_firstname: string | null;
  strava_lastname: string | null;
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
    .select("user_id, users(strava_firstname, strava_lastname)")
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

  const leaderboard: MemberRow[] = (members ?? [])
    .map((m) => {
      const profile = Array.isArray(m.users) ? m.users[0] : m.users;
      return {
        user_id: m.user_id,
        strava_firstname: profile?.strava_firstname ?? null,
        strava_lastname: profile?.strava_lastname ?? null,
        total_points: pointsByUser.get(m.user_id) ?? 0,
      };
    })
    .sort((a, b) => b.total_points - a.total_points);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{league.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Code : <span className="font-mono tracking-widest">{league.code}</span> · Semaine du{" "}
            {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
            {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
          </p>
        </div>

        <ol className="flex flex-col divide-y divide-black/[.08] rounded-md border border-black/[.08] dark:divide-white/[.145] dark:border-white/[.145]">
          {leaderboard.map((member, index) => {
            const isMe = member.user_id === user.id;
            return (
              <li
                key={member.user_id}
                className={`flex items-center gap-3 px-4 py-3 text-sm ${
                  isMe ? "bg-black/[.04] dark:bg-white/[.06]" : ""
                }`}
              >
                <span className="w-6 text-right text-zinc-500 dark:text-zinc-400">
                  {index + 1}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                  {initials(member.strava_firstname, member.strava_lastname)}
                </span>
                <span className="flex-1 font-medium">
                  {formatDisplayName(member.strava_firstname, member.strava_lastname)}
                  {isMe && <span className="text-zinc-500 dark:text-zinc-400"> (toi)</span>}
                </span>
                <span className="font-semibold">{member.total_points} pts</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
