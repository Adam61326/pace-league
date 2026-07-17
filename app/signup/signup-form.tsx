"use client";

import { getSortedCountries } from "@/lib/countries";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const countries = getSortedCountries();

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { country_code: countryCode },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Confirmation par e-mail requise avant de pouvoir se connecter.
    setConfirmationSent(true);
    setLoading(false);
  }

  if (confirmationSent) {
    return (
      <p className="max-w-sm text-center text-sm text-zinc-600 dark:text-zinc-400">
        Un e-mail de confirmation a été envoyé à <strong>{email}</strong>. Suivez le
        lien qu&apos;il contient pour activer votre compte.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/[.145] dark:focus:border-white/40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/[.145] dark:focus:border-white/40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="country" className="text-sm font-medium">
          Pays
        </label>
        <select
          id="country"
          required
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/[.145] dark:focus:border-white/40"
        >
          <option value="" disabled>
            Sélectionnez un pays
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {loading ? "Création…" : "Créer mon compte"}
      </button>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-medium underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
