"use client";

import { IconCheck, IconChevronRight, IconDeviceWatch, IconDownload } from "@tabler/icons-react";
import { useState } from "react";

type WatchBrand = "garmin" | "coros" | "suunto" | "polar";

const BRANDS: { id: WatchBrand; label: string; available: boolean }[] = [
  { id: "garmin", label: "Garmin", available: true },
  { id: "coros", label: "Coros", available: false },
  { id: "suunto", label: "Suunto", available: false },
  { id: "polar", label: "Polar", available: false },
];

export function SendToWatch({ racePlanId, fullLapsCount, hasFinishLap }: { racePlanId: string; fullLapsCount: number; hasFinishLap: boolean }) {
  const [activeBrand, setActiveBrand] = useState<WatchBrand>("garmin");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifyMeClicked, setNotifyMeClicked] = useState(false);

  const totalLaps = fullLapsCount + (hasFinishLap ? 1 : 0);

  async function handleDownload() {
    setDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/api/course-plan/${racePlanId}/export-tcx`);
      if (!response.ok) throw new Error("export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plan-de-course-${racePlanId.slice(0, 8)}.tcx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("L'export a échoué, réessaie.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
        <IconDeviceWatch size={18} stroke={1.75} />
        Envoyer le plan à la montre
      </h2>

      <div className="flex gap-1 rounded-full bg-white/5 p-1">
        {BRANDS.map((brand) => (
          <button
            key={brand.id}
            type="button"
            onClick={() => setActiveBrand(brand.id)}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
              activeBrand === brand.id
                ? "bg-accent/15 text-accent"
                : brand.available
                  ? "text-foreground-secondary hover:bg-white/[.06]"
                  : "text-foreground-tertiary hover:bg-white/[.04]"
            }`}
          >
            {brand.label}
          </button>
        ))}
      </div>

      {activeBrand === "garmin" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-white/[.02] p-4">
            <p className="text-sm font-medium text-foreground">Garmin Connect · Montre compatible</p>
            <p className="text-xs text-foreground-secondary">{totalLaps} lap{totalLaps > 1 ? "s" : ""} programmé{totalLaps > 1 ? "s" : ""}</p>
            <ul className="mt-1 flex flex-col gap-1.5 text-xs text-foreground-secondary">
              <li className="flex items-start gap-2">
                <IconCheck size={14} className="mt-0.5 shrink-0 text-accent" stroke={2} />
                <span>
                  {fullLapsCount} lap{fullLapsCount > 1 ? "s" : ""} de {1} km{hasFinishLap ? " + arrivée" : ""}, allure cible par lap
                </span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck size={14} className="mt-0.5 shrink-0 text-accent" stroke={2} />
                <span>Alerte allure ±3% sur chaque lap</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="gradient-signature flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <IconDownload size={16} />
              {downloading ? "Génération…" : "Envoyer à la montre"}
            </button>
            {error && <p className="text-xs text-alert">{error}</p>}
            <p className="text-xs text-foreground-tertiary">
              Fichier .TCX structuré — importez-le manuellement dans Garmin Connect (Entraînement &gt; Importer).
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-border bg-white/[.02] px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground-secondary">Bientôt disponible</p>
          <p className="text-xs text-foreground-tertiary">
            L&apos;export {BRANDS.find((b) => b.id === activeBrand)?.label}
            {" "}
            n&apos;est pas encore pris en charge.
          </p>
          {notifyMeClicked ? (
            <p className="flex items-center gap-1.5 text-xs text-accent">
              <IconCheck size={14} stroke={2} />
              Merci, on te préviendra !
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setNotifyMeClicked(true)}
              className="flex items-center gap-1 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground-secondary transition-colors hover:bg-white/[.06]"
            >
              Me prévenir
              <IconChevronRight size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
