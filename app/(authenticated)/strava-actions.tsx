"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StravaActions({ isConnected }: { isConnected: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/strava/disconnect", { method: "POST" });

    if (!response.ok) {
      setError("La déconnexion a échoué, réessayez.");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  if (!isConnected) {
    return (
      <a
        href="/api/strava/connect"
        className="flex h-9 w-full items-center justify-center rounded-full bg-[#FC4C02] px-4 text-xs font-medium text-white transition-colors hover:bg-[#e04502]"
      >
        Connecter mon compte Strava
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={handleDisconnect}
        disabled={loading}
        className="flex h-9 w-full items-center justify-center rounded-full border border-white/10 px-4 text-xs font-medium text-white transition-colors hover:bg-white/[.06] disabled:opacity-50"
      >
        {loading ? "Déconnexion…" : "Déconnecter Strava"}
      </button>
    </div>
  );
}
