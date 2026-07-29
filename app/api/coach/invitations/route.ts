import { getPendingCoachInvitations } from "@/lib/coach";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Invitations coach en attente de l'utilisateur courant (en tant
// qu'athlete) : utilisee par la cloche (components/invitations-bell.tsx) et
// par /coach. La page /coach appelle getPendingCoachInvitations()
// directement (server component) ; cette route JSON sert au fetch cote
// client de la cloche.
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
    const invitations = await getPendingCoachInvitations(admin, user.id);
    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("coach invitations: list failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
