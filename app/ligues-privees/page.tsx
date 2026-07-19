import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinLeagueForm } from "./join-league-form";

interface LeagueRow {
  id: string;
  name: string;
  code: string;
  league_members: { count: number }[];
}

export default async function LiguesPriveesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/ligues-privees");
  }

  // RLS ("members can view their leagues") ne renvoie que les ligues dont
  // l'utilisateur courant est membre : pas besoin du client admin ici.
  const { data: rows } = await supabase
    .from("leagues")
    .select("id, name, code, league_members(count)")
    .order("created_at", { ascending: false })
    .returns<LeagueRow[]>();

  const leagues = rows ?? [];

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes ligues privées</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Défie tes amis ou ton club dans une ligue privée, indépendante des classements
            pays/monde.
          </p>
        </div>

        {leagues.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tu n&apos;es membre d&apos;aucune ligue privée pour le moment.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-black/[.08] rounded-md border border-black/[.08] dark:divide-white/[.145] dark:border-white/[.145]">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link
                  href={`/ligues-privees/${league.id}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
                >
                  <span className="flex-1 font-medium">{league.name}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {league.league_members[0]?.count ?? 0} membre
                    {(league.league_members[0]?.count ?? 0) > 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <Link
          href="/ligues-privees/creer"
          className="flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Créer une ligue
        </Link>

        <JoinLeagueForm />
      </div>
    </div>
  );
}
