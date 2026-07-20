"use client";

import Link from "next/link";
import { useState } from "react";

interface CreatedLeague {
  id: string;
  name: string;
  code: string;
}

export function CreateLeagueForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedLeague | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/leagues/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError("La création de la ligue a échoué, réessayez.");
      setLoading(false);
      return;
    }

    setCreated(body.league);
    setLoading(false);
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (created) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-sm text-zinc-400">
          Ligue <strong className="text-white">{created.name}</strong> créée. Partage ce code pour
          inviter des membres :
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/10 px-4 py-2 font-mono text-lg tracking-widest text-white">
            {created.code}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-10 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/[.06]"
          >
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>
        <Link
          href={`/ligues-privees/${created.id}`}
          className="flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
        >
          Voir le classement de la ligue
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-zinc-300">
          Nom de la ligue
        </label>
        <input
          id="name"
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Création…" : "Créer la ligue"}
      </button>
    </form>
  );
}
