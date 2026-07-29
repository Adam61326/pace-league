import type { SupabaseClient } from "@supabase/supabase-js";

export interface PendingClubInvitation {
  id: string;
  createdAt: string;
  club: { id: string; name: string; isOfficial: boolean } | null;
  invitedBy: {
    id: string;
    displayName: string | null;
    firstname: string | null;
    lastname: string | null;
    photoUrl: string | null;
  } | null;
}

interface InvitationRow {
  id: string;
  created_at: string;
  clubs: { id: string; name: string; is_official: boolean } | { id: string; name: string; is_official: boolean }[] | null;
  invited_by_user:
    | { id: string; display_name: string | null; strava_firstname: string | null; strava_lastname: string | null; strava_profile_photo_url: string | null }
    | { id: string; display_name: string | null; strava_firstname: string | null; strava_lastname: string | null; strava_profile_photo_url: string | null }[]
    | null;
}

// Invitations club en attente d'un utilisateur : reutilise par
// app/api/clubs/invitations/route.ts (cloche + page /clubs) et directement
// par app/(authenticated)/clubs/page.tsx, pour ne jamais dupliquer cette
// requete. `admin` requis : l'utilisateur invite n'est pas encore membre du
// club concerne, donc `clubs` (RLS "members can view their clubs") et le
// profil de l'admin qui invite (RLS users) ne seraient pas lisibles via le
// client authentifie normal.
export async function getPendingInvitations(
  admin: SupabaseClient,
  userId: string
): Promise<PendingClubInvitation[]> {
  const { data: rows, error } = await admin
    .from("club_invitations")
    .select(
      "id, created_at, clubs(id, name, is_official), invited_by_user:users!invited_by(id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url)"
    )
    .eq("invited_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<InvitationRow[]>();

  if (error) throw error;

  return (rows ?? []).map((row) => {
    const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
    const invitedByUser = Array.isArray(row.invited_by_user) ? row.invited_by_user[0] : row.invited_by_user;
    return {
      id: row.id,
      createdAt: row.created_at,
      club: club ? { id: club.id, name: club.name, isOfficial: club.is_official } : null,
      invitedBy: invitedByUser
        ? {
            id: invitedByUser.id,
            displayName: invitedByUser.display_name,
            firstname: invitedByUser.strava_firstname,
            lastname: invitedByUser.strava_lastname,
            photoUrl: invitedByUser.strava_profile_photo_url,
          }
        : null,
    };
  });
}
