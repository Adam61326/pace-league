import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Commentaire par split (icône chat sur le tableau, voir CLAUDE.md). Écrit
// avec le client authentifié normal : la RLS sur race_plan_split_comments
// (20260804000000_add_split_comments.sql) limite déjà l'écriture au
// propriétaire du plan (le coach ne peut que lire), inutile de dupliquer la
// vérification ici.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: racePlanId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("race_plan_split_comments")
    .select("lap_number, comment")
    .eq("race_plan_id", racePlanId);

  if (error) {
    console.error("split comments: list failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ comments: data });
}

function toLapNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Un commentaire vide (après trim) supprime la ligne plutôt que d'enregistrer
// une chaîne vide — évite d'accumuler des lignes fantômes pour des splits
// dont le commentaire a été effacé.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: racePlanId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const lapNumber = toLapNumber(body.lap_number);
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";

  if (!lapNumber) {
    return NextResponse.json({ error: "invalid_lap_number" }, { status: 400 });
  }

  if (!comment) {
    const { error } = await supabase
      .from("race_plan_split_comments")
      .delete()
      .eq("race_plan_id", racePlanId)
      .eq("lap_number", lapNumber);

    if (error) {
      console.error("split comments: delete failed", error);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, comment: null });
  }

  const { error } = await supabase.from("race_plan_split_comments").upsert(
    {
      race_plan_id: racePlanId,
      lap_number: lapNumber,
      comment: comment.slice(0, 2000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "race_plan_id,lap_number" }
  );

  if (error) {
    console.error("split comments: upsert failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, comment: comment.slice(0, 2000) });
}
