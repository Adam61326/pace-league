"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CONFIRM_TEXT = "SUPPRIMER";

// Confirmation par saisie plutôt qu'un window.confirm() : plus délibéré pour
// une action irréversible, et plus simple à tester (pas de dialogue natif
// bloquant à gérer).
export function DeleteAccountForm() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/account/delete", { method: "POST" });

    if (!response.ok) {
      setError("La suppression a échoué, réessayez.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-red-500/20 bg-red-500/5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-red-300">Supprimer mon compte</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Action définitive : révoque l&apos;accès Strava et efface ton compte, tes activités, tes
          scores et les ligues privées que tu as créées. Impossible à annuler.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={`Tape ${CONFIRM_TEXT} pour confirmer`}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400 sm:w-64"
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={confirmText !== CONFIRM_TEXT || loading}
          className="flex h-10 shrink-0 items-center justify-center rounded-full bg-red-500/90 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Suppression…" : "Supprimer définitivement"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
