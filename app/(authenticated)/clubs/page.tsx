import { Avatar } from "@/components/avatar";
import { formatDisplayName } from "@/lib/display-name";
import { getPendingInvitations } from "@/lib/club-invitations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { IconMailForward, IconUsersGroup } from "@tabler/icons-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InvitationActions } from "./invitation-actions";

interface ClubMembershipRow {
  role: "admin" | "member";
  clubs: { id: string; name: string; is_official: boolean; description: string | null } | { id: string; name: string; is_official: boolean; description: string | null }[] | null;
}

// Clubs (Sprint 18) : entité séparée des ligues privées, rejointe
// uniquement par invitation nominative (jamais par code) — voir CLAUDE.md et
// supabase/migrations/20260729000000_add_clubs.sql.
export default async function ClubsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/clubs");
  }

  // RLS "members can view fellow club members" / "members can view their
  // clubs" : ces deux lectures passent par le client authentifié normal, pas
  // besoin du client admin (contrairement aux invitations, voir plus bas).
  const { data: membershipRows } = await supabase
    .from("club_members")
    .select("role, clubs!inner(id, name, is_official, description)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false })
    .returns<ClubMembershipRow[]>();

  const myClubs = (membershipRows ?? [])
    .map((row) => {
      const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
      return club ? { ...club, role: row.role } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const admin = createAdminClient();
  const invitations = await getPendingInvitations(admin, user.id);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Clubs</h1>
            <p className="text-sm text-foreground-secondary">
              Rejoins ou crée un club — on y entre uniquement sur invitation d&apos;un admin.
            </p>
          </div>
          <Link
            href="/clubs/creer"
            className="gradient-signature flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Créer un club
          </Link>
        </div>

        {invitations.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
              <IconMailForward size={16} stroke={1.75} />
              Invitations reçues
            </h2>
            <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar
                    userId={invitation.invitedBy?.id ?? invitation.id}
                    photoUrl={invitation.invitedBy?.photoUrl ?? null}
                    firstname={invitation.invitedBy?.firstname ?? null}
                    lastname={invitation.invitedBy?.lastname ?? null}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {invitation.club?.name ?? "Club"}
                      {invitation.club?.isOfficial && (
                        <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent uppercase">
                          Officiel
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-foreground-secondary">
                      Invité par{" "}
                      {invitation.invitedBy
                        ? formatDisplayName(
                            invitation.invitedBy.displayName,
                            invitation.invitedBy.firstname,
                            invitation.invitedBy.lastname
                          )
                        : "un admin"}
                    </p>
                  </div>
                  <InvitationActions invitationId={invitation.id} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
            <IconUsersGroup size={16} stroke={1.75} />
            Mes clubs
          </h2>
          {myClubs.length === 0 ? (
            <p className="text-sm text-foreground-secondary">
              Tu n&apos;es membre d&apos;aucun club pour le moment — crée le tien, ou attends une
              invitation.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {myClubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/clubs/${club.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                >
                  <span className="gradient-signature flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px]">
                    <IconUsersGroup size={20} className="text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium text-foreground">
                      {club.name}
                      {club.is_official && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent uppercase">
                          Officiel
                        </span>
                      )}
                    </p>
                    {club.description && (
                      <p className="truncate text-xs text-foreground-secondary">{club.description}</p>
                    )}
                  </div>
                  {club.role === "admin" && (
                    <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground-secondary">
                      Admin
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
