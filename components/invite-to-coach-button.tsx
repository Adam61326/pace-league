"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "invited" | "error";

// Bouton "Inviter" affiché sur /recherche en mode contextuel (?coach=<id>),
// uniquement quand l'id correspond à l'utilisateur courant (Sprint 19) —
// même pattern que InviteToClubButton (Sprint 18).
export function InviteToCoachButton({ athleteId }: { athleteId: string }) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleInvite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setStatus("loading");

    const response = await fetch("/api/coach/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId }),
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    setStatus("invited");
  }

  if (status === "invited") {
    return <span className="shrink-0 text-xs font-medium text-accent">Invité ✓</span>;
  }

  return (
    <button
      type="button"
      onClick={handleInvite}
      disabled={status === "loading"}
      className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:bg-white/[.06] hover:text-foreground disabled:opacity-50"
    >
      {status === "loading" ? "…" : status === "error" ? "Erreur, réessaie" : "Inviter comme coach"}
    </button>
  );
}
