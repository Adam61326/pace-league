"use client";

import { computeGpxSummary, computeSplitElevations, parseGpxTrackPoints, type GpxPoint, type SplitElevation } from "@/lib/gpx";
import {
  computeRacePlanSplits,
  DISTANCE_PRESETS,
  matchDistancePresetKey,
  PACE_STRATEGY_LEVELS,
  PACE_STRATEGY_MAX,
  PACE_STRATEGY_MIN,
  PACE_STRATEGY_STEP,
  SPLIT_DISTANCE_PRESETS,
  type PaceStrategy,
  type RacePlan,
  type RacePlanSplit,
} from "@/lib/race-plan";
import { OPTION_CLASS, SELECT_CLASS, SelectChevron } from "@/components/select-field";
import { PaceInput } from "@/components/pace-input";
import { formatDistanceKm, formatDuration } from "@/lib/format";
import { IconDeviceFloppy, IconMessage, IconMountain, IconPencil } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";

function secPerKmToMinSec(secPerKm: number | null): { min: string; sec: string } {
  if (secPerKm == null) return { min: "", sec: "" };
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return { min: String(min), sec: String(sec).padStart(2, "0") };
}

function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

function formatPaceCompact(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function paceStrategyLabel(value: PaceStrategy): string {
  return PACE_STRATEGY_LEVELS.find((l) => l.value === value)?.label ?? "Allure régulière";
}

// Code couleur du tableau de splits : compare l'allure finale affichée
// (stratégie + relief déjà appliqués) à l'allure moyenne cible du plan, pas
// à la cause de l'écart — un split peut être coloré grâce au relief
// (descente) même stratégie "régulière", ou à cause de la stratégie seule.
// Tolérance ±1 sec/km pour ne pas colorer du bruit d'arrondi négligeable.
// Plus rapide = accent (même bleu que la colonne Cumul), plus lent = rouge.
const PACE_COLOR_TOLERANCE_SEC = 1;

function paceColorClass(splitPaceSecPerKm: number, basePaceSecPerKm: number): string {
  const diff = splitPaceSecPerKm - basePaceSecPerKm;
  if (diff < -PACE_COLOR_TOLERANCE_SEC) return "text-accent";
  if (diff > PACE_COLOR_TOLERANCE_SEC) return "text-red-400";
  return "text-foreground-secondary";
}

const SPLIT_MODE_FULL = "full";

export function RacePlanForm({
  raceId,
  raceName,
  raceDateLabel,
  defaultDistanceKm,
  initialPlan,
  initialSplits,
  activateButton,
}: {
  raceId: string;
  raceName: string;
  raceDateLabel: string | null;
  defaultDistanceKm: number;
  initialPlan: RacePlan | null;
  initialSplits: RacePlanSplit[];
  activateButton?: React.ReactNode;
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
  const [reliefEnabled, setReliefEnabled] = useState(initialPlan?.reliefEnabled ?? true);

  const [gpxFilename, setGpxFilename] = useState<string | null>(initialPlan?.gpxFilename ?? null);
  const [gpxPoints, setGpxPoints] = useState<GpxPoint[]>([]);
  const [gpxCleared, setGpxCleared] = useState(false);
  const [gpxError, setGpxError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // id du race_plan persisté — connu dès l'ouverture d'un plan déjà
  // enregistré, ou capturé depuis la réponse du premier enregistrement
  // (voir handleSubmit) : les commentaires par split ont besoin de cet id,
  // impossible d'en poser un avant que le plan existe en base.
  const [racePlanId, setRacePlanId] = useState<string | null>(initialPlan?.id ?? null);
  const [comments, setComments] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const s of initialSplits) if (s.comment) initial[s.lapNumber] = s.comment;
    return initial;
  });
  const [editingLap, setEditingLap] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const distanceKmNumber = Number(distanceKm) || 0;
  const splitDistanceKmNumber = splitMode === SPLIT_MODE_FULL ? distanceKmNumber || 1 : Number(splitMode);
  const targetPaceSecPerKmNumber = (Number(paceMin) || 0) * 60 + (Number(paceSec) || 0);
  const showFreeDistanceInput = distancePresetKey === "trail" || distancePresetKey === "other";

  const distanceChangedSinceSave = initialPlan != null && Math.abs(distanceKmNumber - initialPlan.distanceKm) > 0.0005;
  const splitModeChangedSinceSave = initialPlan != null && Math.abs(splitDistanceKmNumber - initialPlan.splitDistanceKm) > 0.0005;

  // Résumé de la trace importée (distance/D+/D- du fichier, pas du plan) —
  // affiché sous le nom du fichier une fois importé cette session ; sans
  // stockage du fichier brut, indisponible tant qu'on n'a pas ré-importé.
  const gpxSummary = useMemo(() => (gpxPoints.length > 0 ? computeGpxSummary(gpxPoints) : null), [gpxPoints]);

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
      reliefEnabled,
    });
  }, [distanceKmNumber, targetPaceSecPerKmNumber, splitDistanceKmNumber, paceStrategy, effectiveSplitElevations, reliefEnabled]);

  // POINT/SEGMENT/CUMUL du tableau : distance et temps cumulés depuis le
  // départ, dérivés de previewSplits (jamais stockés séparément — le temps
  // d'un segment = sa distance × son allure déjà calculée).
  const splitsWithCumulative = useMemo(() => {
    if (!previewSplits) return null;
    let cumulativeDistanceKm = 0;
    let cumulativeSeconds = 0;
    return previewSplits.map((split) => {
      cumulativeDistanceKm += split.distanceKm;
      const segmentSeconds = split.distanceKm * split.targetPaceSecPerKm;
      cumulativeSeconds += segmentSeconds;
      return { ...split, cumulativeDistanceKm, segmentSeconds, cumulativeSeconds };
    });
  }, [previewSplits]);

  function handleToggleCommentEditor(lapNumber: number) {
    if (editingLap === lapNumber) {
      setEditingLap(null);
      return;
    }
    setEditingLap(lapNumber);
    setCommentDraft(comments[lapNumber] ?? "");
  }

  async function handleSaveComment(lapNumber: number) {
    if (!racePlanId) return;
    setCommentSaving(true);

    const response = await fetch(`/api/course-plan/${racePlanId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lap_number: lapNumber, comment: commentDraft }),
    });

    setCommentSaving(false);
    if (!response.ok) return;

    setComments((prev) => {
      const next = { ...prev };
      const trimmed = commentDraft.trim();
      if (trimmed) next[lapNumber] = trimmed;
      else delete next[lapNumber];
      return next;
    });
    setEditingLap(null);
  }

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
        relief_enabled: reliefEnabled,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("L'enregistrement a échoué, réessaie.");
      return;
    }

    const data: { id: string } = await response.json();
    setRacePlanId(data.id);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground-secondary uppercase">
            <IconPencil size={14} className="text-accent" stroke={1.75} />
            <span>
              Modifier le plan de course · {raceName}
              {raceDateLabel && <> · {raceDateLabel}</>}
            </span>
          </div>
          {activateButton}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">Parcours (.gpx)</p>
            {gpxFilename && !gpxCleared && (
              <button
                type="button"
                onClick={handleRemoveGpx}
                className="text-xs font-semibold uppercase tracking-wide text-accent hover:opacity-80"
              >
                Retirer
              </button>
            )}
          </div>
          {gpxFilename && !gpxCleared ? (
            <div className="flex items-center gap-3 rounded-[10px] border border-dashed border-border bg-white/[.02] px-4 py-3">
              <IconMountain size={20} className="shrink-0 text-accent" stroke={1.75} />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">{gpxFilename}</span>
                <span className="text-xs text-foreground-tertiary">
                  {gpxSummary
                    ? `${gpxSummary.distanceKm.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km · D+ ${gpxSummary.elevationGainM} m · D- -${gpxSummary.elevationLossM} m`
                    : "Le D+/D- est analysé pour ajuster les allures de chaque split."}
                </span>
                {staleGpxWithoutReimport && (
                  <span className="text-xs text-alert">Distance ou découpage modifiés — réimporte le GPX pour recalculer le D+/D-.</span>
                )}
              </div>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed border-border bg-white/[.02] px-4 py-6 text-center transition-colors hover:border-accent">
              <IconMountain size={20} className="text-foreground-tertiary" stroke={1.75} />
              <span className="text-sm font-medium text-foreground">Importer la trace de la course</span>
              <span className="text-xs text-foreground-tertiary">Le D+/D- est analysé pour ajuster les allures de chaque split.</span>
              <input type="file" accept=".gpx" onChange={handleGpxFileChange} className="hidden" />
            </label>
          )}
          {gpxError && <p className="text-xs text-alert">{gpxError}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-white/[.02] p-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">Impact du D+/D- sur le chrono</p>
            <span className="text-xs text-foreground-secondary">
              {reliefEnabled ? "Les allures cibles tiennent compte du relief." : "Allure cible identique quel que soit le relief."}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reliefEnabled}
            onClick={() => setReliefEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${reliefEnabled ? "bg-accent" : "bg-white/15"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                reliefEnabled ? "translate-x-[20px]" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-secondary">Allure cible (min:sec / km)</span>
            <PaceInput minValue={paceMin} secValue={paceSec} onMinChange={setPaceMin} onSecChange={setPaceSec} required showUnitSuffix={false} />
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
                className={`${SELECT_CLASS} w-full`}
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="split_mode" className="text-sm font-medium text-foreground-secondary">
              Splits par
            </label>
            <div className="relative">
              <select id="split_mode" value={splitMode} onChange={(e) => setSplitMode(e.target.value)} className={`${SELECT_CLASS} w-full`}>
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
        </div>

        {targetPaceSecPerKmNumber > 0 && (
          <p className="text-[11px] font-semibold tracking-wide text-foreground-tertiary uppercase">
            À {formatPaceCompact(targetPaceSecPerKmNumber)}
          </p>
        )}

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

        {/* Masqués quand un GPX est chargé : le D+/D- vient alors du tracé
            (par split), une saisie manuelle globale serait redondante — voir
            mockup avec GPX importé, qui ne montre pas ces champs. */}
        {(!gpxFilename || gpxCleared) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        )}

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="gradient-signature flex h-11 items-center justify-center gap-2 rounded-[10px] px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <IconDeviceFloppy size={16} stroke={1.75} />
            {loading ? "Enregistrement…" : "Enregistrer et notifier le coureur"}
          </button>
        </div>
      </form>

      {splitsWithCumulative && splitsWithCumulative.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-white/[.02] text-left text-xs font-semibold text-foreground-tertiary uppercase">
                  <th className="px-4 py-2.5">Point</th>
                  <th className="px-4 py-2.5">D+ / D-</th>
                  <th className="px-4 py-2.5">Allure</th>
                  <th className="px-4 py-2.5">Segment</th>
                  <th className="px-4 py-2.5">Cumul</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {splitsWithCumulative.map((split) => {
                  const hasComment = !!comments[split.lapNumber];
                  return (
                    <Fragment key={split.lapNumber}>
                      <tr>
                        <td className="px-4 py-2.5 text-foreground">{formatDistanceKm(split.cumulativeDistanceKm)}</td>
                        <td className="px-4 py-2.5">
                          {split.elevationGainM == null && split.elevationLossM == null ? (
                            <span className="text-foreground-secondary">–</span>
                          ) : (
                            <>
                              <span className="text-green-400">+{split.elevationGainM ?? 0}</span>
                              <span className="text-foreground-tertiary"> / </span>
                              <span className="text-red-400">-{split.elevationLossM ?? 0}</span>
                              <span className="text-foreground-secondary"> m</span>
                            </>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 font-mono ${paceColorClass(split.targetPaceSecPerKm, targetPaceSecPerKmNumber)}`}>
                          {formatPace(split.targetPaceSecPerKm)}
                        </td>
                        <td className="px-4 py-2.5 text-foreground-secondary">{formatDuration(split.segmentSeconds)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-accent">{formatDuration(split.cumulativeSeconds)}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleCommentEditor(split.lapNumber)}
                              disabled={!racePlanId}
                              title={racePlanId ? "Commenter ce split" : "Enregistre le plan pour pouvoir commenter les splits"}
                              className={`rounded-full p-1 transition-colors ${
                                hasComment ? "text-accent" : "text-foreground-tertiary"
                              } ${racePlanId ? "hover:bg-white/[.08]" : "cursor-not-allowed opacity-40"}`}
                            >
                              <IconMessage size={15} stroke={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingLap === split.lapNumber && (
                        <tr>
                          <td colSpan={5} className="bg-white/[.02] px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                placeholder="Commenter ce split…"
                                className="flex-1 rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveComment(split.lapNumber)}
                                disabled={commentSaving}
                                className="rounded-[10px] bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                {commentSaving ? "…" : "OK"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
