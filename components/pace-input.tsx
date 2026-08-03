"use client";

// Widget "allure cible" partagé (2 inputs numériques min:sec côte à côte)
// — utilisé par RacePlanForm (allure moyenne de course, obligatoire) et par
// TrainingSessionModal (allure cible Endurance + allure cible / rep
// Fractionné, toutes deux optionnelles). Stocke toujours en secondes par km
// côté appelant (voir secPerKmToMinSec / calculs de soumission), jamais en
// texte libre.
const PACE_INPUT_CLASS =
  "w-full rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

export function PaceInput({
  minValue,
  secValue,
  onMinChange,
  onSecChange,
  required,
  showUnitSuffix = true,
}: {
  minValue: string;
  secValue: string;
  onMinChange: (value: string) => void;
  onSecChange: (value: string) => void;
  required?: boolean;
  showUnitSuffix?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        required={required}
        min={0}
        max={59}
        aria-label="Minutes par km"
        placeholder="min"
        value={minValue}
        onChange={(e) => onMinChange(e.target.value)}
        className={PACE_INPUT_CLASS}
      />
      <span className="text-foreground-tertiary">:</span>
      <input
        type="number"
        required={required}
        min={0}
        max={59}
        aria-label="Secondes par km"
        placeholder="sec"
        value={secValue}
        onChange={(e) => onSecChange(e.target.value)}
        className={PACE_INPUT_CLASS}
      />
      {showUnitSuffix && <span className="shrink-0 text-sm text-foreground-tertiary">/km</span>}
    </div>
  );
}
