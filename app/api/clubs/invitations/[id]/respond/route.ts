import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: invitationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitation, error: invitationError } = await admin
    .from("club_invitations")
    .select("id, club_id, invited_user_id, invited_by, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (invitationError) {
    console.error("club invitation respond: lookup failed", invitationError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!invitation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Seul le destinataire peut repondre a sa propre invitation.
  if (invitation.invited_user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  if (action === "accept") {
    // Ajoute d'abord le membre : l'invitation n'est marquee "accepted" que si
    // l'ajout reussit, pour ne jamais se retrouver avec un statut accepte
    // sans adhesion correspondante.
    const { error: memberError } = await admin.from("club_members").upsert(
      { club_id: invitation.club_id, user_id: user.id, role: "member", invited_by: invitation.invited_by },
      { onConflict: "club_id,user_id", ignoreDuplicates: true }
    );

    if (memberError) {
      console.error("club invitation respond: failed to add member", memberError);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  }

  const { error: updateError } = await admin
    .from("club_invitations")
    .update({ status: action === "accept" ? "accepted" : "declined" })
    .eq("id", invitationId);

  if (updateError) {
    console.error("club invitation respond: status update failed", updateError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, clubId: invitation.club_id });
}
