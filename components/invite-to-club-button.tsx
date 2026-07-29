"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "invited" | "error";

// Bouton "Inviter" affiché sur /recherche en mode contextuel (?club=<id>),
// uniquement pour un admin du club concerné (Sprint 18) — CLAUDE.md "Clubs" :
// rejoindre se fait UNIQUEMENT par invitation nominative envoyée depuis le
// Search tab existant (Sprint 16), jamais par code.
export function InviteToClubButton({ clubId, userId }: { clubId: string; userId: string }) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleInvite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setStatus("loading");

    const response = await fetch(`/api/clubs/${clubId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
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
      {status === "loading" ? "…" : status === "error" ? "Erreur, réessaie" : "Inviter"}
    </button>
  );
}
