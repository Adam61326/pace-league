-- Sprint 5 : ligues privées, créées par un utilisateur et rejointes par un
-- code d'invitation à 6 caractères (le code, pas l'id, est ce que les
-- utilisateurs s'échangent pour rejoindre une ligue).
--
-- Toute écriture (création de ligue, ajout de membre) passe exclusivement
-- par des routes serveur utilisant le client admin (service_role) : ni
-- `leagues` ni `league_members` n'ont de policy d'insertion pour
-- anon/authenticated, à l'image de `activities` (écrite uniquement par le
-- webhook). La jointure par code se fait donc via une route serveur qui
-- cherche la ligne exacte correspondant au code fourni ; il n'existe aucune
-- policy de lecture publique/par code qui permettrait de lister ou deviner
-- les ligues existantes.

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index league_members_user_id_idx on public.league_members (user_id);

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

create policy "members can view their leagues"
  on public.leagues for select
  using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = leagues.id and lm.user_id = auth.uid()
    )
  );

-- Policy auto-référentielle standard pour la visibilité de groupe : un
-- membre voit les lignes de league_members des ligues où il est lui-même
-- membre (donc tous ses coéquipiers, pas seulement sa propre ligne).
create policy "members can view fellow members of their leagues"
  on public.league_members for select
  using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = league_members.league_id and lm.user_id = auth.uid()
    )
  );

-- service_role a déjà tous les droits par défaut sur les futures tables
-- (cf. 20260717000002_service_role_grants.sql) ; seuls anon/authenticated
-- ont besoin d'un GRANT explicite.
grant select on public.leagues to authenticated;
grant select on public.league_members to authenticated;
