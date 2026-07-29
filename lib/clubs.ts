import type { SupabaseClient } from "@supabase/supabase-js";

interface OtherMemberRow {
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
}

// Avant la suppression d'un compte (app/api/account/delete/route.ts) :
// pour chaque club dont l'utilisateur est admin, promeut un remplaçant
// plutôt que de laisser le club sans admin. Décision produit :
// - un autre admin existe déjà (pas possible aujourd'hui vu qu'il n'y a pas
//   encore de route de co-promotion, mais on ne suppose rien) -> rien à faire
// - sinon, promeut le membre le plus ancien (joined_at) -> pas de choix
//   manuel, la suppression de compte ne doit jamais être bloquée
// - aucun autre membre -> rien à faire, clubs.created_by "on delete cascade"
//   fera disparaître le club avec son créateur
//
// Best-effort et jamais bloquant : appelée dans un try/catch côté appelant,
// à l'image de la révocation Strava dans la même route.
export async function promoteReplacementAdmins(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: adminMemberships, error: adminMembershipsError } = await admin
    .from("club_members")
    .select("club_id")
    .eq("user_id", userId)
    .eq("role", "admin");

  if (adminMembershipsError) throw adminMembershipsError;
  if (!adminMemberships || adminMemberships.length === 0) return;

  for (const { club_id } of adminMemberships) {
    const { data: otherMembers, error: otherMembersError } = await admin
      .from("club_members")
      .select("user_id, role, joined_at")
      .eq("club_id", club_id)
      .neq("user_id", userId)
      .order("joined_at", { ascending: true })
      .returns<OtherMemberRow[]>();

    if (otherMembersError) throw otherMembersError;
    if (!otherMembers || otherMembers.length === 0) continue; // seul membre : le club sera supprimé en cascade

    const alreadyHasAdmin = otherMembers.some((m) => m.role === "admin");
    if (alreadyHasAdmin) continue;

    const replacement = otherMembers[0];
    const { error: promoteError } = await admin
      .from("club_members")
      .update({ role: "admin" })
      .eq("club_id", club_id)
      .eq("user_id", replacement.user_id);

    if (promoteError) throw promoteError;
  }
}
