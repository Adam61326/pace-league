import { ContributionCalendar } from "@/components/contribution-calendar";
import { PerformanceRadar } from "@/components/performance-radar";
import { RouteMap } from "@/components/route-map";
import { SubTabs } from "@/components/sub-tabs";
import { computePerformanceAxes } from "@/lib/performance";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { getStreak } from "@/lib/streak";
import { createClient } from "@/lib/supabase/server";
import {
  IconActivity,
  IconCalendarCheck,
  IconClock,
  IconHeartbeat,
  IconMountain,
  IconRoute,
  IconTrophy,
} from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { WeeklyTrend } from "./weekly-trend";

const STRAVA_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Vous avez refusé l'accès à votre compte Strava.",
  invalid_state: "La demande de connexion Strava a expiré ou est invalide, réessayez.",
  exchange_failed: "La connexion à Strava a échoué, réessayez.",
};

const WEEKS_OF_TREND = 4;
const CALENDAR_WEEKS = 12;
const DASHBOARD_TABS = [
  { href: "/dashboard", label: "Vue d'ensemble" },
  { href: "/mes-activites", label: "Mes activités" },
];

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

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

// Distances standard affichées, dans cet ordre — best_efforts peut contenir
// d'autres libellés Strava (ex: "400m", "1 mile") qu'on capture tous mais
// n'affiche pas ici pour rester lisible. Casse exacte des libellés Strava
// vérifiée en base ("5K"/"10K"/"15K", pas "5k") : ne pas la "normaliser".
const STANDARD_DISTANCES = ["5K", "10K", "15K", "Half-Marathon", "Marathon"];

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Liste de WEEKS_OF_TREND lundis consécutifs, se terminant sur `weekStart`
// (semaine en cours incluse).
function weekStartsBack(weekStart: Date, count: number): string[] {
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() - i * 7);
    result.push(toDateString(d));
  }
  return result;
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

  const params = await searchParams;
  const strava = typeof params.strava === "string" ? params.strava : undefined;
  const stravaError =
    typeof params.strava_error === "string" ? params.strava_error : undefined;

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekEnd);

  const streakDays = await getStreak(supabase, user.id);

  const { data: hrProfile } = await supabase
    .from("users")
    .select("hr_max, hr_rest")
    .eq("id", user.id)
    .single();

  const performanceAxes = await computePerformanceAxes(
    supabase,
    user.id,
    hrProfile?.hr_max ?? null,
    hrProfile?.hr_rest ?? null
  );

  // Résumé "cette semaine" : toutes les activités synchronisées de la
  // semaine (pas seulement celles qui comptent pour le score — le seuil
  // anti-spam de 1.5km n'exclut qu'une poignée de sorties, la vue d'ensemble
  // reste plus honnête en montrant tout ce qui a été fait).
  const { data: weekActivities } = await supabase
    .from("activities")
    .select("activity_date, distance_km, total_elevation_gain, moving_time_seconds, avg_heartrate")
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

  // Moyenne de fréquence cardiaque de la semaine : seulement si au moins une
  // activité a la donnée (pas de capteur = absente, jamais traitée comme 0).
  const heartrateReadings = (weekActivities ?? [])
    .map((a) => (a.avg_heartrate != null ? Number(a.avg_heartrate) : null))
    .filter((v): v is number => v != null);
  const avgHeartrate =
    heartrateReadings.length > 0
      ? heartrateReadings.reduce((sum, v) => sum + v, 0) / heartrateReadings.length
      : null;

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
  const trendWeekStarts = weekStartsBack(weekStart, WEEKS_OF_TREND);

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

  // Calendrier de régularité (façon "contributions") sur les CALENDAR_WEEKS
  // dernières semaines, depuis les mêmes activités déjà en base — aucune
  // nouvelle donnée à récupérer.
  const calendarWeekStarts = weekStartsBack(weekStart, CALENDAR_WEEKS);
  const { data: calendarActivities } = await supabase
    .from("activities")
    .select("activity_date, distance_km")
    .eq("user_id", user.id)
    .gte("activity_date", calendarWeekStarts[0])
    .lte("activity_date", weekEndStr);

  const kmByDate = new Map<string, number>();
  for (const a of calendarActivities ?? []) {
    kmByDate.set(a.activity_date, (kmByDate.get(a.activity_date) ?? 0) + Number(a.distance_km ?? 0));
  }

  // Records personnels : requêtes ciblées (tri + limite), pas de recharge de
  // toutes les activités en mémoire.
  const [{ data: longestRun }, { data: biggestClimb }, { data: bestPaceActivity }] = await Promise.all([
    supabase
      .from("activities")
      .select("distance_km, activity_date")
      .eq("user_id", user.id)
      .order("distance_km", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("total_elevation_gain, activity_date")
      .eq("user_id", user.id)
      .order("total_elevation_gain", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("avg_speed_kmh, activity_date")
      .eq("user_id", user.id)
      .gte("distance_km", 3)
      .order("avg_speed_kmh", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const hasAnyRecord = Boolean(longestRun || biggestClimb || bestPaceActivity);

  // Records par distance standard (best_efforts Strava) : table petite par
  // utilisateur, on récupère tout et on garde le meilleur (temps le plus
  // court) par distance_label en mémoire plutôt que 5 requêtes séparées.
  const { data: bestEffortsRows } = await supabase
    .from("best_efforts")
    .select("distance_label, elapsed_time_seconds, achieved_at")
    .eq("user_id", user.id);

  const bestEffortByDistance = new Map<string, { elapsedTimeSeconds: number; achievedAt: string }>();
  for (const row of bestEffortsRows ?? []) {
    const current = bestEffortByDistance.get(row.distance_label);
    if (!current || row.elapsed_time_seconds < current.elapsedTimeSeconds) {
      bestEffortByDistance.set(row.distance_label, {
        elapsedTimeSeconds: row.elapsed_time_seconds,
        achievedAt: row.achieved_at,
      });
    }
  }

  // Dernière activité synchronisée, pour la mise en avant tracé/photo.
  const { data: latestActivity } = await supabase
    .from("activities")
    .select("name, activity_date, route_polyline, photo_url")
    .eq("user_id", user.id)
    .order("activity_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasLatestMedia = Boolean(latestActivity?.route_polyline || latestActivity?.photo_url);

  const weekStatTiles = [
    { icon: IconRoute, label: "Distance", value: `${totalKm.toFixed(1)} km` },
    { icon: IconMountain, label: "D+", value: `${Math.round(totalDplus)} m` },
    { icon: IconCalendarCheck, label: "Jours actifs", value: String(activeDays) },
    { icon: IconClock, label: "Allure moy.", value: formatPace(avgPaceSecPerKm) },
    ...(avgHeartrate != null
      ? [{ icon: IconHeartbeat, label: "FC moyenne", value: `${Math.round(avgHeartrate)} bpm` }]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col items-center gap-10 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Tableau de bord</h1>
            <p className="text-sm text-zinc-400">
              Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
              {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
            </p>
          </div>
          <SubTabs tabs={DASHBOARD_TABS} activeHref="/dashboard" />
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

        {/* Dernière activité (tracé + photo, quand disponibles) */}
        {latestActivity && hasLatestMedia && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
              Dernière activité — {latestActivity.name?.trim() || "Sortie course à pied"}
            </h2>
            <div className="flex flex-wrap gap-4">
              {latestActivity.route_polyline && (
                <div className="overflow-hidden rounded-md border border-white/10 bg-surface/60 p-3">
                  <RouteMap polyline={latestActivity.route_polyline} width={260} height={160} />
                </div>
              )}
              {latestActivity.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={latestActivity.photo_url}
                  alt=""
                  className="h-[186px] w-[260px] rounded-md border border-white/10 object-cover"
                />
              )}
            </div>
          </section>
        )}

        {/* Résumé de la semaine */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">Cette semaine</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {weekStatTiles.map(({ icon: Icon, label, value }) => (
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

        {/* Calendrier de régularité */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
            Régularité ({CALENDAR_WEEKS} dernières semaines)
          </h2>
          <div className="overflow-x-auto">
            <ContributionCalendar kmByDate={kmByDate} weekStartDates={calendarWeekStarts} />
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

        {/* Records personnels */}
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-400">
            <IconTrophy size={16} stroke={1.75} />
            Records personnels
          </h2>
          {!hasAnyRecord ? (
            <p className="text-sm text-zinc-400">Pas encore d&apos;activité enregistrée.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2 rounded-md border border-white/10 p-4">
                <IconRoute size={18} stroke={1.75} className="text-zinc-400" />
                <span className="text-lg font-semibold tracking-tight text-white">
                  {longestRun ? `${Number(longestRun.distance_km).toFixed(2)} km` : "—"}
                </span>
                <span className="text-xs text-zinc-400">
                  Plus longue sortie
                  {longestRun && ` · ${formatShortDate(longestRun.activity_date)}`}
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-white/10 p-4">
                <IconMountain size={18} stroke={1.75} className="text-zinc-400" />
                <span className="text-lg font-semibold tracking-tight text-white">
                  {biggestClimb ? `${Math.round(Number(biggestClimb.total_elevation_gain))} m` : "—"}
                </span>
                <span className="text-xs text-zinc-400">
                  Plus gros D+
                  {biggestClimb && ` · ${formatShortDate(biggestClimb.activity_date)}`}
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-white/10 p-4">
                <IconClock size={18} stroke={1.75} className="text-zinc-400" />
                <span className="text-lg font-semibold tracking-tight text-white">
                  {bestPaceActivity
                    ? formatPace(3600 / Number(bestPaceActivity.avg_speed_kmh))
                    : "—"}
                </span>
                <span className="text-xs text-zinc-400">
                  Meilleure allure (≥3km)
                  {bestPaceActivity && ` · ${formatShortDate(bestPaceActivity.activity_date)}`}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Records par distance (best_efforts Strava) */}
        {bestEffortByDistance.size > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
              Records par distance
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {STANDARD_DISTANCES.map((label) => {
                const best = bestEffortByDistance.get(label);
                return (
                  <div
                    key={label}
                    className="flex flex-col gap-1 rounded-md border border-white/10 p-4"
                  >
                    <span className="text-lg font-semibold tracking-tight text-white">
                      {best ? formatDuration(best.elapsedTimeSeconds) : "—"}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {label}
                      {best && ` · ${formatShortDate(best.achievedAt)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Performance à 4 axes */}
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-400">
            <IconActivity size={16} stroke={1.75} />
            Performance
          </h2>
          <div className="flex flex-wrap items-start gap-6">
            <PerformanceRadar axes={performanceAxes} />
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2" style={{ minWidth: 240 }}>
              {performanceAxes.map((axis) => (
                <div key={axis.key} className="flex flex-col gap-1 rounded-md border border-white/10 p-4">
                  <span className="text-sm font-medium text-white">{axis.label}</span>
                  {axis.percentile != null ? (
                    <>
                      <span className="text-lg font-semibold tracking-tight text-white">
                        {axis.percentile}e percentile
                      </span>
                      {axis.detail && <span className="text-xs text-zinc-400">{axis.detail}</span>}
                      {axis.trend && (
                        <span
                          className={`text-xs font-medium ${
                            axis.trend === "hausse"
                              ? "text-green-400"
                              : axis.trend === "baisse"
                                ? "text-red-400"
                                : "text-zinc-400"
                          }`}
                        >
                          Tendance : {axis.trend}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-zinc-400">{axis.unavailableReason}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tendance 4 semaines */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
            Tendance ({WEEKS_OF_TREND} dernières semaines)
          </h2>
          <WeeklyTrend trend={trend} />
        </section>
      </div>
    </div>
  );
}
