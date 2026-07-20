import { getCountryName } from "@/lib/countries";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { getStreak } from "@/lib/streak";
import { createClient } from "@/lib/supabase/server";
import {
  IconCalendarCheck,
  IconClock,
  IconMountain,
  IconRoute,
} from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { StravaActions } from "./strava-actions";
import { WeeklyTrend } from "./weekly-trend";

const STRAVA_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Vous avez refusé l'accès à votre compte Strava.",
  invalid_state: "La demande de connexion Strava a expiré ou est invalide, réessayez.",
  exchange_failed: "La connexion à Strava a échoué, réessayez.",
};

const WEEKS_OF_TREND = 4;

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

function pct(points: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((points / total) * 100);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("country_code, strava_athlete_id")
    .eq("id", user.id)
    .single();

  const params = await searchParams;
  const strava = typeof params.strava === "string" ? params.strava : undefined;
  const stravaError =
    typeof params.strava_error === "string" ? params.strava_error : undefined;

  const isStravaConnected = Boolean(profile?.strava_athlete_id);

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekEnd);

  const streakDays = await getStreak(supabase, user.id);

  // Résumé "cette semaine" : toutes les activités synchronisées de la
  // semaine (pas seulement celles qui comptent pour le score — le seuil
  // anti-spam de 1.5km n'exclut qu'une poignée de sorties, la vue d'ensemble
  // reste plus honnête en montrant tout ce qui a été fait).
  const { data: weekActivities } = await supabase
    .from("activities")
    .select("activity_date, distance_km, total_elevation_gain, moving_time_seconds")
    .eq("user_id", user.id)
    .gte("activity_date", weekStartStr)
    .lte("activity_date", weekEndStr);

  const totalKm = (weekActivities ?? []).reduce((sum, a) => sum + Number(a.distance_km ?? 0), 0);
  const totalDplus = (weekActivities ?? []).reduce(
    (sum, a) => sum + Number(a.total_elevation_gain ?? 0),
    0
  );
  const totalMovingTime = (weekActivities ?? []).reduce(
    (sum, a) => sum + (a.moving_time_seconds ?? 0),
    0
  );
  const activeDays = new Set((weekActivities ?? []).map((a) => a.activity_date)).size;
  const avgPaceSecPerKm = totalKm > 0 ? totalMovingTime / totalKm : null;

  // Répartition du score de la semaine, depuis weekly_scores (calculé par le
  // cron quotidien — peut ne pas encore exister le jour même).
  const { data: currentScore } = await supabase
    .from("weekly_scores")
    .select("base_points, distance_points, dplus_points, regularity_bonus, total_points")
    .eq("user_id", user.id)
    .eq("week_start_date", weekStartStr)
    .maybeSingle();

  const basePoints = Number(currentScore?.base_points ?? 0);
  const distancePoints = Number(currentScore?.distance_points ?? 0);
  const dplusPoints = Number(currentScore?.dplus_points ?? 0);
  const regularityBonus = Number(currentScore?.regularity_bonus ?? 0);
  const totalPoints = Number(currentScore?.total_points ?? 0);
  // participation_points n'est pas stocké séparément : dérivé par soustraction.
  const participationPoints = Math.max(0, basePoints - distancePoints - dplusPoints);

  const breakdown = [
    { label: "Distance", points: distancePoints },
    { label: "Dénivelé (D+)", points: dplusPoints },
    { label: "Participation", points: participationPoints },
    { label: "Régularité", points: regularityBonus },
  ];

  // Tendance sur les WEEKS_OF_TREND dernières semaines (semaine en cours incluse).
  const trendWeekStarts: string[] = [];
  for (let i = WEEKS_OF_TREND - 1; i >= 0; i--) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() - i * 7);
    trendWeekStarts.push(toDateString(d));
  }

  const { data: trendRows } = await supabase
    .from("weekly_scores")
    .select("week_start_date, total_points")
    .eq("user_id", user.id)
    .gte("week_start_date", trendWeekStarts[0])
    .lte("week_start_date", weekStartStr);

  const trendByWeek = new Map((trendRows ?? []).map((r) => [r.week_start_date, Number(r.total_points)]));
  const trend = trendWeekStarts.map((ws) => ({
    weekStart: ws,
    totalPoints: trendByWeek.get(ws) ?? 0,
  }));

  return (
    <div className="flex flex-1 flex-col items-center gap-10 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Tableau de bord</h1>
          <p className="text-sm text-zinc-400">
            Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
            {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
          </p>
        </div>

        {strava === "connected" && (
          <p className="rounded-md bg-green-950/60 px-3 py-2 text-sm text-green-300">
            Compte Strava connecté avec succès.
          </p>
        )}
        {stravaError && (
          <p className="rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {STRAVA_ERROR_MESSAGES[stravaError] ?? "Une erreur est survenue."}
          </p>
        )}

        {/* Série en cours (mise en avant) */}
        {streakDays > 0 && (
          <section className="flex items-center gap-4 rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-500/10 to-transparent px-6 py-5">
            <span className="text-4xl" aria-hidden>
              🔥
            </span>
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tracking-tight text-white">
                {streakDays} jour{streakDays > 1 ? "s" : ""} de série
              </span>
              <span className="text-sm text-zinc-400">
                Jours consécutifs avec au moins une activité valide — continue comme ça !
              </span>
            </div>
          </section>
        )}

        {/* Résumé de la semaine */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">Cette semaine</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: IconRoute, label: "Distance", value: `${totalKm.toFixed(1)} km` },
              { icon: IconMountain, label: "D+", value: `${Math.round(totalDplus)} m` },
              { icon: IconCalendarCheck, label: "Jours actifs", value: String(activeDays) },
              { icon: IconClock, label: "Allure moy.", value: formatPace(avgPaceSecPerKm) },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex flex-col gap-2 rounded-md border border-white/10 p-4"
              >
                <Icon size={18} stroke={1.75} className="text-zinc-400" />
                <span className="text-lg font-semibold tracking-tight text-white">{value}</span>
                <span className="text-xs text-zinc-400">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Répartition du score */}
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
              Répartition du score
            </h2>
            <span className="text-sm font-semibold text-white">{totalPoints.toFixed(1)} pts</span>
          </div>
          {totalPoints === 0 ? (
            <p className="text-sm text-zinc-400">
              Pas encore de score calculé cette semaine — ça se met à jour chaque nuit.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {breakdown.map(({ label, points }) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-medium text-white">
                      {points.toFixed(1)} pts <span className="text-zinc-400">({pct(points, totalPoints)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[.08]">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${pct(points, totalPoints)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tendance 4 semaines */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
            Tendance ({WEEKS_OF_TREND} dernières semaines)
          </h2>
          <WeeklyTrend trend={trend} />
        </section>

        {/* Mon profil (discret) */}
        <section className="flex flex-col gap-3 border-t border-white/10 pt-8">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Mon profil
          </h2>
          <div className="flex flex-col gap-2 rounded-md border border-white/10 p-4 text-sm">
            <p>
              <span className="text-zinc-400">E-mail : </span>
              <span className="text-white">{user.email}</span>
            </p>
            <p>
              <span className="text-zinc-400">Pays : </span>
              <span className="text-white">
                {profile?.country_code ? getCountryName(profile.country_code) : "—"}
              </span>
            </p>
            <p>
              <span className="text-zinc-400">Strava : </span>
              <span className="text-white">{isStravaConnected ? "connecté" : "non connecté"}</span>
            </p>
          </div>
          <StravaActions isConnected={isStravaConnected} />
        </section>
      </div>
    </div>
  );
}
