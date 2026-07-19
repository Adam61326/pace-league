import { getCountryName } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StravaActions } from "./strava-actions";

const STRAVA_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Vous avez refusé l'accès à votre compte Strava.",
  invalid_state: "La demande de connexion Strava a expiré ou est invalide, réessayez.",
  exchange_failed: "La connexion à Strava a échoué, réessayez.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("country_code, strava_athlete_id")
    .eq("id", user.id)
    .single();

  const params = await searchParams;
  const strava = typeof params.strava === "string" ? params.strava : undefined;
  const stravaError =
    typeof params.strava_error === "string" ? params.strava_error : undefined;

  const isStravaConnected = Boolean(profile?.strava_athlete_id);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>

        {strava === "connected" && (
          <p className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
            Compte Strava connecté avec succès.
          </p>
        )}
        {stravaError && (
          <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            {STRAVA_ERROR_MESSAGES[stravaError] ?? "Une erreur est survenue."}
          </p>
        )}

        <div className="flex flex-col gap-2 rounded-md border border-black/[.08] p-4 text-sm dark:border-white/[.145]">
          <p>
            <span className="text-zinc-500 dark:text-zinc-400">E-mail : </span>
            {user.email}
          </p>
          <p>
            <span className="text-zinc-500 dark:text-zinc-400">Pays : </span>
            {profile?.country_code ? getCountryName(profile.country_code) : "—"}
          </p>
          <p>
            <span className="text-zinc-500 dark:text-zinc-400">Strava : </span>
            {isStravaConnected ? "connecté" : "non connecté"}
          </p>
        </div>

        <StravaActions isConnected={isStravaConnected} />
      </div>
    </div>
  );
}
