import { Avatar } from "@/components/avatar";
import { InviteToClubButton } from "@/components/invite-to-club-button";
import { InviteToCoachButton } from "@/components/invite-to-coach-button";
import { SearchInput } from "@/components/search-input";
import { getCountryFlag, getSortedCountries } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIER, TIER_META, type Tier } from "@/lib/tiers";
import { IconMoodEmpty, IconSearch, IconUserStar, IconUsersGroup } from "@tabler/icons-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const MAX_RESULTS = 30;

interface SearchResultUser {
  id: string;
  display_name: string | null;
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
  country_code: string | null;
}

// Recherche de coureurs par nom ou pays (Sprint 16). Deux requêtes séparées
// (nom / pays) plutôt qu'un seul .or() : combiner un ilike texte libre et un
// .in() sur les codes pays dans la même expression de filtre PostgREST
// obligerait à construire une chaîne fragile ; ici on fusionne simplement les
// deux résultats par id.
//
// Mode contextuel "?club=<id>" (Sprint 18) : le Search tab existant sert
// aussi à un admin de club pour inviter un coureur (CLAUDE.md "Clubs" —
// rejoindre un club se fait UNIQUEMENT par invitation nominative, jamais par
// code). Silencieusement ignoré si le paramètre ne correspond pas à un club
// dont l'utilisateur courant est admin : la recherche normale reste
// disponible plutôt que d'afficher une erreur.
//
// Mode contextuel "?coach=<id>" (Sprint 19) : même pattern pour inviter un
// coureur en tant que coach — CLAUDE.md "Vue Coach". Contrairement aux
// clubs, il n'y a pas d'entité séparée à vérifier : le seul id valide est
// celui de l'utilisateur courant (on ne peut inviter qu'en son propre nom),
// silencieusement ignoré sinon.
export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/recherche");
  }

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const clubId = typeof params.club === "string" ? params.club : "";
  const coachParam = typeof params.coach === "string" ? params.coach : "";

  let inviteClub: { id: string; name: string } | null = null;
  let alreadyMemberIds = new Set<string>();
  let alreadyInvitedIds = new Set<string>();

  if (clubId) {
    const { data: club } = await supabase.from("clubs").select("id, name").eq("id", clubId).maybeSingle();

    if (club) {
      const { data: membership } = await supabase
        .from("club_members")
        .select("role")
        .eq("club_id", clubId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membership?.role === "admin") {
        inviteClub = club;

        const [{ data: memberRows }, { data: invitationRows }] = await Promise.all([
          supabase.from("club_members").select("user_id").eq("club_id", clubId),
          supabase.from("club_invitations").select("invited_user_id").eq("club_id", clubId).eq("status", "pending"),
        ]);

        alreadyMemberIds = new Set((memberRows ?? []).map((r) => r.user_id));
        alreadyInvitedIds = new Set((invitationRows ?? []).map((r) => r.invited_user_id));
      }
    }
  }

  let inviteAsCoach = false;
  let alreadyCoachedIds = new Set<string>();
  let alreadyCoachInvitedIds = new Set<string>();

  if (coachParam && coachParam === user.id) {
    inviteAsCoach = true;

    const [{ data: relationshipRows }, { data: coachInvitationRows }] = await Promise.all([
      supabase.from("coach_relationships").select("athlete_id").eq("coach_id", user.id),
      supabase.from("coach_invitations").select("invited_athlete_id").eq("coach_id", user.id).eq("status", "pending"),
    ]);

    alreadyCoachedIds = new Set((relationshipRows ?? []).map((r) => r.athlete_id));
    alreadyCoachInvitedIds = new Set((coachInvitationRows ?? []).map((r) => r.invited_athlete_id));
  }

  const admin = createAdminClient();
  let results: SearchResultUser[] = [];

  if (q) {
    // Retire les caractères qui casseraient la syntaxe de filtre PostgREST
    // (ilike/or) plutôt que de tenter de les échapper.
    const safeTerm = q.replace(/[%_,()]/g, "");
    const matchingCountryCodes = getSortedCountries()
      .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
      .map((c) => c.code);

    const [{ data: byName }, { data: byCountry }] = await Promise.all([
      safeTerm
        ? admin
            .from("users")
            .select("id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url, country_code")
            .or(
              `display_name.ilike.%${safeTerm}%,strava_firstname.ilike.%${safeTerm}%,strava_lastname.ilike.%${safeTerm}%`
            )
            .limit(MAX_RESULTS)
            .returns<SearchResultUser[]>()
        : Promise.resolve({ data: [] as SearchResultUser[] }),
      matchingCountryCodes.length > 0
        ? admin
            .from("users")
            .select("id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url, country_code")
            .in("country_code", matchingCountryCodes)
            .limit(MAX_RESULTS)
            .returns<SearchResultUser[]>()
        : Promise.resolve({ data: [] as SearchResultUser[] }),
    ]);

    const merged = new Map<string, SearchResultUser>();
    for (const row of [...(byName ?? []), ...(byCountry ?? [])]) {
      merged.set(row.id, row);
    }
    results = Array.from(merged.values()).slice(0, MAX_RESULTS);
  }

  const userIds = results.map((r) => r.id);
  const { data: tierRows } =
    userIds.length > 0
      ? await admin.from("player_tiers").select("user_id, tier").in("user_id", userIds)
      : { data: [] };
  const tierByUser = new Map((tierRows ?? []).map((r) => [r.user_id, r.tier as Tier]));

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Recherche</h1>

        {inviteClub && (
          <div className="flex items-center gap-2 rounded-[10px] bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
            <IconUsersGroup size={16} stroke={1.75} />
            Inviter dans <span className="font-semibold">{inviteClub.name}</span>
          </div>
        )}

        {inviteAsCoach && (
          <div className="flex items-center gap-2 rounded-[10px] bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
            <IconUserStar size={16} stroke={1.75} />
            Inviter un coureur en tant que <span className="font-semibold">coach</span>
          </div>
        )}

        <SearchInput initialQuery={q} />

        {q === "" ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center text-foreground-tertiary">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <IconSearch size={28} className="text-foreground-tertiary" />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-foreground-secondary">Trouvez un coureur</p>
              <p className="text-sm">Recherchez par nom ou par pays</p>
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center text-foreground-tertiary">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <IconMoodEmpty size={28} className="text-foreground-tertiary" />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-foreground-secondary">Aucun coureur trouvé</p>
              <p className="text-sm">Aucun résultat pour « {q} »</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {results.map((row) => {
              const tier = tierByUser.get(row.id) ?? DEFAULT_TIER;
              const profileLink = (
                <Link href={`/profil/${row.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-foreground">
                    {formatDisplayName(row.display_name, row.strava_firstname, row.strava_lastname)}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-foreground-secondary">
                    {row.country_code && <span aria-hidden>{getCountryFlag(row.country_code)}</span>}
                    <span>{TIER_META[tier].label}</span>
                  </p>
                </Link>
              );

              if (inviteClub) {
                const isMember = alreadyMemberIds.has(row.id);
                const isInvited = alreadyInvitedIds.has(row.id);
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-white/[.02] p-3.5"
                  >
                    <Avatar
                      userId={row.id}
                      photoUrl={row.strava_profile_photo_url}
                      firstname={row.strava_firstname}
                      lastname={row.strava_lastname}
                      size={44}
                    />
                    {profileLink}
                    {isMember ? (
                      <span className="shrink-0 text-xs text-foreground-tertiary">Déjà membre</span>
                    ) : isInvited ? (
                      <span className="shrink-0 text-xs text-foreground-tertiary">Invité en attente</span>
                    ) : (
                      <InviteToClubButton clubId={inviteClub.id} userId={row.id} />
                    )}
                  </div>
                );
              }

              if (inviteAsCoach) {
                if (row.id === user.id) return null; // pas de bouton pour s'auto-inviter
                const isCoached = alreadyCoachedIds.has(row.id);
                const isInvited = alreadyCoachInvitedIds.has(row.id);
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-white/[.02] p-3.5"
                  >
                    <Avatar
                      userId={row.id}
                      photoUrl={row.strava_profile_photo_url}
                      firstname={row.strava_firstname}
                      lastname={row.strava_lastname}
                      size={44}
                    />
                    {profileLink}
                    {isCoached ? (
                      <span className="shrink-0 text-xs text-foreground-tertiary">Déjà coaché</span>
                    ) : isInvited ? (
                      <span className="shrink-0 text-xs text-foreground-tertiary">Invité en attente</span>
                    ) : (
                      <InviteToCoachButton athleteId={row.id} />
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={row.id}
                  href={`/profil/${row.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-white/[.02] p-3.5 hover:border-border-strong"
                >
                  <Avatar
                    userId={row.id}
                    photoUrl={row.strava_profile_photo_url}
                    firstname={row.strava_firstname}
                    lastname={row.strava_lastname}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-foreground">
                      {formatDisplayName(row.display_name, row.strava_firstname, row.strava_lastname)}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-foreground-secondary">
                      {row.country_code && <span aria-hidden>{getCountryFlag(row.country_code)}</span>}
                      <span>{TIER_META[tier].label}</span>
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
