// TODO: backend non implémenté — aucune notion de relation coach/coaché en
// base (voir CLAUDE.md, audit Sprint 17). UI statique uniquement, aucun appel API.
import { ComingSoon } from "@/components/coming-soon";
import { createClient } from "@/lib/supabase/server";
import { IconUserStar } from "@tabler/icons-react";
import { redirect } from "next/navigation";

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/coach");
  }

  return (
    <ComingSoon
      icon={IconUserStar}
      title="Vue Coach"
      description="Suis la progression de tes athlètes, ajuste leurs plans et repère qui a besoin d'attention cette semaine."
      previewLabel="Aperçu"
      previewRows={4}
    />
  );
}
