// TODO: backend non implémenté — aucune table `training_plans` en base (voir
// CLAUDE.md, audit Sprint 17). UI statique uniquement, aucun appel API.
import { ComingSoon } from "@/components/coming-soon";
import { createClient } from "@/lib/supabase/server";
import { IconClipboardList } from "@tabler/icons-react";
import { redirect } from "next/navigation";

export default async function PlanEntrainementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/plan-entrainement");
  }

  return (
    <ComingSoon
      icon={IconClipboardList}
      title="Plan d'entraînement"
      description="Un plan semaine par semaine adapté à ton objectif (5K, semi, marathon) et à ton palier actuel."
      previewLabel="Aperçu"
      previewRows={4}
    />
  );
}
