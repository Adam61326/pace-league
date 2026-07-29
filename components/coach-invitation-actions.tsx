"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type Status = "idle" | "loading" | "conflict" | "error";

// Accepter/refuser une invitation coach (Sprint 19). Cas particulier vs
// clubs : accepter alors qu'une relation coach active existe déjà est
// bloqué côté API (already_has_coach, invitation reste pending) — décision
// produit explicite (pas d'upsert silencieux). En mode complet (page
// /coach), affiche un message clair avec une action combinée "quitter puis
// accepter" pour éviter un aller-retour ; en mode compact (cloche), un
// simple lien vers /coach suffit (pas la place pour la combinaison dans le
// popover).
export function CoachInvitationActions({
  invitationId,
  compact = false,
  onResponded,
}: {
  invitationId: string;
  compact?: boolean;
  onResponded?: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState<"accept" | "decline" | "switch" | null>(null);

  async function respond(action: "accept" | "decline") {
    setBusy(action);
    setStatus("loading");

    const response = await fetch(`/api/coach/invitations/${invitationId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (response.ok) {
      onResponded?.();
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => null);
    setBusy(null);
    if (action === "accept" && body?.error === "already_has_coach") {
      setStatus("conflict");
      return;
    }
    setStatus("error");
  }

  async function leaveThenAccept() {
    setBusy("switch");
    const leaveResponse = await fetch("/api/coach/leave", { method: "POST" });
    if (!leaveResponse.ok) {
      setBusy(null);
      setStatus("error");
      return;
    }
    await respond("accept");
  }

  if (status === "conflict") {
    if (compact) {
      return (
        <p className="text-xs text-foreground-secondary">
          Tu as déjà un coach actif.{" "}
          <Link href="/coach" className="text-accent hover:underline">
            Voir sur /coach
          </Link>
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-2 rounded-[10px] bg-amber-400/10 p-3">
        <p className="text-sm text-amber-400">
          Tu as déjà un coach actif. Quitte cette relation d&apos;abord si tu veux en rejoindre une
          nouvelle.
        </p>
        <button
          type="button"
          onClick={leaveThenAccept}
          disabled={busy !== null}
          className="gradient-signature flex h-9 w-fit items-center justify-center rounded-full px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "switch" ? "…" : "Quitter mon coach actuel et accepter"}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${compact ? "items-stretch" : "items-end"} gap-1`}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={busy !== null}
          className={`flex items-center justify-center rounded-full border border-border font-medium text-foreground-secondary transition-colors hover:bg-white/[.06] disabled:opacity-50 ${
            compact ? "h-7 flex-1 px-2 text-[11px]" : "h-8 px-3 text-xs"
          }`}
        >
          {busy === "decline" ? "…" : "Refuser"}
        </button>
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={busy !== null}
          className={`gradient-signature flex items-center justify-center rounded-full font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${
            compact ? "h-7 flex-1 px-2 text-[11px]" : "h-8 px-3 text-xs"
          }`}
        >
          {busy === "accept" ? "…" : "Accepter"}
        </button>
      </div>
      {status === "error" && <p className="text-xs text-alert">Erreur, réessaie.</p>}
    </div>
  );
}
