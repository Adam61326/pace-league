import { ActivateRaceButton } from "@/components/activate-race-button";
import { RaceList } from "@/components/race-list";
import { RacePlanForm } from "@/components/race-plan-form";
import { SendToWatch } from "@/components/send-to-watch";
import { formatDistanceKm, formatRaceDate } from "@/lib/format";
import { getRacePlanForRace, getRacesForUser } from "@/lib/race-plan";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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
              <SendToWatch racePlanId={result.plan.id} fullLapsCount={fullLapsCount} hasFinishLap={hasFinishLap} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
