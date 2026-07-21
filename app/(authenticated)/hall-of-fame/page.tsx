import { Avatar } from "@/components/avatar";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { createAdminClient } from "@/lib/supabase/admin";

// Filet de sécurité simple, pas une vraie pagination (hors scope de ce sprint).
const MAX_WEEKS = 52;

interface HallOfFameUser {
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
  country_code: string;
}

interface HallOfFameRow {
  week_start_date: string;
  rank: number;
  total_points: number;
  user_id: string;
  users: HallOfFameUser | HallOfFameUser[] | null;
}

function extractUser(users: HallOfFameRow["users"]): HallOfFameUser | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

const MEDAL_EMOJI: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Page publique (pas de vérification de session, comme "/"). Client admin
// nécessaire pour afficher le nom d'autres utilisateurs : RLS sur `users` ne
// laisse chacun voir que sa propre ligne (voir app/(authenticated)/page.tsx,
// même contrainte pour le classement mondial).
export default async function HallOfFamePage() {
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("hall_of_fame")
    .select(
      "week_start_date, rank, total_points, user_id, users!inner(strava_firstname, strava_lastname, strava_profile_photo_url, country_code)"
    )
    .order("week_start_date", { ascending: false })
    .order("rank", { ascending: true })
    .limit(MAX_WEEKS * 3)
    .returns<HallOfFameRow[]>();

  const byWeek = new Map<string, (HallOfFameRow & { user: HallOfFameUser })[]>();
  for (const row of rows ?? []) {
    const u = extractUser(row.users);
    if (!u) continue;
    const list = byWeek.get(row.week_start_date) ?? [];
    list.push({ ...row, user: u });
    byWeek.set(row.week_start_date, list);
  }

  const weeks = Array.from(byWeek.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Hall of Fame</h1>
          <p className="text-sm text-zinc-400">
            Le top 3 mondial de chaque semaine terminée, tous paliers confondus.
          </p>
        </div>

        {weeks.length === 0 ? (
          <p className="text-sm text-zinc-400">Pas encore de semaine archivée.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {weeks.map(([weekStart, medalists]) => (
              <section key={weekStart} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
                  Semaine du{" "}
                  {new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("fr-FR", {
                    timeZone: "UTC",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <ol className="flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
                  {medalists
                    .sort((a, b) => a.rank - b.rank)
                    .map((row) => (
                      <li key={row.rank} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <span className="w-6 text-lg" aria-hidden>
                          {MEDAL_EMOJI[row.rank] ?? row.rank}
                        </span>
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
                        </span>
                        <span className="font-semibold text-white">
                          {Number(row.total_points).toFixed(1)} pts
                        </span>
                      </li>
                    ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
