import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface InvitationRow {
  id: string;
  created_at: string;
  clubs: { id: string; name: string; is_official: boolean } | { id: string; name: string; is_official: boolean }[] | null;
  invited_by_user:
    | { id: string; display_name: string | null; strava_firstname: string | null; strava_lastname: string | null; strava_profile_photo_url: string | null }
    | { id: string; display_name: string | null; strava_firstname: string | null; strava_lastname: string | null; strava_profile_photo_url: string | null }[]
    | null;
}

// Liste des invitations club en attente de l'utilisateur courant : utilisee
// par /clubs (section "Invitations recues") et par la cloche de la sidebar
// (components/invitations-bell.tsx). Client admin necessaire : l'utilisateur
// invite n'est pas encore membre du club, donc `clubs` (RLS "members can
// view their clubs") et le profil de l'admin qui invite (RLS users) ne
// seraient pas lisibles via le client authentifie normal — voir migration
// 20260729000000_add_clubs.sql.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("club_invitations")
    .select(
      "id, created_at, clubs(id, name, is_official), invited_by_user:users!invited_by(id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url)"
    )
    .eq("invited_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<InvitationRow[]>();

  if (error) {
    console.error("club invitations: list failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const invitations = (rows ?? []).map((row) => {
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

  return NextResponse.json({ invitations });
}
