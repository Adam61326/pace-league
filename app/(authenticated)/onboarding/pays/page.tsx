import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingCountryForm } from "./onboarding-country-form";

// Étape obligatoire pour un compte connecté via Google (Sprint 15) : pas de
// country_code dans les métadonnées OAuth, contrairement au signup
// email/mdp classique. proxy.ts redirige ici tant que ce champ est vide,
// pour tout chemin protégé — cette page elle-même reste accessible pour ne
// pas boucler.
export default async function OnboardingPaysPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/onboarding/pays");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("country_code")
    .eq("id", user.id)
    .single();

  // Déjà renseigné (retour arrière sur cette page) : rien à faire ici.
  if (profile?.country_code) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const redirectTo = typeof params.redirectTo === "string" ? params.redirectTo : "/dashboard";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-8 shadow-xl">
        <h1 className="mb-2 text-xl font-semibold tracking-tight text-white">
          Bienvenue sur PaceLeague
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          Dernière étape : dis-nous ton pays pour rejoindre le classement.
        </p>
        <OnboardingCountryForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
