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
        className="gradient-signature flex h-9 w-fit items-center justify-center rounded-full px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
        className="w-full max-w-md rounded-[10px] border border-border"
      />
      <div className="flex gap-2">
        <a
          href={src}
          download="ma-semaine-paceleague.png"
          className="flex h-9 items-center justify-center rounded-full border border-border px-4 text-xs font-medium text-foreground-secondary transition-colors hover:bg-white/[.06]"
        >
          Télécharger
        </a>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="flex h-9 items-center justify-center rounded-full border border-border px-4 text-xs font-medium text-foreground-secondary transition-colors hover:bg-white/[.06]"
        >
          Masquer
        </button>
      </div>
    </div>
  );
}
