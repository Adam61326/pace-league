-- Sprint 18 : Clubs, entité séparée des ligues privées (leagues/league_members
-- ne sont pas réutilisées) — voir CLAUDE.md "Clubs" pour la spec produit.
--
-- Deux types de club : officiel (is_official = true, activé manuellement en
-- base par l'équipe produit, pas de création self-service) et libre
-- (is_official = false, création ouverte à tout utilisateur). Un utilisateur
-- peut appartenir à plusieurs clubs.
--
-- Rejoindre un club se fait UNIQUEMENT par invitation nominative d'un admin
-- du club (jamais par code, contrairement aux ligues privées) : un admin
-- trouve un coureur via /recherche (Sprint 16) puis lui envoie une
-- invitation ; le coureur l'accepte ou la refuse depuis /clubs (pas de
-- système de notification générique dans l'app — voir décision produit,
-- les invitations en attente s'affichent directement dans une section
-- dédiée de /clubs).
--
-- Toute écriture (création de club, envoi/réponse à une invitation, ajout de
-- membre) passe exclusivement par des routes serveur utilisant le client
-- admin (service_role), à l'identique de leagues/league_members
-- (20260717000005_add_private_leagues.sql) : aucune de ces trois tables n'a
-- de policy d'insertion/mise à jour pour anon/authenticated.

-- ============================================================================
-- clubs
-- ============================================================================
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  is_official boolean not null default false,
  description text,
  logo_url text,
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.clubs enable row level security;

-- Pas de policy de lecture publique/par slug (contrairement à un futur
-- annuaire) : un club n'est visible que par ses propres membres, à l'image
-- de "members can view their leagues". Rejoindre étant uniquement par
-- invitation nominative, il n'y a pas besoin de lister/découvrir les clubs
-- existants avant d'en être membre.
create policy "members can view their clubs"
  on public.clubs for select
  using (
    exists (
      select 1 from public.club_members cm
      where cm.club_id = clubs.id and cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- club_members
-- ============================================================================
create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  -- Nullable et "on delete set null" (contrairement à clubs.created_by) : ce
  -- n'est qu'un champ d'audit sur une adhésion déjà établie, pas la ligne
  -- elle-même — si l'admin qui a invité supprime son compte, l'adhésion des
  -- membres qu'il a invités doit survivre.
  invited_by uuid references public.users (id) on delete set null,
  primary key (club_id, user_id)
);

create index club_members_user_id_idx on public.club_members (user_id);

alter table public.club_members enable row level security;

-- Policy auto-référentielle standard (même modèle que
-- "members can view fellow members of their leagues") : un membre voit les
-- lignes club_members de tous les clubs où il est lui-même membre.
create policy "members can view fellow club members"
  on public.club_members for select
  using (
    exists (
      select 1 from public.club_members cm
      where cm.club_id = club_members.club_id and cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- club_invitations
-- ============================================================================
create table public.club_invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  invited_user_id uuid not null references public.users (id) on delete cascade,
  -- Contrairement à club_members.invited_by : ici l'admin qui invite est ce
  -- qui donne son sens à la ligne (comme leagues.created_by), donc cascade
  -- avec lui plutôt que de laisser une invitation orpheline.
  invited_by uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index club_invitations_invited_user_id_idx on public.club_invitations (invited_user_id);
create index club_invitations_club_id_idx on public.club_invitations (club_id);

-- Empêche d'inviter deux fois la même personne dans le même club tant
-- qu'une invitation est encore en attente (index partiel : une invitation
-- refusée n'empêche pas d'en renvoyer une nouvelle plus tard).
create unique index club_invitations_pending_unique_idx
  on public.club_invitations (club_id, invited_user_id)
  where status = 'pending';

alter table public.club_invitations enable row level security;

-- Le coureur invité doit voir ses propres invitations en attente sur /clubs.
create policy "invited users can view own invitations"
  on public.club_invitations for select
  using (auth.uid() = invited_user_id);

-- Un admin de club doit voir les invitations déjà envoyées pour son club
-- (éviter de réinviter la même personne, section "gestion des invitations").
create policy "club admins can view invitations for their clubs"
  on public.club_invitations for select
  using (
    exists (
      select 1 from public.club_members cm
      where cm.club_id = club_invitations.club_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );

-- service_role a déjà tous les droits par défaut sur les futures tables
-- (cf. 20260717000002_service_role_grants.sql) ; seul authenticated a
-- besoin d'un GRANT explicite.
grant select on public.clubs to authenticated;
grant select on public.club_members to authenticated;
grant select on public.club_invitations to authenticated;
