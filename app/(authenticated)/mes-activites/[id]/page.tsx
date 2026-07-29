import { RouteMap } from "@/components/route-map";
import { isActivityScorable, MIN_VALID_DISTANCE_KM } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import {
  IconArrowLeft,
  IconClock,
  IconHeartbeat,
  IconMountain,
  IconRoute,
  IconTemperature,
  IconWind,
} from "@tabler/icons-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Page detail d'une activite (Sprint 17, "Course" de la maquette), reliee
// depuis /mes-activites. Reutilise les colonnes deja synchronisees
// (route_polyline, avg_heartrate, photo_url, meteo) et best_efforts — aucune
// nouvelle donnee, juste une nouvelle vue par id.
export default async function ActivityDetailPage({
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
    redirect(`/login?redirectTo=/mes-activites/${id}`);
  }

  // Filtre user_id en plus de l'id : une activite n'appartient qu'a son
  // proprietaire, jamais consultable via un id devine (contrairement au
  // profil public, ceci n'est pas une donnee competitive partagee).
  const { data: activity } = await supabase
    .from("activities")
    .select(
      "id, name, activity_date, distance_km, moving_time_seconds, avg_speed_kmh, total_elevation_gain, avg_heartrate, route_polyline, photo_url, weather_temp_celsius, weather_wind_kmh, sport_type"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!activity) notFound();

  const { data: bestEfforts } = await supabase
    .from("best_efforts")
    .select("distance_label, elapsed_time_seconds")
    .eq("activity_id", id)
    .order("elapsed_time_seconds", { ascending: true });

  const excluded = !isActivityScorable(activity);
  const avgPaceSecPerKm =
    activity.distance_km && activity.moving_time_seconds
      ? activity.moving_time_seconds / Number(activity.distance_km)
      : null;
  const hasMedia = Boolean(activity.route_polyline || activity.photo_url);

  const statTiles = [
    { icon: IconRoute, label: "Distance", value: `${Number(activity.distance_km ?? 0).toFixed(2)} km` },
    { icon: IconMountain, label: "D+", value: `${Math.round(Number(activity.total_elevation_gain ?? 0))} m` },
    { icon: IconClock, label: "Durée", value: formatDuration(activity.moving_time_seconds) },
    { icon: IconClock, label: "Allure", value: formatPace(avgPaceSecPerKm) },
    ...(activity.avg_heartrate != null
      ? [{ icon: IconHeartbeat, label: "FC moyenne", value: `${Math.round(Number(activity.avg_heartrate))} bpm` }]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Link
            href="/mes-activites"
            className="flex w-fit items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground"
          >
            <IconArrowLeft size={16} />
            Mes activités
          </Link>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {activity.name?.trim() || "Sortie course à pied"}
            </h1>
            <p className="text-sm text-foreground-secondary capitalize">{formatDate(activity.activity_date)}</p>
          </div>
          {excluded && (
            <p className="rounded-[10px] bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
              {Number(activity.distance_km ?? 0) < MIN_VALID_DISTANCE_KM
                ? `Exclue du score : distance sous le seuil anti-spam (${MIN_VALID_DISTANCE_KM} km)`
                : `Exclue du score : type d'activité non comptabilisé${activity.sport_type ? ` (${activity.sport_type})` : ""}`}
            </p>
          )}
        </div>

        {hasMedia && (
          <section className="flex flex-wrap gap-4">
            {activity.route_polyline && (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface p-4">
                <RouteMap polyline={activity.route_polyline} width={400} height={260} />
              </div>
            )}
            {activity.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activity.photo_url}
                alt=""
                className="h-[260px] w-[400px] rounded-2xl border border-border object-cover"
              />
            )}
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Détails</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {statTiles.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col gap-2 rounded-[10px] border border-border p-4">
                <Icon size={18} stroke={1.75} className="text-foreground-secondary" />
                <span className="font-mono text-lg font-semibold tracking-tight text-foreground">{value}</span>
                <span className="text-xs text-foreground-secondary">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {activity.weather_temp_celsius != null && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Météo</h2>
            <div className="flex items-center gap-4 rounded-[10px] border border-border p-4 text-sm text-foreground-secondary">
              <span className="flex items-center gap-1.5">
                <IconTemperature size={16} stroke={1.75} />
                <span className="font-mono text-foreground">{Math.round(activity.weather_temp_celsius)}°C</span>
              </span>
              {activity.weather_wind_kmh != null && (
                <span className="flex items-center gap-1.5">
                  <IconWind size={16} stroke={1.75} />
                  <span className="font-mono text-foreground">{Math.round(activity.weather_wind_kmh)} km/h</span>
                </span>
              )}
            </div>
          </section>
        )}

        {bestEfforts != null && bestEfforts.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">
              Records réalisés sur cette sortie
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {bestEfforts.map((effort) => (
                <div key={effort.distance_label} className="flex flex-col gap-1 rounded-[10px] border border-border p-4">
                  <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                    {formatDuration(effort.elapsed_time_seconds)}
                  </span>
                  <span className="text-xs text-foreground-secondary">{effort.distance_label}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
