import { RouteMap } from "@/components/route-map";
import { SubTabs } from "@/components/sub-tabs";
import {
  computeDayScore,
  getWeekBounds,
  isActivityScorable,
  MIN_VALID_DISTANCE_KM,
  toDateString,
  type ScoredActivity,
} from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { IconTemperature, IconWind } from "@tabler/icons-react";
import { redirect } from "next/navigation";

const WEEKS_OF_HISTORY = 4;
const DASHBOARD_TABS = [
  { href: "/dashboard", label: "Vue d'ensemble" },
  { href: "/mes-activites", label: "Mes activités" },
];

interface ActivityRow extends ScoredActivity {
  id: string;
  name: string | null;
  moving_time_seconds: number | null;
  route_polyline: string | null;
  photo_url: string | null;
  weather_temp_celsius: number | null;
  weather_wind_kmh: number | null;
}

function formatDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
}

function weekStartFor(dateStr: string): string {
  const { weekStart } = getWeekBounds(new Date(`${dateStr}T00:00:00Z`));
  return toDateString(weekStart);
}

export default async function MesActivitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/mes-activites");
  }

  const { weekStart: currentWeekStart, weekEnd: currentWeekEnd } = getWeekBounds();
  const rangeStart = new Date(currentWeekStart);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (WEEKS_OF_HISTORY - 1) * 7);

  const { data: rows } = await supabase
    .from("activities")
    .select(
      "id, activity_date, name, distance_km, total_elevation_gain, moving_time_seconds, route_polyline, photo_url, weather_temp_celsius, weather_wind_kmh, sport_type"
    )
    .eq("user_id", user.id)
    .gte("activity_date", toDateString(rangeStart))
    .lte("activity_date", toDateString(currentWeekEnd))
    .order("activity_date", { ascending: false });

  const activities: ActivityRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    activity_date: r.activity_date,
    name: r.name,
    distance_km: r.distance_km === null ? null : Number(r.distance_km),
    total_elevation_gain: r.total_elevation_gain === null ? null : Number(r.total_elevation_gain),
    moving_time_seconds: r.moving_time_seconds,
    route_polyline: r.route_polyline,
    photo_url: r.photo_url,
    weather_temp_celsius: r.weather_temp_celsius === null ? null : Number(r.weather_temp_celsius),
    weather_wind_kmh: r.weather_wind_kmh === null ? null : Number(r.weather_wind_kmh),
    sport_type: r.sport_type,
  }));

  const hasAnyWeather = activities.some((a) => a.weather_temp_celsius != null);

  // Groupe par semaine (lundi) puis par jour, semaine/jour les plus récents
  // en premier.
  const byWeek = new Map<string, Map<string, ActivityRow[]>>();
  for (const activity of activities) {
    const ws = weekStartFor(activity.activity_date);
    const week = byWeek.get(ws) ?? new Map<string, ActivityRow[]>();
    const day = week.get(activity.activity_date) ?? [];
    day.push(activity);
    week.set(activity.activity_date, day);
    byWeek.set(ws, week);
  }

  const weeks = Array.from(byWeek.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Mes activités</h1>
            <p className="text-sm text-zinc-400">
              {WEEKS_OF_HISTORY} dernières semaines, jour par jour.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Seules les activités qui passent les filtres GPS et vitesse sont synchronisées
              depuis Strava : celles exclues pour ces raisons n&apos;apparaissent pas ici. Deux
              autres filtres s&apos;appliquent sur les activités listées ci-dessous sans les
              masquer : le seuil anti-spam sur la distance (moins de {MIN_VALID_DISTANCE_KM} km)
              et le type d&apos;activité (seules les courses à pied comptent pour le score).
            </p>
          </div>
          <SubTabs tabs={DASHBOARD_TABS} activeHref="/mes-activites" />
        </div>

        {weeks.length === 0 ? (
          <p className="text-sm text-zinc-400">Aucune activité synchronisée sur cette période.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {weeks.map(([weekStartStr, days]) => {
              const weekStartDate = new Date(`${weekStartStr}T00:00:00Z`);
              const weekEndDate = new Date(weekStartDate);
              weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);

              const sortedDays = Array.from(days.entries()).sort((a, b) =>
                a[0] < b[0] ? 1 : -1
              );

              return (
                <section key={weekStartStr} className="flex flex-col gap-4">
                  <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
                    Semaine du {weekStartDate.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
                    {weekEndDate.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
                  </h2>

                  <div className="flex flex-col gap-4">
                    {sortedDays.map(([day, dayActivities]) => {
                      const scorable = dayActivities.filter(isActivityScorable);
                      const dayScore =
                        scorable.length > 0 ? computeDayScore(scorable).total_points : 0;

                      return (
                        <div key={day} className="rounded-md border border-white/10">
                          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                            <span className="text-sm font-medium text-white capitalize">
                              {formatDay(day)}
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {dayScore > 0 ? `${dayScore.toFixed(1)} pts` : "0 pt"}
                            </span>
                          </div>
                          <ul className="flex flex-col divide-y divide-white/10">
                            {dayActivities.map((activity) => {
                              const excluded = !isActivityScorable(activity);
                              const hasMedia = Boolean(activity.route_polyline || activity.photo_url);
                              return (
                                <li
                                  key={activity.id}
                                  className="flex flex-col gap-2 px-4 py-3 text-sm"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-medium text-white">
                                      {activity.name?.trim() || "Sortie course à pied"}
                                    </span>
                                    <span className="shrink-0 text-zinc-400">
                                      {(activity.distance_km ?? 0).toFixed(2)} km ·{" "}
                                      {Math.round(activity.total_elevation_gain ?? 0)} m D+
                                    </span>
                                  </div>
                                  {excluded && (
                                    <span className="text-xs text-amber-400">
                                      {(activity.distance_km ?? 0) < MIN_VALID_DISTANCE_KM
                                        ? `Exclue du score : distance sous le seuil anti-spam (${MIN_VALID_DISTANCE_KM} km)`
                                        : `Exclue du score : type d'activité non comptabilisé${activity.sport_type ? ` (${activity.sport_type})` : ""}`}
                                    </span>
                                  )}
                                  {activity.weather_temp_celsius != null && (
                                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                                      <span className="flex items-center gap-1">
                                        <IconTemperature size={14} stroke={1.75} />
                                        {Math.round(activity.weather_temp_celsius)}°C
                                      </span>
                                      {activity.weather_wind_kmh != null && (
                                        <span className="flex items-center gap-1">
                                          <IconWind size={14} stroke={1.75} />
                                          {Math.round(activity.weather_wind_kmh)} km/h
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {hasMedia && (
                                    <div className="flex gap-2">
                                      {activity.route_polyline && (
                                        <div className="overflow-hidden rounded-md border border-white/10 bg-surface/60 p-1.5">
                                          <RouteMap polyline={activity.route_polyline} width={110} height={70} />
                                        </div>
                                      )}
                                      {activity.photo_url && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={activity.photo_url}
                                          alt=""
                                          className="h-[70px] w-[110px] rounded-md border border-white/10 object-cover"
                                        />
                                      )}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {hasAnyWeather && (
          <p className="text-xs text-zinc-600">
            Météo par{" "}
            <a
              href="https://open-meteo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-400"
            >
              Open-Meteo.com
            </a>{" "}
            (CC-BY 4.0)
          </p>
        )}
      </div>
    </div>
  );
}
