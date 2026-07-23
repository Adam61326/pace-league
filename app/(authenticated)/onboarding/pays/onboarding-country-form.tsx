"use client";

import { getSortedCountries } from "@/lib/countries";
import { useRouter } from "next/navigation";
import { useState } from "react";

const countries = getSortedCountries();

export function OnboardingCountryForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/account/update-country", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country_code: countryCode }),
    });

    if (!response.ok) {
      setError("Impossible d'enregistrer ton pays, réessaie.");
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="country" className="text-sm font-medium text-zinc-300">
          Pays
        </label>
        <select
          id="country"
          required
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent"
        >
          <option value="" disabled className="bg-surface text-white">
            Sélectionnez un pays
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code} className="bg-surface text-white">
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading || !countryCode}
        className="flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Enregistrement…" : "Continuer"}
      </button>
    </form>
  );
}
