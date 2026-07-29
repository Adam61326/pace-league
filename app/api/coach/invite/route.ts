import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Invitation nominative (CLAUDE.md "Vue Coach") : n'importe quel utilisateur
// peut devenir coach, pas de statut a activer. Appelee depuis /recherche
// (mode ?coach=<id>), l'appelant devient coach_id, l'athlete cible est
// fourni dans le body — meme pattern que /api/clubs/[id]/invite (Sprint 18).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const athleteId = typeof body?.athleteId === "string" ? body.athleteId : "";

  if (!athleteId) {
    return NextResponse.json({ error: "invalid_athlete" }, { status: 400 });
  }

  if (athleteId === user.id) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: athlete, error: athleteError } = await admin
    .from("users")
    .select("id")
    .eq("id", athleteId)
    .maybeSingle();

  if (athleteError) {
    console.error("coach invite: athlete lookup failed", athleteError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!athlete) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const { data: existingRelationship } = await admin
    .from("coach_relationships")
    .select("athlete_id")
    .eq("athlete_id", athleteId)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (existingRelationship) {
    return NextResponse.json({ error: "already_coaching" }, { status: 409 });
  }

  const { error: insertError } = await admin
    .from("coach_invitations")
    .insert({ coach_id: user.id, invited_athlete_id: athleteId });

  if (insertError) {
    // Index partiel unique (coach_id, invited_athlete_id) where status='pending'.
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_invited" }, { status: 409 });
    }
    console.error("coach invite: insert failed", insertError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
