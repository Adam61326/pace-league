import { getPersonalRecords, STANDARD_DISTANCES } from "@/lib/records";
import { createClient } from "@/lib/supabase/server";
import { IconClock, IconMountain, IconRoute, IconTrophy } from "@tabler/icons-react";
import { redirect } from "next/navigation";

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Page standalone Records (Sprint 17, "Records" de la maquette) : reutilise
// getPersonalRecords (lib/records.ts, extrait de /dashboard) — meme donnee,
// juste une vue dediee plutot qu'une section parmi d'autres.
export default async function RecordsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/records");
  }

  const { longestRun, biggestClimb, bestPaceActivity, bestEffortByDistance } = await getPersonalRecords(
    supabase,
    user.id
  );

  const hasAnyRecord = Boolean(longestRun || biggestClimb || bestPaceActivity);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Records</h1>
          <p className="text-sm text-foreground-secondary">Tes meilleures performances personnelles.</p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
            <IconTrophy size={16} stroke={1.75} />
            Records personnels
          </h2>
          {!hasAnyRecord ? (
            <p className="text-sm text-foreground-secondary">Pas encore d&apos;activité enregistrée.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2 rounded-[10px] border border-border p-4">
                <IconRoute size={18} stroke={1.75} className="text-foreground-secondary" />
                <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                  {longestRun ? `${longestRun.distance_km.toFixed(2)} km` : "—"}
                </span>
                <span className="text-xs text-foreground-secondary">
                  Plus longue sortie
                  {longestRun && ` · ${formatShortDate(longestRun.activity_date)}`}
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-[10px] border border-border p-4">
                <IconMountain size={18} stroke={1.75} className="text-foreground-secondary" />
                <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                  {biggestClimb ? `${Math.round(biggestClimb.total_elevation_gain)} m` : "—"}
                </span>
                <span className="text-xs text-foreground-secondary">
                  Plus gros D+
                  {biggestClimb && ` · ${formatShortDate(biggestClimb.activity_date)}`}
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-[10px] border border-border p-4">
                <IconClock size={18} stroke={1.75} className="text-foreground-secondary" />
                <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                  {bestPaceActivity ? formatPace(3600 / bestPaceActivity.avg_speed_kmh) : "—"}
                </span>
                <span className="text-xs text-foreground-secondary">
                  Meilleure allure (≥3km)
                  {bestPaceActivity && ` · ${formatShortDate(bestPaceActivity.activity_date)}`}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Records par distance</h2>
          {bestEffortByDistance.size === 0 ? (
            <p className="text-sm text-foreground-secondary">
              Pas encore de record Strava par distance standard (5K, 10K, semi, marathon...).
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {STANDARD_DISTANCES.map((label) => {
                const best = bestEffortByDistance.get(label);
                return (
                  <div key={label} className="flex flex-col gap-1 rounded-[10px] border border-border p-4">
                    <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                      {best ? formatDuration(best.elapsedTimeSeconds) : "—"}
                    </span>
                    <span className="text-xs text-foreground-secondary">
                      {label}
                      {best && ` · ${formatShortDate(best.achievedAt)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
