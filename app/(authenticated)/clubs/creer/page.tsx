import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateClubForm } from "./create-club-form";

export default async function CreerClubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/clubs/creer");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-16">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Créer un club</h1>
      <CreateClubForm />
    </div>
  );
}
