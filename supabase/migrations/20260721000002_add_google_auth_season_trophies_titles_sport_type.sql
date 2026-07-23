-- Sprint 15 : connexion Google, fin de saison avec trophée, titres,
-- correction du filtre par type d'activité Strava. Voir CLAUDE.md.

-- ============================================================================
-- Connexion Google : une connexion OAuth n'a jamais de country_code dans les
-- métadonnées (contrairement au signup email/mdp classique), donc la colonne
-- doit accepter null à la création. La contrainte check existante
-- (`country_code ~ '^[A-Z]{2}$'`) n'a PAS besoin d'être réécrite : en SQL,
-- un CHECK constraint dont l'expression évalue à NULL (ce qui arrive
-- automatiquement dès qu'un opérande est NULL, ex `null ~ '...'`) est
-- considéré satisfait — seule la contrainte NOT NULL bloquait un
-- country_code absent. handle_new_user n'a donc pas besoin d'être modifié
-- non plus : `upper(new.raw_user_meta_data ->> 'country_code')` retourne
-- déjà NULL proprement quand la clé est absente.
-- ============================================================================
alter table public.users alter column country_code drop not null;

-- ============================================================================
-- player_tiers.best_tier_this_season : meilleur palier atteint depuis le
-- début de la saison active. Mis à jour à chaque mouvement de palier
-- (lib/tiers.ts), réinitialisé au palier courant quand une nouvelle saison
-- démarre (lib/seasons.ts). Évite d'avoir à reconstituer un historique
-- complet des changements de palier pour déterminer "le meilleur atteint" à
-- la clôture de saison.
-- ============================================================================
alter table public.player_tiers add column best_tier_this_season text not null default 'bronze_3';

update public.player_tiers set best_tier_this_season = tier where best_tier_this_season = 'bronze_3';

-- ============================================================================
-- season_trophies : meilleur palier atteint par utilisateur, archivé à la
-- clôture de chaque saison (12 semaines). Le palier lui-même reste
-- permanent (player_tiers n'est jamais reset) — seul ce trophée capture un
-- instantané de la saison écoulée.
-- ============================================================================
create table public.season_trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  best_tier_reached text not null,
  created_at timestamptz not null default now(),
  unique (user_id, season_id)
);

create index season_trophies_user_id_idx on public.season_trophies (user_id);

alter table public.season_trophies enable row level security;

-- Donnée personnelle (comme user_badges), pas une donnée compétitive
-- publique : chacun ne voit que ses propres trophées de saison pour l'instant.
create policy "users can view own season trophies"
  on public.season_trophies for select
  using (auth.uid() = user_id);

grant select on public.season_trophies to authenticated;

-- ============================================================================
-- user_titles : calculés à chaque passage du cron (lib/titles.ts), un seul
-- affiché à la fois (le plus récemment débloqué), partout où le nom d'un
-- utilisateur s'affiche déjà (classement, cohorte, ligues privées).
-- ============================================================================
create table public.user_titles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title_key text not null check (title_key in (
    'mountain_goat', 'night_runner', 'early_bird', 'speed_hunter', 'marathon_machine'
  )),
  earned_at timestamptz not null default now(),
  unique (user_id, title_key)
);

create index user_titles_user_id_idx on public.user_titles (user_id);

alter table public.user_titles enable row level security;

-- Lu au même endroit que le nom/avatar d'un utilisateur sur des vues
-- compétitives publiques (classement, cohorte, ligues privées) : lecture
-- publique, comme country_scores/tier_cohorts, pas restreint à son propre
-- user_id (contrairement à user_badges qui reste personnel).
create policy "user titles are publicly readable"
  on public.user_titles for select
  using (true);

grant select on public.user_titles to authenticated, anon;

-- ============================================================================
-- activities.sport_type : capturé depuis le champ sport_type (ou type en
-- repli) renvoyé par Strava. Seules les activités "Run"/"TrailRun" sont
-- scorables (lib/scoring.ts) — corrige un bug où des sorties vélo/marche
-- déjà synchronisées ont pu être comptées à tort. Nullable : les lignes
-- déjà synchronisées avant ce sprint n'ont pas cette donnée tant qu'elles ne
-- sont pas rétro-corrigées (backfill ponctuel, voir CLAUDE.md). L'activité
-- elle-même reste synchronisée et visible sur /mes-activites quel que soit
-- son type : seul le calcul du score l'exclut, ce n'est pas un filtre
-- anti-triche comme GPS/vitesse.
--
-- activities.start_hour_local : heure locale de départ (0-23), extraite de
-- start_date_local. Sert aux titres "Coureur nocturne"/"Lève-tôt" (Sprint 15).
-- ============================================================================
alter table public.activities add column sport_type text;
alter table public.activities add column start_hour_local int check (start_hour_local is null or (start_hour_local >= 0 and start_hour_local <= 23));

-- get_user_streaks (Sprint 9) et get_public_stats (Sprint 9) filtraient déjà
-- sur distance_km >= 1.5 : ajoute le même filtre sport_type que
-- lib/scoring.ts isActivityScorable, sinon un vélo continuerait à alimenter
-- le streak de régularité et le "total_km cumulés" public.
create or replace function public.get_user_streaks(p_user_ids uuid[])
returns table (user_id uuid, streak_days int)
language sql
stable
security definer
set search_path = public
as $$
  with valid_days as (
    select distinct a.user_id, a.activity_date
    from public.activities a
    where a.user_id = any(p_user_ids)
      and a.distance_km >= 1.5
      and a.sport_type in ('Run', 'TrailRun')
  ),
  islands as (
    select
      user_id,
      activity_date,
      activity_date - (row_number() over (partition by user_id order by activity_date))::int as island_key
    from valid_days
  ),
  island_sizes as (
    select user_id, island_key, count(*) as days, max(activity_date) as island_end
    from islands
    group by user_id, island_key
  ),
  last_island as (
    select distinct on (user_id) user_id, days
    from island_sizes
    order by user_id, island_end desc
  )
  select p.id as user_id, coalesce(li.days, 0) as streak_days
  from unnest(p_user_ids) as p(id)
  left join last_island li on li.user_id = p.id;
$$;

create or replace function public.get_public_stats()
returns table (connected_users bigint, countries_count bigint, total_km numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.users where strava_athlete_id is not null) as connected_users,
    (select count(distinct country_code) from public.users where strava_athlete_id is not null) as countries_count,
    (select coalesce(sum(distance_km), 0) from public.activities where distance_km >= 1.5 and sport_type in ('Run', 'TrailRun')) as total_km;
$$;
