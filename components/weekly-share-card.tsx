"use client";

import { useState } from "react";

// Bouton "Partager ma semaine" (CLAUDE.md Sprint 14) : la carte n'est
// générée (appel à /api/weekly-card, coûte une invocation de fonction) que
// si l'utilisateur clique, pas à chaque chargement du dashboard.
export function WeeklyShareCard({ shareToken }: { shareToken: string }) {
  const [show, setShow] = useState(false);
  const src = `/api/weekly-card/${shareToken}`;

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="flex h-9 w-fit items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
      >
        Partager ma semaine
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Carte de la semaine"
        className="w-full max-w-md rounded-md border border-white/10"
      />
      <div className="flex gap-2">
        <a
          href={src}
          download="ma-semaine-paceleague.png"
          className="flex h-9 items-center justify-center rounded-full border border-white/10 px-4 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[.06]"
        >
          Télécharger
        </a>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="flex h-9 items-center justify-center rounded-full border border-white/10 px-4 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[.06]"
        >
          Masquer
        </button>
      </div>
    </div>
  );
}
