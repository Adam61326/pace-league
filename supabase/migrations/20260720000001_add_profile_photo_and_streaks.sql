-- Sprint 9 : photo de profil Strava, streak de régularité, stats publiques
-- réelles sur la page d'accueil.

-- strava_profile_photo_url : capturé au callback OAuth et rafraîchi à
-- chaque webhook d'activité (voir lib/strava.ts). Reste null pour les
-- utilisateurs déjà connectés avant ce sprint tant qu'ils ne génèrent pas un
-- nouvel événement Strava (pas de backfill rétroactif — voir memory
-- no-premature-backfill) : la photo par défaut Strava (silhouette
-- générique) est explicitement exclue et stockée comme null plutôt
-- qu'affichée.
alter table public.users add column strava_profile_photo_url text;

-- ============================================================================
-- get_user_streaks : nombre de jours consécutifs (île la plus récente dans
-- les dates d'activité valides) par utilisateur, pour un lot de user_id.
-- ============================================================================
-- Les filtres GPS et vitesse sont déjà appliqués à l'insertion (le webhook
-- n'écrit que des activités has_gps=true et avg_speed_kmh<=22, cf.
-- app/api/strava/webhook) : seul le seuil anti-spam sur la distance
-- (MIN_VALID_DISTANCE_KM, lib/scoring.ts) doit être réappliqué ici.
--
-- Technique "islands and gaps" : pour chaque utilisateur, activity_date moins
-- son rang (ordonné par date) donne la même clé pour toute suite de jours
-- consécutifs ("île"). Le streak affiché est la taille de la dernière île
-- (celle qui contient la date la plus récente), qu'elle se termine
-- aujourd'hui ou plus tôt (CLAUDE.md Sprint 9 : "jusqu'à aujourd'hui ou
-- jusqu'à sa dernière activité").
--
-- security definer (comme handle_new_user) : bypass RLS pour lire les
-- activités de tous les utilisateurs du lot, sans exposer de colonne
-- sensible (la fonction ne renvoie qu'un compteur par user_id).
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

grant execute on function public.get_user_streaks(uuid[]) to authenticated;

-- ============================================================================
-- get_public_stats : bandeau de stats de la page d'accueil publique.
-- ============================================================================
-- Un seul aller-retour, agrégats uniquement (aucune colonne nominative) :
-- appelable par anon sans exposer de PII, contrairement à un accès direct
-- table par table qui nécessiterait le client admin.
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
    (select coalesce(sum(distance_km), 0) from public.activities where distance_km >= 1.5) as total_km;
$$;

grant execute on function public.get_public_stats() to anon, authenticated;
