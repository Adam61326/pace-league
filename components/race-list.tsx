"use client";

import { formatDistanceKm, formatRaceDate } from "@/lib/format";
import type { RaceSummary } from "@/lib/race-plan";
import { IconFlag, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function RaceCard({ race, selected }: { race: RaceSummary; selected: boolean }) {
  const dateLabel = formatRaceDate(race.raceDate);
  const subtitle = [dateLabel, formatDistanceKm(race.distanceKm)].filter(Boolean).join(" · ");

  let statusLabel = "PLAN DE COURSE VIDE";
  let statusClass = "text-foreground-tertiary";
  if (race.isActive) {
    statusLabel = "COURSE ACTIVE";
    statusClass = "text-accent";
  } else if (race.hasPlan) {
    statusLabel = "PLAN PRÊT";
    statusClass = "text-foreground-tertiary";
  }

  return (
    <Link
      href={`/plan-entrainement?race=${race.id}`}
      className={`flex min-w-[220px] flex-1 flex-col gap-2 rounded-2xl border p-4 transition-colors ${
        race.isActive
          ? "border-accent bg-accent/[.06]"
          : selected
            ? "border-foreground-tertiary bg-surface"
            : "border-border bg-surface hover:border-foreground-tertiary"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <IconFlag size={16} className={race.isActive ? "text-accent" : "text-foreground-tertiary"} stroke={1.75} />
        {race.name}
      </div>
      <p className="text-xs text-foreground-secondary">{subtitle}</p>
      <p className={`text-xs font-semibold tracking-wide ${statusClass}`}>{statusLabel}</p>
    </Link>
  );
}

function AddRaceForm({ onCreated }: { onCreated: (raceId: string) => void }) {
  const [name, setName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Renseigne un nom de course.");
      return;
    }
    if (!distanceKm || Number(distanceKm) <= 0) {
      setError("Renseigne une distance valide.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/races", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, race_date: raceDate || null, distance_km: Number(distanceKm) }),
    });
    setLoading(false);

    if (!response.ok) {
      setError("La création a échoué, réessaie.");
      return;
    }

    const data = await response.json();
    onCreated(data.id);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="new_race_name" className="text-xs font-medium text-foreground-secondary">
          Nom de la course
        </label>
        <input
          id="new_race_name"
          type="text"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new_race_date" className="text-xs font-medium text-foreground-secondary">
          Date
        </label>
        <input
          id="new_race_date"
          type="date"
          value={raceDate}
          onChange={(e) => setRaceDate(e.target.value)}
          className="rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new_race_distance" className="text-xs font-medium text-foreground-secondary">
          Distance (km)
        </label>
        <input
          id="new_race_distance"
          type="number"
          min={0.1}
          step={0.1}
          value={distanceKm}
          onChange={(e) => setDistanceKm(e.target.value)}
          className="w-28 rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="gradient-signature flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Création…" : "Ajouter"}
      </button>
      {error && <p className="text-xs text-alert sm:basis-full">{error}</p>}
    </form>
  );
}

export function RaceList({ races, selectedRaceId }: { races: RaceSummary[]; selectedRaceId: string | null }) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(races.length === 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-foreground-secondary uppercase">Course à préparer</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground-tertiary">
            {races.length} course{races.length !== 1 ? "s" : ""} programmée{races.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground-secondary transition-colors hover:bg-white/[.06]"
          >
            <IconPlus size={14} stroke={2} />
            Nouvelle course
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddRaceForm
          onCreated={(raceId) => {
            setShowAddForm(false);
            router.push(`/plan-entrainement?race=${raceId}`);
            router.refresh();
          }}
        />
      )}

      {races.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {races.map((race) => (
            <RaceCard key={race.id} race={race} selected={race.id === selectedRaceId} />
          ))}
        </div>
      )}
    </section>
  );
}
