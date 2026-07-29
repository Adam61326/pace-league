import { getPendingInvitations } from "@/lib/club-invitations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Utilisee par la cloche de la sidebar (components/invitations-bell.tsx) :
// la page /clubs appelle getPendingInvitations() directement (server
// component), cette route JSON est pour le fetch cote client de la cloche.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const invitations = await getPendingInvitations(admin, user.id);
    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("club invitations: list failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
