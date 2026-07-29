import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Le coureur coache peut quitter la relation lui-meme a tout moment, sans
// passer par le coach (CLAUDE.md "Vue Coach").
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { error } = await admin.from("coach_relationships").delete().eq("athlete_id", user.id);

  if (error) {
    console.error("coach leave: delete failed", user.id, error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
