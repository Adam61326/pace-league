"use client";

import { computeSplitElevations, parseGpxTrackPoints, type GpxPoint, type SplitElevation } from "@/lib/gpx";
import {
  computeRacePlanSplits,
  DISTANCE_PRESETS,
  PACE_STRATEGY_LEVELS,
  PACE_STRATEGY_MAX,
  PACE_STRATEGY_MIN,
  PACE_STRATEGY_STEP,
  SPLIT_DISTANCE_PRESETS,
  type PaceStrategy,
  type RacePlan,
  type RacePlanSplit,
} from "@/lib/race-plan";
import { IconChevronDown, IconTrash, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function secPerKmToMinSec(secPerKm: number | null): { min: string; sec: string } {
  if (secPerKm == null) return { min: "", sec: "" };
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return { min: String(min), sec: String(sec).padStart(2, "0") };
}

function matchDistancePresetKey(distanceKm: number | null): string {
  if (distanceKm == null) return "other";
  const preset = DISTANCE_PRESETS.find((p) => p.distanceKm != null && Math.abs(p.distanceKm - distanceKm) < 0.005);
  return preset?.key ?? "other";
}

function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

function paceStrategyLabel(value: PaceStrategy): string {
  return PACE_STRATEGY_LEVELS.find((l) => l.value === value)?.label ?? "Allure régulière";
}

const SPLIT_MODE_FULL = "full";

// Style commun aux <select> de ce formulaire : `appearance-none` +
// `color-scheme: dark` global (globals.css) — sans ça, sur un OS/navigateur
// en thème clair, le popup natif d'options peut s'afficher en clair alors
// que notre texte hérite d'une couleur claire pensée pour un fond sombre
// (illisible), et Windows dessine un anneau de focus dans la couleur
// d'accent système (souvent orange) autour d'un <select> non stylé.
const SELECT_CLASS =
  "w-full appearance-none rounded-[10px] border border-border bg-white/5 px-3 py-2 pr-8 text-sm text-foreground outline-none focus:border-accent";
const OPTION_CLASS = "bg-surface text-foreground";

function SelectChevron() {
  return (
    <IconChevronDown
      size={16}
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-tertiary"
    />
  );
}

export function RacePlanForm({
  raceId,
  defaultDistanceKm,
  initialPlan,
  initialSplits,
}: {
  raceId: string;
  defaultDistanceKm: number;
  initialPlan: RacePlan | null;
  initialSplits: RacePlanSplit[];
}) {
  const router = useRouter();
  const initialPace = secPerKmToMinSec(initialPlan?.targetPaceSecPerKm ?? null);
  const initialDistanceKm = initialPlan?.distanceKm ?? defaultDistanceKm;
  const initialSplitDistanceKm = initialPlan?.splitDistanceKm ?? 1;
  // Splits déjà enregistrés triés par lapNumber (ordre garanti par la query
  // serveur, voir lib/race-plan.ts fetchSplitsForPlan) : sert de repli si
  // l'utilisateur ré-enregistre sans réimporter le GPX (voir plus bas).
  const initialSplitElevations: SplitElevation[] | null = initialSplits.some(
    (s) => s.elevationGainM != null || s.elevationLossM != null
  )
    ? initialSplits.map((s) => ({ elevationGainM: s.elevationGainM ?? 0, elevationLossM: s.elevationLossM ?? 0 }))
    : null;

  const [distancePresetKey, setDistancePresetKey] = useState(() => matchDistancePresetKey(initialDistanceKm));
  const [distanceKm, setDistanceKm] = useState(String(initialDistanceKm));
  const [splitMode, setSplitMode] = useState<string>(
    SPLIT_DISTANCE_PRESETS.includes(initialSplitDistanceKm as (typeof SPLIT_DISTANCE_PRESETS)[number])
      ? String(initialSplitDistanceKm)
      : SPLIT_MODE_FULL
  );
  const [paceMin, setPaceMin] = useState(initialPace.min);
  const [paceSec, setPaceSec] = useState(initialPace.sec);
  const [elevationGainM, setElevationGainM] = useState(
    initialPlan?.elevationGainM != null ? String(initialPlan.elevationGainM) : ""
  );
  const [elevationLossM, setElevationLossM] = useState(
    initialPlan?.elevationLossM != null ? String(initialPlan.elevationLossM) : ""
  );
  const [paceStrategy, setPaceStrategy] = useState<PaceStrategy>(initialPlan?.paceStrategy ?? 0);

  const [gpxFilename, setGpxFilename] = useState<string | null>(initialPlan?.gpxFilename ?? null);
  const [gpxPoints, setGpxPoints] = useState<GpxPoint[]>([]);
  const [gpxCleared, setGpxCleared] = useState(false);
  const [gpxError, setGpxError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const distanceKmNumber = Number(distanceKm) || 0;
  const splitDistanceKmNumber = splitMode === SPLIT_MODE_FULL ? distanceKmNumber || 1 : Number(splitMode);
  const targetPaceSecPerKmNumber = (Number(paceMin) || 0) * 60 + (Number(paceSec) || 0);
  const showFreeDistanceInput = distancePresetKey === "trail" || distancePresetKey === "other";

  const distanceChangedSinceSave = initialPlan != null && Math.abs(distanceKmNumber - initialPlan.distanceKm) > 0.0005;
  const splitModeChangedSinceSave = initialPlan != null && Math.abs(splitDistanceKmNumber - initialPlan.splitDistanceKm) > 0.0005;

  // Recalculé depuis les points GPX bruts (jamais depuis un état figé) pour
  // rester aligné si distance ou splits-par changent après l'import — voir
  // note ci-dessous sur la réutilisation du D+/D- déjà enregistré.
  const freshSplitElevations = useMemo<SplitElevation[] | null>(() => {
    if (gpxPoints.length === 0 || distanceKmNumber <= 0 || splitDistanceKmNumber <= 0) return null;
    const lengths = computeRacePlanSplits(distanceKmNumber, 1, { splitDistanceKm: splitDistanceKmNumber }).map(
      (s) => s.distanceKm
    );
    return computeSplitElevations(gpxPoints, lengths);
  }, [gpxPoints, distanceKmNumber, splitDistanceKmNumber]);

  const staleGpxWithoutReimport =
    !gpxCleared && gpxFilename != null && gpxPoints.length === 0 && (distanceChangedSinceSave || splitModeChangedSinceSave);

  // Priorité : GPX importé cette session > D+/D- déjà enregistré (si
  // distance/splits-par inchangés depuis le dernier enregistrement) > aucun
  // relief. Évite qu'un simple changement d'allure/stratégie sans retoucher
  // le GPX n'efface silencieusement le D+/D- déjà calculé. Partagé entre
  // l'aperçu live des splits et la sauvegarde, pour que les deux soient
  // toujours cohérents.
  const effectiveSplitElevations: SplitElevation[] | null = gpxCleared
    ? null
    : (freshSplitElevations ??
      (gpxFilename && initialPlan && !distanceChangedSinceSave && !splitModeChangedSinceSave ? initialSplitElevations : null));

  // Aperçu live du tableau de splits : recalculé à chaque changement de
  // distance/allure/splits-par/stratégie/relief, avant même l'enregistrement
  // (bug constaté : le curseur de stratégie ne mettait rien à jour tant que
  // le plan n'était pas sauvegardé + la page rechargée). Utilise exactement
  // la même fonction pure que la route API, donc l'aperçu et ce qui sera
  // effectivement enregistré sont toujours identiques.
  const previewSplits = useMemo<RacePlanSplit[] | null>(() => {
    if (distanceKmNumber <= 0 || targetPaceSecPerKmNumber <= 0 || splitDistanceKmNumber <= 0) return null;
    return computeRacePlanSplits(distanceKmNumber, targetPaceSecPerKmNumber, {
      splitDistanceKm: splitDistanceKmNumber,
      paceStrategy,
      splitElevations: effectiveSplitElevations ?? undefined,
    });
  }, [distanceKmNumber, targetPaceSecPerKmNumber, splitDistanceKmNumber, paceStrategy, effectiveSplitElevations]);

  async function handleGpxFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setGpxError(null);
    try {
      const text = await file.text();
      const points = parseGpxTrackPoints(text);
      if (points.length < 2) {
        setGpxError("Trace GPX invalide ou vide.");
        return;
      }
      setGpxPoints(points);
      setGpxFilename(file.name);
      setGpxCleared(false);
    } catch {
      setGpxError("Impossible de lire ce fichier GPX.");
    }
  }

  function handleRemoveGpx() {
    setGpxPoints([]);
    setGpxFilename(null);
    setGpxCleared(true);
    setGpxError(null);
  }

  function handleDistancePresetChange(key: string) {
    setDistancePresetKey(key);
    const preset = DISTANCE_PRESETS.find((p) => p.key === key);
    if (preset?.distanceKm != null) {
      setDistanceKm(String(preset.distanceKm));
    } else {
      setDistanceKm("");
    }
  }

  function handleResetStrategy() {
    setPaceStrategy(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!distanceKm || Number(distanceKm) <= 0) {
      setError("Renseigne une distance valide.");
      return;
    }
    if (!targetPaceSecPerKmNumber || targetPaceSecPerKmNumber <= 0) {
      setError("Renseigne une allure cible valide.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/course-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        race_id: raceId,
        distance_km: Number(distanceKm),
        target_pace_sec_per_km: targetPaceSecPerKmNumber,
        elevation_gain_m: elevationGainM || null,
        elevation_loss_m: elevationLossM || null,
        pace_strategy: paceStrategy,
        gpx_filename: gpxCleared ? null : gpxFilename,
        split_distance_km: splitDistanceKmNumber,
        split_elevations: effectiveSplitElevations,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("L'enregistrement a échoué, réessaie.");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Modifier le plan de course</h2>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">Parcours (.gpx)</p>
          {gpxFilename && !gpxCleared ? (
            <div className="flex items-center justify-between rounded-[10px] border border-dashed border-border bg-white/[.02] px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{gpxFilename}</span>
                <span className="text-xs text-foreground-tertiary">Le D+/D- est analysé pour ajuster les allures de chaque split.</span>
                {staleGpxWithoutReimport && (
                  <span className="text-xs text-alert">Distance ou découpage modifiés — réimporte le GPX pour recalculer le D+/D-.</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleRemoveGpx}
                className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground-secondary transition-colors hover:bg-white/[.06]"
              >
                <IconTrash size={14} />
                Retirer
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed border-border bg-white/[.02] px-4 py-6 text-center transition-colors hover:border-accent">
              <IconUpload size={20} className="text-foreground-tertiary" stroke={1.75} />
              <span className="text-sm font-medium text-foreground">Importer la trace de la course</span>
              <span className="text-xs text-foreground-tertiary">Le D+/D- est analysé pour ajuster les allures de chaque split.</span>
              <input type="file" accept=".gpx" onChange={handleGpxFileChange} className="hidden" />
            </label>
          )}
          {gpxError && <p className="text-xs text-alert">{gpxError}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-secondary">Allure cible (min:sec / km)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                required
                min={0}
                max={59}
                aria-label="Minutes par km"
                value={paceMin}
                onChange={(e) => setPaceMin(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              />
              <span className="text-foreground-tertiary">:</span>
              <input
                type="number"
                required
                min={0}
                max={59}
                aria-label="Secondes par km"
                value={paceSec}
                onChange={(e) => setPaceSec(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="distance_preset" className="text-sm font-medium text-foreground-secondary">
              Distance totale
            </label>
            <div className="relative">
              <select
                id="distance_preset"
                value={distancePresetKey}
                onChange={(e) => handleDistancePresetChange(e.target.value)}
                className={SELECT_CLASS}
              >
                {DISTANCE_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key} className={OPTION_CLASS}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
            {showFreeDistanceInput && (
              <input
                id="distance_km"
                type="number"
                required
                min={0.1}
                step={0.1}
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="Distance (km)"
                className="mt-1 rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="split_mode" className="text-sm font-medium text-foreground-secondary">
              Splits par
            </label>
            <div className="relative">
              <select id="split_mode" value={splitMode} onChange={(e) => setSplitMode(e.target.value)} className={SELECT_CLASS}>
                {SPLIT_DISTANCE_PRESETS.map((km) => (
                  <option key={km} value={km} className={OPTION_CLASS}>
                    {km} km
                  </option>
                ))}
                <option value={SPLIT_MODE_FULL} className={OPTION_CLASS}>
                  Course complète
                </option>
              </select>
              <SelectChevron />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="elevation_gain_m" className="text-sm font-medium text-foreground-secondary">
              D+ (m) <span className="text-foreground-tertiary">(optionnel)</span>
            </label>
            <input
              id="elevation_gain_m"
              type="number"
              min={0}
              value={elevationGainM}
              onChange={(e) => setElevationGainM(e.target.value)}
              className="rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="elevation_loss_m" className="text-sm font-medium text-foreground-secondary">
              D- (m) <span className="text-foreground-tertiary">(optionnel)</span>
            </label>
            <input
              id="elevation_loss_m"
              type="number"
              min={0}
              value={elevationLossM}
              onChange={(e) => setElevationLossM(e.target.value)}
              className="rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-white/[.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">Stratégie d&apos;allure</p>
            <button type="button" onClick={handleResetStrategy} className="text-xs font-semibold text-accent hover:opacity-80">
              Réinitialiser
            </button>
          </div>
          <input
            type="range"
            min={PACE_STRATEGY_MIN}
            max={PACE_STRATEGY_MAX}
            step={PACE_STRATEGY_STEP}
            value={paceStrategy}
            onChange={(e) => setPaceStrategy(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[11px] font-semibold tracking-wide text-foreground-tertiary uppercase">
            <span>Positif</span>
            <span>Régulier</span>
            <span>Négatif</span>
          </div>
          <p className="text-sm text-foreground-secondary">{paceStrategyLabel(paceStrategy)}</p>
        </div>

        {error && <p className="text-sm text-alert">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="gradient-signature flex h-11 items-center justify-center self-start rounded-full px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Enregistrement…" : "Enregistrer le plan"}
        </button>
      </form>

      {previewSplits && previewSplits.length > 0 && (
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
                {previewSplits.map((split) => (
                  <tr key={split.lapNumber}>
                    <td className="px-4 py-2.5 text-foreground">
                      {split.lapNumber}
                      {split.isFinishLap && <span className="ml-2 text-xs text-foreground-tertiary">Arrivée</span>}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-secondary">{split.distanceKm.toFixed(2)} km</td>
                    <td className="px-4 py-2.5 text-foreground-secondary">
                      {split.elevationGainM == null && split.elevationLossM == null
                        ? "–"
                        : `+${split.elevationGainM ?? 0} / -${split.elevationLossM ?? 0} m`}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-foreground-secondary">{formatPace(split.targetPaceSecPerKm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
