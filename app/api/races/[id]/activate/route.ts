import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Marque une course comme active et désactive automatiquement l'ancienne
// (CLAUDE.md "UI — LISTE DE COURSES", point 4). Deux updates séquentiels
// (désactive puis active) plutôt qu'un seul upsert : l'index partiel
// "au plus une active par user" (races_one_active_per_user,
// 20260802000000_add_multi_race_plans.sql) empêcherait d'activer la
// nouvelle avant que l'ancienne ne soit désactivée.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: raceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: race, error: raceError } = await supabase.from("races").select("id, user_id").eq("id", raceId).maybeSingle();

  if (raceError) {
    console.error("races: activate lookup failed", raceError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!race || race.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: deactivateError } = await supabase
    .from("races")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (deactivateError) {
    console.error("races: deactivate failed", deactivateError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { error: activateError } = await supabase.from("races").update({ is_active: true }).eq("id", raceId);

  if (activateError) {
    console.error("races: activate failed", activateError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
