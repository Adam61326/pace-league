import { getCountryFlag } from "@/lib/countries";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// Filet de sécurité simple, pas une vraie pagination (hors scope de ce sprint).
const MAX_ROWS = 200;

function formatDisplayName(firstname: string | null, lastname: string | null): string {
  if (!firstname) return "Coureur Strava";
  const lastInitial = lastname ? `${lastname.charAt(0).toUpperCase()}.` : "";
  return [firstname, lastInitial].filter(Boolean).join(" ");
}

interface LeaderboardUser {
  strava_firstname: string | null;
  strava_lastname: string | null;
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
    .select("user_id, total_points, users!inner(strava_firstname, strava_lastname, country_code)")
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

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Classement</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
            {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/classement?scope=pays"
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              scope === "pays"
                ? "bg-foreground text-background"
                : "border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            }`}
          >
            Mon pays
          </Link>
          <Link
            href="/classement?scope=monde"
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              scope === "monde"
                ? "bg-foreground text-background"
                : "border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            }`}
          >
            Monde
          </Link>
        </div>

        {leaderboard.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aucun coureur classé cette semaine pour le moment.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-black/[.08] rounded-md border border-black/[.08] dark:divide-white/[.145] dark:border-white/[.145]">
            {leaderboard.map((row, index) => {
              const isMe = row.user_id === user.id;
              return (
                <li
                  key={row.user_id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${
                    isMe ? "bg-black/[.04] dark:bg-white/[.06]" : ""
                  }`}
                >
                  <span className="w-6 text-right text-zinc-500 dark:text-zinc-400">
                    {index + 1}
                  </span>
                  <span aria-hidden>{getCountryFlag(row.user.country_code)}</span>
                  <span className="flex-1 font-medium">
                    {formatDisplayName(row.user.strava_firstname, row.user.strava_lastname)}
                    {isMe && <span className="text-zinc-500 dark:text-zinc-400"> (toi)</span>}
                  </span>
                  <span className="font-semibold">{row.total_points} pts</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
