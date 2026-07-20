"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const JOIN_ERROR_MESSAGES: Record<string, string> = {
  code_not_found: "Aucune ligue ne correspond à ce code.",
  invalid_code: "Entrez un code valide.",
  unauthorized: "Vous devez être connecté.",
  server_error: "Une erreur est survenue, réessayez.",
};

export function JoinLeagueForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(JOIN_ERROR_MESSAGES[body.error] ?? "Une erreur est survenue.");
      setLoading(false);
      return;
    }

    router.push(`/ligues-privees/${body.league.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="code" className="text-sm font-medium text-zinc-300">
        Rejoindre avec un code
      </label>
      <div className="flex gap-2">
        <input
          id="code"
          type="text"
          required
          maxLength={6}
          placeholder="K7XQ2P"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white uppercase outline-none placeholder:text-zinc-500 focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex h-10 items-center justify-center rounded-full border border-white/10 px-5 text-sm font-medium text-white transition-colors hover:bg-white/[.06] disabled:opacity-50"
        >
          {loading ? "…" : "Rejoindre"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
