import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Le code est unique (contrainte SQL) : en cas de collision (improbable,
  // 36^6 combinaisons), on retente avec un nouveau code plutôt que
  // d'échouer.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();

    const { data: league, error } = await admin
      .from("leagues")
      .insert({ name, code, created_by: user.id })
      .select("id, name, code")
      .single();

    if (error) {
      if (error.code === "23505") continue; // collision de code, on retente
      console.error("league create: insert failed", error);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    const { error: memberError } = await admin
      .from("league_members")
      .insert({ league_id: league.id, user_id: user.id });

    if (memberError) {
      console.error("league create: failed to add creator as member", memberError);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    return NextResponse.json({ league });
  }

  return NextResponse.json({ error: "code_generation_failed" }, { status: 500 });
}
