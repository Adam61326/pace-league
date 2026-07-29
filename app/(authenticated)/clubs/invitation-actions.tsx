"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Accepter/refuser une invitation club (Sprint 18), depuis la section
// "Invitations reçues" de /clubs. router.refresh() plutôt qu'un state local
// optimiste : après acceptation le club rejoint doit aussi apparaître dans
// "Mes clubs" juste en dessous, la source de vérité reste le serveur.
export function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "accept" | "decline") {
    setLoading(action);
    setError(null);

    const response = await fetch(`/api/clubs/invitations/${invitationId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!response.ok) {
      setError("Une erreur est survenue, réessaie.");
      setLoading(null);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={loading !== null}
          className="flex h-8 items-center justify-center rounded-full border border-border px-3 text-xs font-medium text-foreground-secondary transition-colors hover:bg-white/[.06] disabled:opacity-50"
        >
          {loading === "decline" ? "…" : "Refuser"}
        </button>
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={loading !== null}
          className="gradient-signature flex h-8 items-center justify-center rounded-full px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading === "accept" ? "…" : "Accepter"}
        </button>
      </div>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
