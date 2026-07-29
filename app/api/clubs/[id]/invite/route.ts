import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Invitation nominative (CLAUDE.md "Clubs") : jamais par code. Appelee depuis
// /recherche (Sprint 16) en mode "inviter dans ce club", l'admin ayant deja
// trouve le coureur par pseudo/nom.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clubId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const invitedUserId = typeof body?.userId === "string" ? body.userId : "";

  if (!invitedUserId) {
    return NextResponse.json({ error: "invalid_user" }, { status: 400 });
  }

  if (invitedUserId === user.id) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 });
  }

  const admin = createAdminClient();

  // clubs n'a pas de policy de lecture publique (voir migration) : seul le
  // client admin peut verifier ici que l'appelant est bien admin de CE club,
  // avant d'accepter d'envoyer une invitation en son nom.
  const { data: membership, error: membershipError } = await admin
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("club invite: membership lookup failed", membershipError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "not_club_admin" }, { status: 403 });
  }

  const { data: invitedUser, error: invitedUserError } = await admin
    .from("users")
    .select("id")
    .eq("id", invitedUserId)
    .maybeSingle();

  if (invitedUserError) {
    console.error("club invite: invited user lookup failed", invitedUserError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!invitedUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const { data: existingMember } = await admin
    .from("club_members")
    .select("user_id")
    .eq("club_id", clubId)
    .eq("user_id", invitedUserId)
    .maybeSingle();

  if (existingMember) {
    return NextResponse.json({ error: "already_member" }, { status: 409 });
  }

  const { error: insertError } = await admin
    .from("club_invitations")
    .insert({ club_id: clubId, invited_user_id: invitedUserId, invited_by: user.id });

  if (insertError) {
    // Index partiel unique (club_id, invited_user_id) where status='pending'.
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_invited" }, { status: 409 });
    }
    console.error("club invite: insert failed", insertError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
