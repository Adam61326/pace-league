import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { StreakBadge } from "@/components/streak-badge";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { getStreaks } from "@/lib/streak";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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

interface PublicStats {
  connected_users: number;
  countries_count: number;
  total_km: number;
}

const numberFormatter = new Intl.NumberFormat("fr-FR");

function extractUser(users: LeaderboardRow["users"]): LeaderboardUser | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

// "/" est la page d'accueil publique ET le classement mondial des
// utilisateurs connectés (Sprint 11) : un seul et même contenu, avec juste
// le "toi" et le toggle mon pays/monde en plus pour un visiteur authentifié.
// L'auth layout ((authenticated)/layout.tsx) n'affiche déjà la navbar que si
// `user` existe, donc pas de logique de redirection ici.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;

  let viewerCountryCode: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("country_code")
      .eq("id", user.id)
      .single();
    viewerCountryCode = profile?.country_code ?? null;
  }

  // Un visiteur anonyme n'a pas de pays associé : toujours "monde" pour lui.
  // Pour un utilisateur connecté, reproduit le comportement précédent de
  // /classement (défaut "pays", sauf ?scope=monde explicite).
  const effectiveScope: "monde" | "pays" =
    !user ? "monde" : params.scope === "monde" ? "monde" : "pays";

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);

  // Le classement mélange les coureurs de tous les pays : on ne peut pas
  // passer par le client authentifié (RLS ne laisse chacun voir que sa
  // propre ligne dans users, et un visiteur anonyme n'a de toute façon pas
  // de session). Le client admin est utilisé côté serveur uniquement, en ne
  // sélectionnant volontairement que des colonnes non sensibles (jamais
  // email ni tokens Strava) — cette page est publique.
  const admin = createAdminClient();

  let query = admin
    .from("weekly_scores")
    .select(
      "user_id, total_points, users!inner(strava_firstname, strava_lastname, strava_profile_photo_url, country_code)"
    )
    .eq("week_start_date", weekStartStr)
    .order("total_points", { ascending: false })
    .limit(MAX_ROWS);

  if (effectiveScope === "pays" && viewerCountryCode) {
    query = query.eq("users.country_code", viewerCountryCode);
  }

  const { data: rows } = await query;

  const leaderboard = (rows ?? [])
    .map((row) => ({ ...row, user: extractUser(row.users) }))
    .filter((row): row is typeof row & { user: LeaderboardUser } => row.user !== null);

  const streaks = await getStreaks(
    admin,
    leaderboard.map((row) => row.user_id)
  );

  let publicStats: PublicStats | undefined;
  if (!user) {
    const { data } = await supabase.rpc("get_public_stats").maybeSingle<PublicStats>();
    publicStats = data ?? undefined;
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      {!user && (
        <>
          <header className="border-b border-white/10">
            <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
              <Logo />
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[.06] hover:text-white"
                >
                  Se connecter
                </Link>
                <Link
                  href="/signup"
                  className="flex h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
                >
                  Créer un compte
                </Link>
              </div>
            </div>
          </header>

          <section className="relative flex flex-col items-center gap-3 overflow-hidden border-b border-white/10 px-6 py-8 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute top-[-10rem] left-1/2 h-[20rem] w-[36rem] -translate-x-1/2 rounded-full opacity-20 blur-[100px]"
              style={{
                background: "radial-gradient(circle, #39D353 0%, #4D96FF 45%, transparent 75%)",
              }}
            />
            <p className="relative max-w-xl text-lg font-medium text-white sm:text-xl">
              Chaque foulée compte, pour toi et pour ton pays
            </p>
            <Link
              href="/signup"
              className="relative flex h-11 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
            >
              Rejoindre gratuitement
            </Link>
            {publicStats && (
              <p className="relative text-xs text-zinc-500">
                {numberFormatter.format(publicStats.connected_users)} coureurs connectés ·{" "}
                {numberFormatter.format(publicStats.countries_count)} pays représentés ·{" "}
                {numberFormatter.format(Math.round(publicStats.total_km))} km cumulés
              </p>
            )}
          </section>
        </>
      )}

      <div className="flex flex-1 flex-col items-center gap-8 px-6 py-16">
        <div className="flex w-full max-w-2xl flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Classement</h1>
            <p className="text-sm text-zinc-400">
              Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
              {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
            </p>
          </div>

          {user && (
            <div className="flex gap-2">
              <Link
                href="/?scope=pays"
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  effectiveScope === "pays"
                    ? "bg-accent text-black"
                    : "border border-white/10 text-zinc-300 hover:bg-white/[.06]"
                }`}
              >
                Mon pays
              </Link>
              <Link
                href="/?scope=monde"
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  effectiveScope === "monde"
                    ? "bg-accent text-black"
                    : "border border-white/10 text-zinc-300 hover:bg-white/[.06]"
                }`}
              >
                Monde
              </Link>
            </div>
          )}

          {leaderboard.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun coureur classé cette semaine pour le moment.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
              {leaderboard.map((row, index) => {
                const isMe = user != null && row.user_id === user.id;
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
                    <span className="min-w-0 flex-1">
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
    </div>
  );
}
