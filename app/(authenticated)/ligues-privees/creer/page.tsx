import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateLeagueForm } from "./create-league-form";

export default async function CreerLiguePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/ligues-privees/creer");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Créer une ligue privée</h1>
      <CreateLeagueForm />
    </div>
  );
}
