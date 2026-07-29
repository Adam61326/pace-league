"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Accepter/refuser une invitation club (Sprint 18) : partagé entre la
// section "Invitations reçues" de /clubs et la cloche de la sidebar
// (components/invitations-bell.tsx). router.refresh() plutôt qu'un state
// local optimiste : après acceptation le club rejoint doit aussi apparaître
// dans "Mes clubs"/la cloche, la source de vérité reste le serveur (layout
// re-fetch les invitations en attente côté serveur).
export function ClubInvitationActions({
  invitationId,
  compact = false,
  onResponded,
}: {
  invitationId: string;
  compact?: boolean;
  onResponded?: () => void;
}) {
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
      setError("Erreur, réessaie.");
      setLoading(null);
      return;
    }

    onResponded?.();
    router.refresh();
  }

  return (
    <div className={`flex flex-col ${compact ? "items-stretch" : "items-end"} gap-1`}>
      <div className={`flex gap-2 ${compact ? "" : ""}`}>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={loading !== null}
          className={`flex items-center justify-center rounded-full border border-border font-medium text-foreground-secondary transition-colors hover:bg-white/[.06] disabled:opacity-50 ${
            compact ? "h-7 flex-1 px-2 text-[11px]" : "h-8 px-3 text-xs"
          }`}
        >
          {loading === "decline" ? "…" : "Refuser"}
        </button>
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={loading !== null}
          className={`gradient-signature flex items-center justify-center rounded-full font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${
            compact ? "h-7 flex-1 px-2 text-[11px]" : "h-8 px-3 text-xs"
          }`}
        >
          {loading === "accept" ? "…" : "Accepter"}
        </button>
      </div>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
