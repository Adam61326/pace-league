// TODO: backend non implémenté — aucune table `messages`/`conversations` en
// base (voir CLAUDE.md, audit Sprint 17). UI statique uniquement, aucun appel API.
import { ComingSoon } from "@/components/coming-soon";
import { createClient } from "@/lib/supabase/server";
import { IconMessageCircle } from "@tabler/icons-react";
import { redirect } from "next/navigation";

export default async function MessageriePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/messagerie");
  }

  return (
    <ComingSoon
      icon={IconMessageCircle}
      title="Messagerie"
      description="Discute avec tes rivaux de cohorte, ton club ou tes coéquipiers de ligue privée."
      previewLabel="Aperçu"
      previewRows={5}
    />
  );
}
