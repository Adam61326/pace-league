import { createClient } from "@/lib/supabase/server";
import { NavBar } from "./nav-bar";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pas de redirect ici : chaque page authentifiée gère déjà son propre
  // redirect (avec le bon `redirectTo`). Si `user` est absent, la page
  // enfant redirige avant que quoi que ce soit ne soit affiché.
  if (!user) return <>{children}</>;

  const { data: profile } = await supabase
    .from("users")
    .select("strava_firstname, strava_lastname, strava_profile_photo_url, country_code, strava_athlete_id")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.strava_firstname != null
      ? [profile.strava_firstname, profile.strava_lastname].filter(Boolean).join(" ")
      : user.email!;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <NavBar
        userId={user.id}
        firstname={profile?.strava_firstname ?? null}
        lastname={profile?.strava_lastname ?? null}
        photoUrl={profile?.strava_profile_photo_url ?? null}
        name={displayName}
        email={user.email!}
        countryCode={profile?.country_code ?? null}
        isStravaConnected={Boolean(profile?.strava_athlete_id)}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
