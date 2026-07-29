import { getPendingInvitations } from "@/lib/club-invitations";
import { formatDisplayName } from "@/lib/display-name";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";

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
    .select("display_name, strava_firstname, strava_lastname, strava_profile_photo_url")
    .eq("id", user.id)
    .single();

  const hasNameSource = Boolean(profile?.display_name) || profile?.strava_firstname != null;
  const displayName = hasNameSource
    ? formatDisplayName(profile?.display_name ?? null, profile?.strava_firstname ?? null, profile?.strava_lastname ?? null)
    : user.email!;

  // Invitations club en attente (Sprint 18) : chargées à chaque page pour
  // que la cloche reste à jour partout dans le shell, pas seulement sur
  // /clubs — voir lib/club-invitations.ts. Ne doit jamais faire planter tout
  // le shell (rendu sur chaque page authentifiée) : dégrade silencieusement
  // vers une cloche vide plutôt que de propager l'erreur, contrairement à la
  // page /clubs elle-même où l'échec de cette même requête peut remonter.
  const admin = createAdminClient();
  const pendingInvitations = await getPendingInvitations(admin, user.id).catch((error) => {
    console.error("layout: failed to load pending club invitations", error);
    return [];
  });

  return (
    <div className="flex flex-1 bg-background">
      <Sidebar
        userId={user.id}
        firstname={profile?.strava_firstname ?? null}
        lastname={profile?.strava_lastname ?? null}
        photoUrl={profile?.strava_profile_photo_url ?? null}
        name={displayName}
        email={user.email!}
        pendingInvitations={pendingInvitations}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
