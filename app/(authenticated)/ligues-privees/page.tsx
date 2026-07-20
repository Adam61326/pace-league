import { SubTabs } from "@/components/sub-tabs";
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

const LEAGUES_TABS = [
  { href: "/ligues", label: "Par pays" },
  { href: "/ligues-privees", label: "Privées" },
];

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
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Mes ligues privées</h1>
            <p className="text-sm text-zinc-400">
              Défie tes amis ou ton club dans une ligue privée, indépendante des classements
              pays/monde.
            </p>
          </div>
          <SubTabs tabs={LEAGUES_TABS} activeHref="/ligues-privees" />
        </div>

        {leagues.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Tu n&apos;es membre d&apos;aucune ligue privée pour le moment.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link
                  href={`/ligues-privees/${league.id}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/[.06]"
                >
                  <span className="flex-1 font-medium text-white">{league.name}</span>
                  <span className="text-xs text-zinc-400">
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
          className="flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
        >
          Créer une ligue
        </Link>

        <JoinLeagueForm />
      </div>
    </div>
  );
}
