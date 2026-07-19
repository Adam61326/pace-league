import {
  computeDayScore,
  getWeekBounds,
  isActivityScorable,
  MIN_VALID_DISTANCE_KM,
  toDateString,
  type ScoredActivity,
} from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const WEEKS_OF_HISTORY = 4;

interface ActivityRow extends ScoredActivity {
  id: string;
  name: string | null;
  moving_time_seconds: number | null;
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
    .select("id, activity_date, name, distance_km, total_elevation_gain, moving_time_seconds")
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
  }));

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
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes activités</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {WEEKS_OF_HISTORY} dernières semaines, jour par jour.
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            Seules les activités qui passent les filtres GPS et vitesse sont synchronisées
            depuis Strava : celles exclues pour ces raisons n&apos;apparaissent pas ici. Seul le
            filtre anti-spam sur la distance (moins de {MIN_VALID_DISTANCE_KM} km) s&apos;applique
            sur les activités listées ci-dessous.
          </p>
        </div>

        {weeks.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aucune activité synchronisée sur cette période.
          </p>
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
                  <h2 className="text-sm font-semibold tracking-tight text-zinc-500 dark:text-zinc-400">
                    Semaine du {weekStartDate.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
                    {weekEndDate.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
                  </h2>

                  <div className="flex flex-col gap-4">
                    {sortedDays.map(([day, dayActivities]) => {
                      const scorable = dayActivities.filter(isActivityScorable);
                      const dayScore =
                        scorable.length > 0 ? computeDayScore(scorable).total_points : 0;

                      return (
                        <div
                          key={day}
                          className="rounded-md border border-black/[.08] dark:border-white/[.145]"
                        >
                          <div className="flex items-center justify-between border-b border-black/[.08] px-4 py-2 dark:border-white/[.145]">
                            <span className="text-sm font-medium capitalize">{formatDay(day)}</span>
                            <span className="text-sm font-semibold">
                              {dayScore > 0 ? `${dayScore.toFixed(1)} pts` : "0 pt"}
                            </span>
                          </div>
                          <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
                            {dayActivities.map((activity) => {
                              const excluded = !isActivityScorable(activity);
                              return (
                                <li
                                  key={activity.id}
                                  className="flex flex-col gap-1 px-4 py-3 text-sm"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-medium">
                                      {activity.name?.trim() || "Sortie course à pied"}
                                    </span>
                                    <span className="shrink-0 text-zinc-600 dark:text-zinc-400">
                                      {(activity.distance_km ?? 0).toFixed(2)} km ·{" "}
                                      {Math.round(activity.total_elevation_gain ?? 0)} m D+
                                    </span>
                                  </div>
                                  {excluded && (
                                    <span className="text-xs text-amber-700 dark:text-amber-400">
                                      Exclue du score : distance sous le seuil anti-spam (
                                      {MIN_VALID_DISTANCE_KM} km)
                                    </span>
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
      </div>
    </div>
  );
}
