import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const MAX_ATTEMPTS = 5;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;

// Slug URL-friendly derive du nom (pas encore affiche nulle part ce sprint,
// reserve pour une future page publique de club - voir migration
// 20260729000000_add_clubs.sql). Accents retires plutot qu'echappes : un nom
// avec caracteres accentues doit quand meme produire un slug ASCII propre.
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "club";
}

// Creation self-service : toujours un club "libre" (is_official=false).
// Les clubs officiels sont actives manuellement en base par l'equipe produit
// (CLAUDE.md, pas de route pour ca).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
      : null;

  if (!name) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const admin = createAdminClient();
  const baseSlug = slugify(name);

  // Le slug est unique (contrainte SQL) : en cas de collision, on retente
  // avec un suffixe numerique plutot que d'echouer (meme approche que le
  // code a 6 caracteres des ligues privees).
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    const { data: club, error } = await admin
      .from("clubs")
      .insert({ name, slug, description, is_official: false, created_by: user.id })
      .select("id, name, slug, is_official, description")
      .single();

    if (error) {
      if (error.code === "23505") continue; // collision de slug, on retente
      console.error("club create: insert failed", error);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    const { error: memberError } = await admin
      .from("club_members")
      .insert({ club_id: club.id, user_id: user.id, role: "admin" });

    if (memberError) {
      console.error("club create: failed to add creator as admin member", memberError);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    return NextResponse.json({ club });
  }

  return NextResponse.json({ error: "slug_generation_failed" }, { status: 500 });
}
