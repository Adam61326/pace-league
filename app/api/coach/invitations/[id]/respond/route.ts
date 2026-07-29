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
    .from("coach_invitations")
    .select("id, coach_id, invited_athlete_id, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (invitationError) {
    console.error("coach invitation respond: lookup failed", invitationError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!invitation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Seul le destinataire peut repondre a sa propre invitation.
  if (invitation.invited_athlete_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  if (action === "decline") {
    const { error: updateError } = await admin
      .from("coach_invitations")
      .update({ status: "declined" })
      .eq("id", invitationId);

    if (updateError) {
      console.error("coach invitation respond: decline failed", updateError);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // action === "accept" : un coureur n'a jamais plus d'un coach actif a la
  // fois (coach_relationships.athlete_id est la cle primaire). Bloque
  // explicitement plutot que de remplacer silencieusement une relation
  // existante - decision produit, voir migration 20260730000000_add_coach.sql.
  // L'invitation reste "pending" dans ce cas : le coureur peut reessayer
  // apres avoir quitte son coach actuel (POST /api/coach/leave).
  const { data: existingRelationship, error: relationshipLookupError } = await admin
    .from("coach_relationships")
    .select("coach_id")
    .eq("athlete_id", user.id)
    .maybeSingle();

  if (relationshipLookupError) {
    console.error("coach invitation respond: relationship lookup failed", relationshipLookupError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (existingRelationship) {
    return NextResponse.json({ error: "already_has_coach" }, { status: 409 });
  }

  const { error: insertRelationshipError } = await admin
    .from("coach_relationships")
    .insert({ athlete_id: user.id, coach_id: invitation.coach_id });

  if (insertRelationshipError) {
    console.error("coach invitation respond: failed to create relationship", insertRelationshipError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { error: acceptError } = await admin
    .from("coach_invitations")
    .update({ status: "accepted" })
    .eq("id", invitationId);

  if (acceptError) {
    console.error("coach invitation respond: accept status update failed", acceptError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Un seul coach actif a la fois : les autres invitations en attente de ce
  // coureur deviennent automatiquement sans objet (CLAUDE.md — "pas
  // d'ambiguite qui traine").
  const { error: autoDeclineError } = await admin
    .from("coach_invitations")
    .update({ status: "declined" })
    .eq("invited_athlete_id", user.id)
    .eq("status", "pending")
    .neq("id", invitationId);

  if (autoDeclineError) {
    console.error("coach invitation respond: auto-decline of other invitations failed", autoDeclineError);
    // Ne bloque pas la reponse : la relation est deja creee avec succes, ce
    // n'est qu'un nettoyage best-effort des autres invitations.
  }

  return NextResponse.json({ ok: true });
}
