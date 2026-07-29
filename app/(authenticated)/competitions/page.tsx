// TODO: backend non implémenté — concept distinct des ligues privées
// existantes (leagues/league_members), aucune table dédiée en base (voir
// CLAUDE.md, audit Sprint 17). UI statique uniquement, aucun appel API.
import { ComingSoon } from "@/components/coming-soon";
import { createClient } from "@/lib/supabase/server";
import { IconTournament } from "@tabler/icons-react";
import { redirect } from "next/navigation";

export default async function CompetitionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/competitions");
  }

  return (
    <ComingSoon
      icon={IconTournament}
      title="Compétitions"
      description="Des événements ponctuels et des courses virtuelles, en plus de la progression par paliers et des ligues privées."
      previewLabel="Aperçu"
      previewRows={3}
    />
  );
}
