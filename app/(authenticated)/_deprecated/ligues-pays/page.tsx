// DÉPRÉCIÉ SPRINT 13 : ancienne page /ligues (ligues par pays, divisions
// A/B/C, promotion/relégation entre pays). Remplacée par la progression
// individuelle par paliers (voir app/(authenticated)/ligues/page.tsx et
// lib/tiers.ts). Conservée ici pour référence si les ligues par pays étaient
// remises en place un jour — ce fichier est dans un dossier préfixé `_`
// (exclu du routing App Router), donc inaccessible depuis le site.
//
// lib/scoring.ts computeCountryScores() et la table country_scores restent
// alimentés par le cron (app/api/cron/compute-scores via lib/recompute.ts)
// pour préserver l'historique, même si plus rien ne les affiche.

import { SubTabs } from "@/components/sub-tabs";
import { getCountryFlag, getCountryName } from "@/lib/countries";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Division = "A" | "B" | "C";
const DIVISIONS: Division[] = ["A", "B", "C"];
const LEAGUES_TABS = [
  { href: "/ligues", label: "Par pays" },
  { href: "/ligues-privees", label: "Privées" },
];

interface CountryScoreRow {
  country_code: string;
  total_points: number;
  active_runners_count: number;
}

// country_scores est en lecture publique (RLS "using (true)", cf. migration
// init) : pas besoin du client admin ici, contrairement à /classement qui a
// besoin de lire des colonnes de `users` restreintes par RLS.
export default async function LiguesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/ligues");
  }

  const params = await searchParams;
  const division: Division = DIVISIONS.includes(params.division as Division)
    ? (params.division as Division)
    : "A";

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);

  const { data: rows } = await supabase
    .from("country_scores")
    .select("country_code, total_points, active_runners_count")
    .eq("week_start_date", weekStartStr)
    .eq("division", division)
    .order("total_points", { ascending: false })
    .returns<CountryScoreRow[]>();

  const countries = rows ?? [];

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Ligues par pays</h1>
            <p className="text-sm text-zinc-400">
              Semaine du {weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC" })} au{" "}
              {weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC" })}
            </p>
          </div>
          <SubTabs tabs={LEAGUES_TABS} activeHref="/ligues" />
        </div>

        <div className="flex gap-2">
          {DIVISIONS.map((d) => (
            <Link
              key={d}
              href={`/ligues?division=${d}`}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                division === d
                  ? "bg-accent text-black"
                  : "border border-white/10 text-zinc-300 hover:bg-white/[.06]"
              }`}
            >
              Division {d}
            </Link>
          ))}
        </div>

        {countries.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Aucun pays classé en division {division} cette semaine pour le moment.
          </p>
        ) : (
          <>
            <ol className="flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
              {countries.map((row, index) => {
                // Promotion : 2 premiers, sauf en division A (personne au-dessus).
                const isPromotion = division !== "A" && index < 2;
                // Relégation : 2 derniers, sauf en division C (personne en dessous).
                const isRelegation = division !== "C" && index >= countries.length - 2;

                return (
                  <li
                    key={row.country_code}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${
                      isPromotion
                        ? "bg-green-500/10"
                        : isRelegation
                          ? "bg-red-500/10"
                          : ""
                    }`}
                  >
                    <span className="w-6 text-right text-zinc-400">{index + 1}</span>
                    <span aria-hidden>{getCountryFlag(row.country_code)}</span>
                    <span className="flex-1 font-medium text-white">
                      {getCountryName(row.country_code)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {row.active_runners_count} coureur{row.active_runners_count > 1 ? "s" : ""}
                    </span>
                    <span className="w-20 text-right font-semibold text-white">
                      {row.total_points} pts
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="flex flex-col gap-1 text-xs text-zinc-400">
              {division !== "A" && (
                <p className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-green-500/10" />
                  Zone de promotion (montée en division {division === "B" ? "A" : "B"})
                </p>
              )}
              {division !== "C" && (
                <p className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-red-500/10" />
                  Zone de relégation (descente en division {division === "A" ? "B" : "C"})
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
