"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_LENGTH = 40;

export function DisplayNameForm({ displayName }: { displayName: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/account/update-display-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: value }),
    });

    if (!response.ok) {
      setError("Impossible d'enregistrer ce nom, réessaie.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="display_name" className="text-sm font-medium text-foreground-secondary">
          Nom affiché
        </label>
        <input
          id="display_name"
          type="text"
          required
          maxLength={MAX_LENGTH}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <p className="text-xs text-foreground-tertiary">
          Visible partout où ton nom apparaît (classements, profil, recherche).
        </p>
      </div>
      {error && <p className="text-sm text-alert">{error}</p>}
      <button
        type="submit"
        disabled={saving || !value.trim()}
        className="gradient-signature flex h-10 w-fit items-center justify-center rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : saved ? "Enregistré ✓" : "Enregistrer"}
      </button>
    </form>
  );
}
