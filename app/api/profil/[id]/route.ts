import { getPublicProfileData } from "@/lib/profile-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// JSON pour le panel slide-in "stats hebdomadaires" (Sprint 16), ouvert
// depuis les classements (accueil, ligues, ligues privées). Réservé aux
// utilisateurs connectés : /profil est un chemin protégé (proxy.ts), ce
// endpoint applique la même règle plutôt que de la contourner.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const data = await getPublicProfileData(admin, id);

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
