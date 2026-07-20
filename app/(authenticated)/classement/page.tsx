import { Avatar } from "@/components/avatar";
import { StreakBadge } from "@/components/streak-badge";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { getStreaks } from "@/lib/streak";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// Filet de sécurité simple, pas une vraie pagination (hors scope de ce sprint).
const MAX_ROWS = 200;

interface LeaderboardUser {
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
  country_code: string;
}

interface LeaderboardRow {
  user_id: string;
  total_points: number;
  users: LeaderboardUser | LeaderboardUser[] | null;
}

function extractUser(users: LeaderboardRow["users"]): LeaderboardUser | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

export default async function ClassementPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/classement");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("country_code")
    .eq("id", user.id)
    .single();

  const params = await searchParams;
  const scope = params.scope === "monde" ? "monde" : "pays";

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);

  // Le classement mélange les coureurs de tous les pays : on ne peut pas
  // passer par le client authentifié (RLS ne laisse chacun voir que sa
  // propre ligne dans users). Le client admin est utilisé côté serveur
  // uniquement, en ne sélectionnant volontairement que des colonnes non
  // sensibles (jamais email ni tokens Strava).
  const admin = createAdminClient();

  let query = admin
    .from("weekly_scores")
    .select(
      "user_id, total_points, users!inner(strava_firstname, strava_lastname, strava_profile_photo_url, country_code)"
    )
    .eq("week_start_date", weekStartStr)
    .order("total_points", { ascending: false })
    .limit(MAX_ROWS);

  if (scope === "pays" && profile?.country_code) {
    query = query.eq("users.country_code", profile.country_code);
  }

  const { data: rows } = await query;

  const leaderboard = (rows ?? [])
    .map((row) => ({ ...row, user: extractUser(row.users) }))
    .filter((row): row is typeof row & { user: LeaderboardUser } => row.user !== null);

  const streaks = await getStreaks(
    admin,
    leaderboard.map((row) => row.user_id)
  );

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Classement</h1>
          <p className="text-sm text-zinc-400">
            Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
            {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/classement?scope=pays"
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              scope === "pays"
                ? "bg-accent text-black"
                : "border border-white/10 text-zinc-300 hover:bg-white/[.06]"
            }`}
          >
            Mon pays
          </Link>
          <Link
            href="/classement?scope=monde"
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              scope === "monde"
                ? "bg-accent text-black"
                : "border border-white/10 text-zinc-300 hover:bg-white/[.06]"
            }`}
          >
            Monde
          </Link>
        </div>

        {leaderboard.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Aucun coureur classé cette semaine pour le moment.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
            {leaderboard.map((row, index) => {
              const isMe = row.user_id === user.id;
              const streakDays = streaks.get(row.user_id) ?? 0;
              return (
                <li
                  key={row.user_id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${
                    isMe ? "bg-white/[.06]" : ""
                  }`}
                >
                  <span className="w-6 text-right text-zinc-400">{index + 1}</span>
                  <Avatar
                    userId={row.user_id}
                    photoUrl={row.user.strava_profile_photo_url}
                    firstname={row.user.strava_firstname}
                    lastname={row.user.strava_lastname}
                    size={28}
                  />
                  <span aria-hidden>{getCountryFlag(row.user.country_code)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-white">
                      {formatDisplayName(row.user.strava_firstname, row.user.strava_lastname)}
                      {isMe && <span className="text-zinc-400"> (toi)</span>}
                    </span>
                    {streakDays > 0 && (
                      <span className="block">
                        <StreakBadge days={streakDays} />
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-white">{row.total_points} pts</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
