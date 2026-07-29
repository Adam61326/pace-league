"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Le coureur coaché quitte sa relation lui-même, sans passer par le coach
// (CLAUDE.md "Vue Coach").
export function CoachLeaveButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/coach/leave", { method: "POST" });

    if (!response.ok) {
      setError("Erreur, réessaie.");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLeave}
        disabled={loading}
        className="flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground-secondary transition-colors hover:bg-white/[.06] disabled:opacity-50"
      >
        {loading ? "…" : "Quitter cette relation"}
      </button>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
