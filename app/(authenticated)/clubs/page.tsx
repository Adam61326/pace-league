// TODO: backend non implémenté — aucune table `clubs`/`club_members` en base
// (voir CLAUDE.md, audit Sprint 17). UI statique uniquement, aucun appel API.
import { ComingSoon } from "@/components/coming-soon";
import { createClient } from "@/lib/supabase/server";
import { IconUsersGroup } from "@tabler/icons-react";
import { redirect } from "next/navigation";

export default async function ClubsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/clubs");
  }

  return (
    <ComingSoon
      icon={IconUsersGroup}
      title="Clubs"
      description="Rejoins ou crée le club de ta salle, de ton entreprise ou de ton quartier, et compare vos progrès collectifs."
      previewLabel="Aperçu"
      previewRows={3}
    />
  );
}
