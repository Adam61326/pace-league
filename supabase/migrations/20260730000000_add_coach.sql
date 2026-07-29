-- Sprint 19 : Vue Coach — voir CLAUDE.md pour la spec produit. N'importe
-- quel utilisateur peut devenir coach (pas de statut spécial à activer).
--
-- Relation créée par invitation nominative du coach vers un coureur, via
-- /recherche (même pattern que Clubs, Sprint 18 —
-- 20260729000000_add_clubs.sql) : mode contextuel par query param, pas de
-- code, pas de table notifications générique.
--
-- Toute écriture (envoi/réponse à une invitation, création/suppression de la
-- relation) passe exclusivement par des routes serveur utilisant le client
-- admin (service_role), à l'identique de clubs/club_members/club_invitations :
-- aucune de ces deux tables n'a de policy d'insertion/mise à jour/suppression
-- pour anon/authenticated.

-- ============================================================================
-- coach_relationships
-- ============================================================================
-- athlete_id en clé primaire (pas un id de substitution) : garantit au
-- niveau base "un coureur n'a jamais plus d'un coach actif à la fois" sans
-- contrainte supplémentaire — un athlète ne peut littéralement avoir qu'une
-- seule ligne. Accepter une invitation alors qu'une relation existe déjà est
-- bloqué côté route (erreur "already_has_coach", l'invitation reste
-- "pending") plutôt que de remplacer silencieusement l'ancienne relation —
-- voir app/api/coach/invitations/[id]/respond/route.ts. Le coureur doit
-- explicitement quitter sa relation actuelle avant de pouvoir en accepter
-- une nouvelle.
--
-- coach_id "on delete cascade" : si le coach supprime son compte, la
-- relation disparaît avec lui (contrairement aux clubs, pas besoin de
-- promouvoir un remplaçant — un coureur sans coach n'est qu'un état normal
-- de l'app, pas une entité qui doit survivre à tout prix).
create table public.coach_relationships (
  athlete_id uuid primary key references public.users (id) on delete cascade,
  coach_id uuid not null references public.users (id) on delete cascade,
  started_at timestamptz not null default now()
);

create index coach_relationships_coach_id_idx on public.coach_relationships (coach_id);

alter table public.coach_relationships enable row level security;

create policy "athlete can view own coach relationship"
  on public.coach_relationships for select
  using (auth.uid() = athlete_id);

create policy "coach can view their athlete relationships"
  on public.coach_relationships for select
  using (auth.uid() = coach_id);

-- ============================================================================
-- coach_invitations
-- ============================================================================
-- Pas de colonne invited_by distincte : coach_id est déjà l'unique type
-- d'invitant possible ici (contrairement à club_invitations où invited_by
-- distingue l'admin qui invite du membre invité, alors que le club lui-même
-- a un created_by séparé) — une colonne supplémentaire ne ferait que
-- dupliquer coach_id.
create table public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.users (id) on delete cascade,
  invited_athlete_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index coach_invitations_invited_athlete_id_idx on public.coach_invitations (invited_athlete_id);
create index coach_invitations_coach_id_idx on public.coach_invitations (coach_id);

-- Empêche un même coach d'inviter deux fois le même coureur tant qu'une
-- invitation est encore en attente (index partiel : une invitation refusée
-- n'empêche pas d'en renvoyer une nouvelle plus tard) — identique au motif
-- club_invitations_pending_unique_idx.
create unique index coach_invitations_pending_unique_idx
  on public.coach_invitations (coach_id, invited_athlete_id)
  where status = 'pending';

alter table public.coach_invitations enable row level security;

-- Le coureur invité doit voir ses propres invitations en attente.
create policy "athlete can view own coach invitations"
  on public.coach_invitations for select
  using (auth.uid() = invited_athlete_id);

-- Le coach doit voir les invitations qu'il a envoyées (éviter de réinviter
-- le même coureur, liste "invitations en cours" côté Vue Coach).
create policy "coach can view invitations they sent"
  on public.coach_invitations for select
  using (auth.uid() = coach_id);

-- service_role a déjà tous les droits par défaut sur les futures tables
-- (cf. 20260717000002_service_role_grants.sql) ; seul authenticated a
-- besoin d'un GRANT explicite.
grant select on public.coach_relationships to authenticated;
grant select on public.coach_invitations to authenticated;
