"use client";

import { Avatar } from "@/components/avatar";
import { PerformanceRadar } from "@/components/performance-radar";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import type { PerformanceAxis } from "@/lib/performance";
import { TIER_META, type Tier } from "@/lib/tiers";
import { IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface PanelData {
  user: {
    id: string;
    displayName: string | null;
    firstname: string | null;
    lastname: string | null;
    photoUrl: string | null;
    countryCode: string;
  };
  tier: Tier;
  weekly: {
    totalKm: number;
    totalDplus: number;
    totalRuns: number;
    avgPaceSecPerKm: number | null;
  };
  performanceAxes: PerformanceAxis[];
  badges: { key: string; label: string }[];
}

type PanelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: PanelData };

const BADGE_PREVIEW_COUNT = 6;

function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

// Panel slide-in "stats hebdomadaires" (Sprint 16), ouvert en cliquant une
// ligne de classement (accueil, ligues, ligues privées — voir
// components/leaderboard-list.tsx). Les données sont chargées à l'ouverture
// plutôt que préchargées pour chaque ligne du classement : calculer le radar
// de performance et les badges pour ~200 lignes à chaque affichage de page
// serait beaucoup trop coûteux pour un contenu que la plupart des visiteurs
// n'ouvriront jamais.
export function WeeklyStatsPanel({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  if (!userId) return null;

  // key={userId} : remonte tout le contenu quand l'utilisateur ouvert change
  // (état "loading" initial frais), plutôt que de réinitialiser l'état dans
  // un effect — évite un setState synchrone au corps de l'effect.
  return <PanelContent key={userId} userId={userId} onClose={onClose} />;
}

function PanelContent({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/profil/${userId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
      .then((json: PanelData) => {
        if (!cancelled) setState({ status: "ready", data: json });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/60" aria-hidden />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[400px] overflow-y-auto border-l border-white/10 bg-surface">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-surface px-5 py-4">
          <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Stats hebdomadaires
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-6 p-5">
          {state.status === "loading" && <p className="text-sm text-zinc-400">Chargement…</p>}
          {state.status === "error" && (
            <p className="text-sm text-zinc-400">Impossible de charger ce profil.</p>
          )}

          {state.status === "ready" && (
            <>
              <div className="flex items-center gap-3">
                <Avatar
                  userId={state.data.user.id}
                  photoUrl={state.data.user.photoUrl}
                  firstname={state.data.user.firstname}
                  lastname={state.data.user.lastname}
                  size={52}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">
                    {formatDisplayName(
                      state.data.user.displayName,
                      state.data.user.firstname,
                      state.data.user.lastname
                    )}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-zinc-400">
                    <span aria-hidden>{getCountryFlag(state.data.user.countryCode)}</span>
                    <span>{TIER_META[state.data.tier].label}</span>
                  </p>
                </div>
                <Link
                  href={`/profil/${state.data.user.id}`}
                  className="shrink-0 text-xs font-medium text-accent hover:underline"
                >
                  Voir profil
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-white/5 p-3 text-center">
                  <p className="text-lg font-bold text-white">{state.data.weekly.totalKm.toFixed(1)}</p>
                  <p className="text-[11px] text-zinc-400">km</p>
                </div>
                <div className="rounded-md bg-white/5 p-3 text-center">
                  <p className="text-lg font-bold text-white">
                    {Math.round(state.data.weekly.totalDplus)}
                  </p>
                  <p className="text-[11px] text-zinc-400">m D+</p>
                </div>
                <div className="rounded-md bg-white/5 p-3 text-center">
                  <p className="text-lg font-bold text-white">{state.data.weekly.totalRuns}</p>
                  <p className="text-[11px] text-zinc-400">sorties</p>
                </div>
              </div>

              {state.data.weekly.avgPaceSecPerKm != null && (
                <p className="-mt-4 text-center text-xs text-zinc-500">
                  Allure moy. {formatPace(state.data.weekly.avgPaceSecPerKm)}
                </p>
              )}

              <div>
                <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                  Performance
                </p>
                <div className="flex justify-center">
                  <PerformanceRadar axes={state.data.performanceAxes} />
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">Badges</p>
                {state.data.badges.length === 0 ? (
                  <p className="text-sm text-zinc-400">Pas encore de badge débloqué.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {state.data.badges.slice(0, BADGE_PREVIEW_COUNT).map((badge) => (
                        <span
                          key={badge.key}
                          className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                    {state.data.badges.length > BADGE_PREVIEW_COUNT && (
                      <p className="mt-2 text-xs text-zinc-500">
                        +{state.data.badges.length - BADGE_PREVIEW_COUNT} autres badges
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
