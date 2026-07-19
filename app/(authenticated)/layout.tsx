import { initials as computeInitials } from "@/lib/display-name";
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
    .select("strava_firstname, strava_lastname")
    .eq("id", user.id)
    .single();

  const displayInitials =
    computeInitials(profile?.strava_firstname ?? null, profile?.strava_lastname ?? null, "") ||
    user.email!.charAt(0).toUpperCase();

  const displayName =
    profile?.strava_firstname != null
      ? [profile.strava_firstname, profile.strava_lastname].filter(Boolean).join(" ")
      : user.email!;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar initials={displayInitials} name={displayName} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
