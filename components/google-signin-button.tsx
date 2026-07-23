"use client";

import { createClient } from "@/lib/supabase/client";
import { IconBrandGoogle } from "@tabler/icons-react";
import { useState } from "react";

// Partagé entre /login et /signup : un nouvel utilisateur Google n'a jamais
// de country_code dans ses métadonnées OAuth (contrairement au signup
// email/mdp classique) — il est redirigé vers /onboarding/pays au premier
// accès à une page protégée tant qu'il ne l'a pas choisi (voir proxy.ts).
export function GoogleSignInButton({ redirectTo }: { redirectTo: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // Sinon : redirection navigateur vers Google, pas de suite ici.
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 text-sm font-medium text-white transition-colors hover:bg-white/[.08] disabled:opacity-50"
      >
        <IconBrandGoogle size={18} stroke={1.75} />
        {loading ? "Redirection…" : "Continuer avec Google"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
