"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;

export function CreateClubForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/clubs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError("La création du club a échoué, réessaie.");
      setLoading(false);
      return;
    }

    router.push(`/clubs/${body.club.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-foreground-secondary">
          Nom du club
        </label>
        <input
          id="name"
          type="text"
          required
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-foreground-secondary">
          Description <span className="text-foreground-tertiary">(optionnel)</span>
        </label>
        <textarea
          id="description"
          rows={3}
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="resize-none rounded-[10px] border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <p className="text-xs text-foreground-tertiary">
        Tu en seras automatiquement admin. Les autres coureurs ne pourront rejoindre que sur
        invitation nominative, jamais par code.
      </p>
      {error && <p className="text-sm text-alert">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="gradient-signature flex h-11 w-full items-center justify-center rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Création…" : "Créer le club"}
      </button>
    </form>
  );
}
