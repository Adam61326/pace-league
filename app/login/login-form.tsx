"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  redirectTo,
  initialError,
}: {
  redirectTo: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    initialError ? "La confirmation par e-mail a échoué, veuillez réessayer." : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
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
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-[#39D353]"
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-[#39D353]"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center rounded-full bg-[#39D353] px-5 text-sm font-semibold text-black transition-colors hover:bg-[#2fb845] disabled:opacity-50"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
      <p className="text-center text-sm text-zinc-400">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-medium text-white underline">
          S&apos;inscrire
        </Link>
      </p>
    </form>
  );
}
