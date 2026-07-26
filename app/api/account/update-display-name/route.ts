import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const MAX_LENGTH = 40;

// Édition du nom affiché (Sprint 16, /parametres) — RLS "users can update own
// profile" permet déjà à un utilisateur de modifier sa propre ligne, pas
// besoin du client admin ici (même pattern que update-country).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : null;

  if (!displayName || displayName.length > MAX_LENGTH) {
    return NextResponse.json({ error: "invalid_display_name" }, { status: 400 });
  }

  // .select() après .update() est indispensable ici : sans lui, PostgREST
  // renvoie un succès (error: null) même si 0 ligne n'a été touchée (id
  // inattendu, policy RLS non satisfaite...), et l'appelant ne peut pas
  // distinguer "écrit avec succès" de "silencieusement no-op" — c'est
  // exactement le bug rapporté (Sprint 16) : la sauvegarde semblait réussir
  // côté /parametres sans jamais rien écrire en base.
  const { data, error } = await supabase
    .from("users")
    .update({ display_name: displayName })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("update-display-name: update failed", user.id, displayName, error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!data) {
    console.error("update-display-name: update matched 0 row", user.id, displayName);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
