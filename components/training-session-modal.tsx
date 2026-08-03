"use client";

import { formatFullDateUpper } from "@/lib/format";
import { OPTION_CLASS, SELECT_CLASS, SelectChevron } from "@/components/select-field";
import { PaceInput } from "@/components/pace-input";
import {
  SESSION_TYPE_META,
  SESSION_TYPES,
  type RecoveryType,
  type RepUnit,
  type SessionType,
  type TrainingSession,
} from "@/lib/training-sessions";
import { useRouter } from "next/navigation";
import { useState } from "react";

function secPerKmToMinSec(secPerKm: number | null | undefined): { min: string; sec: string } {
  if (secPerKm == null) return { min: "", sec: "" };
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return { min: String(min), sec: String(sec).padStart(2, "0") };
}

function durationSecToHms(durationSec: number | null | undefined): { h: string; min: string; sec: string } {
  if (durationSec == null) return { h: "", min: "", sec: "" };
  const h = Math.floor(durationSec / 3600);
  const min = Math.floor((durationSec % 3600) / 60);
  const sec = durationSec % 60;
  return { h: h > 0 ? String(h) : "", min: String(min), sec: String(sec) };
}

const INPUT_CLASS =
  "w-full rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <label className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">{label}</label>
      {children}
    </div>
  );
}

// Modal "Ajouter une séance" (clic sur un jour du calendrier, vide ou déjà
// rempli) — voir components/training-calendar.tsx. Champs entièrement
// différents d'un type à l'autre (voir captures fournies) : vrai
// remplacement de la zone de champs selon l'onglet actif, pas un seul
// formulaire avec des champs cachés/grisés.
export function TrainingSessionModal({
  dateStr,
  initialSession,
  onClose,
}: {
  dateStr: string;
  initialSession: TrainingSession | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const initialDetails = initialSession?.details ?? {};
  const initialDuration = durationSecToHms(initialDetails.durationSec);
  const initialPace = secPerKmToMinSec(initialDetails.targetPaceSecPerKm);
  const initialRepPace = secPerKmToMinSec(initialDetails.targetPaceSecPerKmPerRep);

  const [type, setType] = useState<SessionType>(initialSession?.type ?? "endurance");

  // Endurance
  const [distanceKm, setDistanceKm] = useState(initialDetails.distanceKm != null ? String(initialDetails.distanceKm) : "");
  const [durationH, setDurationH] = useState(initialDuration.h);
  const [durationMin, setDurationMin] = useState(initialDuration.min);
  const [durationSecInput, setDurationSecInput] = useState(initialDuration.sec);
  const [paceMin, setPaceMin] = useState(initialPace.min);
  const [paceSec, setPaceSec] = useState(initialPace.sec);
  const [targetHr, setTargetHr] = useState(initialDetails.targetHr ?? "");

  // Fractionné
  const [warmupMin, setWarmupMin] = useState(initialDetails.warmupMin != null ? String(initialDetails.warmupMin) : "");
  const [repCount, setRepCount] = useState(initialDetails.repCount != null ? String(initialDetails.repCount) : "");
  const [repUnit, setRepUnit] = useState<RepUnit>(initialDetails.repUnit ?? "distance");
  const [repValue, setRepValue] = useState(initialDetails.repValue ?? "");
  const [repPaceMin, setRepPaceMin] = useState(initialRepPace.min);
  const [repPaceSec, setRepPaceSec] = useState(initialRepPace.sec);
  const [recoverySec, setRecoverySec] = useState(initialDetails.recoverySec != null ? String(initialDetails.recoverySec) : "");
  const [recoveryType, setRecoveryType] = useState<RecoveryType>(initialDetails.recoveryType ?? "trot");
  const [cooldownMin, setCooldownMin] = useState(initialDetails.cooldownMin != null ? String(initialDetails.cooldownMin) : "");
  const [stopRule, setStopRule] = useState(initialDetails.stopRule ?? "");

  // Renfo / PPG
  const [renfoDurationMin, setRenfoDurationMin] = useState(initialDetails.durationMin != null ? String(initialDetails.durationMin) : "");
  const [exercises, setExercises] = useState(initialDetails.exercises ?? "");

  // Commun
  const [notes, setNotes] = useState(initialSession?.notes ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let details: Record<string, unknown> = {};
    if (type === "endurance") {
      const durationSec = (Number(durationH) || 0) * 3600 + (Number(durationMin) || 0) * 60 + (Number(durationSecInput) || 0);
      const targetPaceSecPerKm = (Number(paceMin) || 0) * 60 + (Number(paceSec) || 0);
      details = {
        distanceKm: distanceKm ? Number(distanceKm) : null,
        durationSec: durationSec > 0 ? durationSec : null,
        targetPaceSecPerKm: targetPaceSecPerKm > 0 ? targetPaceSecPerKm : null,
        targetHr: targetHr || null,
      };
    } else if (type === "fractionne") {
      const repPaceSecTotal = (Number(repPaceMin) || 0) * 60 + (Number(repPaceSec) || 0);
      details = {
        distanceKm: distanceKm ? Number(distanceKm) : null,
        warmupMin: warmupMin ? Number(warmupMin) : null,
        repCount: repCount ? Number(repCount) : null,
        repUnit,
        repValue: repValue || null,
        targetPaceSecPerKmPerRep: repPaceSecTotal > 0 ? repPaceSecTotal : null,
        recoverySec: recoverySec ? Number(recoverySec) : null,
        recoveryType,
        cooldownMin: cooldownMin ? Number(cooldownMin) : null,
        stopRule: stopRule || null,
      };
    } else if (type === "renfo_ppg") {
      details = {
        durationMin: renfoDurationMin ? Number(renfoDurationMin) : null,
        exercises: exercises || null,
      };
    }

    const response = await fetch("/api/training-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_date: dateStr,
        session_type: type,
        details,
        notes: notes || null,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("L'enregistrement a échoué, réessaie.");
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/60" aria-hidden />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground uppercase">
              {formatFullDateUpper(dateStr)}
            </h2>
            <p className="text-sm text-foreground-secondary">Choisis le type de séance</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {SESSION_TYPES.map((sessionType) => (
                <button
                  key={sessionType}
                  type="button"
                  onClick={() => setType(sessionType)}
                  className={`rounded-[10px] px-4 py-2 text-xs font-semibold tracking-wide uppercase transition-colors ${
                    type === sessionType
                      ? SESSION_TYPE_META[sessionType].activeTabClass
                      : "border border-accent/20 bg-accent/10 text-foreground-secondary hover:bg-accent/15"
                  }`}
                >
                  {SESSION_TYPE_META[sessionType].label}
                </button>
              ))}
            </div>

            {type === "endurance" && (
              <>
                <Field label="Distance totale (km)">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="km"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </Field>

                <Field label="Durée">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} aria-label="Heures" placeholder="h" value={durationH} onChange={(e) => setDurationH(e.target.value)} className={INPUT_CLASS} />
                    <input type="number" min={0} max={59} aria-label="Minutes" placeholder="min" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className={INPUT_CLASS} />
                    <input type="number" min={0} max={59} aria-label="Secondes" placeholder="sec" value={durationSecInput} onChange={(e) => setDurationSecInput(e.target.value)} className={INPUT_CLASS} />
                  </div>
                </Field>

                <Field label="Allure cible">
                  <PaceInput minValue={paceMin} secValue={paceSec} onMinChange={setPaceMin} onSecChange={setPaceSec} />
                </Field>

                <Field label="FC cible">
                  <input type="text" placeholder="ex : 150-160 bpm" value={targetHr} onChange={(e) => setTargetHr(e.target.value)} className={INPUT_CLASS} />
                </Field>
              </>
            )}

            {type === "fractionne" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Distance totale (km)">
                  <input type="number" min={0} step={0.1} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Échauffement (min)">
                  <input type="number" min={0} value={warmupMin} onChange={(e) => setWarmupMin(e.target.value)} className={INPUT_CLASS} />
                </Field>

                <Field label="Nb répétitions">
                  <input type="number" min={0} value={repCount} onChange={(e) => setRepCount(e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Unité de la répétition">
                  <div className="relative">
                    <select value={repUnit} onChange={(e) => setRepUnit(e.target.value as RepUnit)} className={`${SELECT_CLASS} w-full`}>
                      <option value="distance" className={OPTION_CLASS}>Distance (m)</option>
                      <option value="time" className={OPTION_CLASS}>Temps (s)</option>
                    </select>
                    <SelectChevron />
                  </div>
                </Field>

                <Field label="Valeur par répétition">
                  <input type="text" placeholder="ex : 1000 ou 180" value={repValue} onChange={(e) => setRepValue(e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Allure cible / rep">
                  <PaceInput minValue={repPaceMin} secValue={repPaceSec} onMinChange={setRepPaceMin} onSecChange={setRepPaceSec} />
                </Field>

                <Field label="Récupération (s)">
                  <input type="number" min={0} value={recoverySec} onChange={(e) => setRecoverySec(e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Type de récup">
                  <div className="relative">
                    <select value={recoveryType} onChange={(e) => setRecoveryType(e.target.value as RecoveryType)} className={`${SELECT_CLASS} w-full`}>
                      <option value="trot" className={OPTION_CLASS}>Trot</option>
                      <option value="marche" className={OPTION_CLASS}>Marche</option>
                      <option value="statique" className={OPTION_CLASS}>Statique</option>
                    </select>
                    <SelectChevron />
                  </div>
                </Field>

                <Field label="Retour au calme (min)" full>
                  <input type="number" min={0} value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} className={INPUT_CLASS} />
                </Field>

                <Field label="Règle d'arrêt" full>
                  <textarea
                    rows={2}
                    placeholder="ex : Gêne ischio-jambier > 1/10 → arrêt"
                    value={stopRule}
                    onChange={(e) => setStopRule(e.target.value)}
                    className={`${INPUT_CLASS} resize-none`}
                  />
                </Field>
              </div>
            )}

            {type === "renfo_ppg" && (
              <>
                <Field label="Durée (min)">
                  <input type="number" min={0} value={renfoDurationMin} onChange={(e) => setRenfoDurationMin(e.target.value)} className={INPUT_CLASS} />
                </Field>
                <Field label="Exercices">
                  <textarea
                    rows={3}
                    placeholder="ex : isométrie ischio 3×45s, nordic curl 3×8..."
                    value={exercises}
                    onChange={(e) => setExercises(e.target.value)}
                    className={`${INPUT_CLASS} resize-none`}
                  />
                </Field>
              </>
            )}

            <Field label="Notes">
              <textarea rows={type === "repos" ? 4 : 3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${INPUT_CLASS} resize-none`} />
            </Field>

            {error && <p className="text-sm text-alert">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="rounded-[10px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[10px] border border-border px-5 py-2.5 text-sm font-semibold text-foreground-secondary transition-colors hover:bg-white/[.06]"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
