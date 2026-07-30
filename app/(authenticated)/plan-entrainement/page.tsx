import { ActivateRaceButton } from "@/components/activate-race-button";
import { RaceList } from "@/components/race-list";
import { RacePlanForm } from "@/components/race-plan-form";
import { SendToWatch } from "@/components/send-to-watch";
import { formatDistanceKm, formatRaceDate } from "@/lib/format";
import { getRacePlanForRace, getRacesForUser } from "@/lib/race-plan";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

function formatSplitElevation(gainM: number | null, lossM: number | null): string {
  if (gainM == null && lossM == null) return "–";
  return `+${gainM ?? 0} / -${lossM ?? 0} m`;
}

// Plusieurs courses en préparation en parallèle (CLAUDE.md "CHANGEMENT DE
// SCOPE ASSUMÉ", Sprint 20) — remplace la contrainte "un seul plan actif
// par utilisateur" du sprint précédent (20260801000000_add_race_plan.sql).
// Course sélectionnée via ?race=<id> ; à défaut, la course active, sinon la
// première par date. L'éditeur reste pleinement accessible même pour une
// course dont le plan est vide (CLAUDE.md "ACCESSIBILITÉ DE L'ÉDITEUR SUR
// PLAN VIDE") : pas de redirection, pas de blocage.
export default async function PlanEntrainementPage({ searchParams }: { searchParams: Promise<{ race?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/plan-entrainement");
  }

  const { race: raceParam } = await searchParams;
  const races = await getRacesForUser(supabase, user.id);

  const selectedRace =
    races.find((r) => r.id === raceParam) ?? races.find((r) => r.isActive) ?? races[0] ?? null;

  const result = selectedRace ? await getRacePlanForRace(supabase, selectedRace.id) : null;
  const fullLapsCount = result ? result.splits.filter((s) => !s.isFinishLap).length : 0;
  const hasFinishLap = result ? result.splits.some((s) => s.isFinishLap) : false;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Entraînement</h1>
          <p className="text-sm text-foreground-secondary">
            Prépare ton plan de course et envoie-le sur ta montre.
          </p>
        </div>

        <RaceList races={races} selectedRaceId={selectedRace?.id ?? null} />

        {selectedRace && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">{selectedRace.name}</h2>
                <p className="text-xs text-foreground-tertiary">
                  {formatRaceDate(selectedRace.raceDate) ?? "Date non renseignée"} · {formatDistanceKm(selectedRace.distanceKm)}
                </p>
              </div>
              {!selectedRace.isActive && <ActivateRaceButton raceId={selectedRace.id} />}
            </div>

            <RacePlanForm
              key={selectedRace.id}
              raceId={selectedRace.id}
              defaultDistanceKm={selectedRace.distanceKm}
              initialPlan={result?.plan ?? null}
              initialSplits={result?.splits ?? []}
            />

            {result && result.splits.length > 0 && (
              <>
                <section className="flex flex-col gap-4">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Splits</h2>
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-white/[.02] text-left text-xs font-semibold text-foreground-tertiary uppercase">
                          <th className="px-4 py-2.5">Lap</th>
                          <th className="px-4 py-2.5">Distance</th>
                          <th className="px-4 py-2.5">D+/D-</th>
                          <th className="px-4 py-2.5">Allure cible</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.splits.map((split) => (
                          <tr key={split.lapNumber}>
                            <td className="px-4 py-2.5 text-foreground">
                              {split.lapNumber}
                              {split.isFinishLap && <span className="ml-2 text-xs text-foreground-tertiary">Arrivée</span>}
                            </td>
                            <td className="px-4 py-2.5 text-foreground-secondary">{split.distanceKm.toFixed(2)} km</td>
                            <td className="px-4 py-2.5 text-foreground-secondary">
                              {formatSplitElevation(split.elevationGainM, split.elevationLossM)}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-foreground-secondary">
                              {formatPace(split.targetPaceSecPerKm)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <SendToWatch racePlanId={result.plan.id} fullLapsCount={fullLapsCount} hasFinishLap={hasFinishLap} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
