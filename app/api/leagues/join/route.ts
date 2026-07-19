import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";

  if (!code) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Lookup par code exact via le client admin : c'est la seule façon
  // d'accéder à une ligue par code, `leagues` n'ayant pas de policy de
  // lecture publique (voir migration 20260717000005).
  const { data: league, error } = await admin
    .from("leagues")
    .select("id, name, code")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("league join: lookup failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!league) {
    return NextResponse.json({ error: "code_not_found" }, { status: 404 });
  }

  const { error: memberError } = await admin
    .from("league_members")
    .upsert(
      { league_id: league.id, user_id: user.id },
      { onConflict: "league_id,user_id", ignoreDuplicates: true }
    );

  if (memberError) {
    console.error("league join: failed to add member", memberError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ league });
}
