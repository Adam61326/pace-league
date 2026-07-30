"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ActivateRaceButton({ raceId }: { raceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const response = await fetch(`/api/races/${raceId}/activate`, { method: "POST" });
    setLoading(false);
    if (response.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-full border border-accent/40 px-3.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
    >
      {loading ? "…" : "Marquer comme course active"}
    </button>
  );
}
