"use client";

import { GoogleSignInButton } from "@/components/google-signin-button";
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
      <p className="text-center text-sm text-zinc-300">
        Un e-mail de confirmation a été envoyé à <strong className="text-white">{email}</strong>.
        Suivez le lien qu&apos;il contient pour activer votre compte.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-zinc-300">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-accent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-zinc-300">
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
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-accent"
        />
      </div>
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
        disabled={loading}
        className="flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Création…" : "Créer mon compte"}
      </button>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-white/10" />
        ou
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <GoogleSignInButton redirectTo="/dashboard" />

      <p className="text-center text-sm text-zinc-400">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-medium text-white underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
