-- Sprint 20 : plusieurs courses en préparation en parallèle — voir CLAUDE.md
-- (section race-plan). Lève la contrainte "un seul plan de course actif par
-- utilisateur" posée par 20260801000000_add_race_plan.sql : chaque course a
-- désormais sa propre ligne `races`, et son propre plan (qui peut ne pas
-- encore exister — pas de ligne race_plans tant qu'il n'est pas rempli, pas
-- de ligne avec des champs null). Au plus une course "active" à la fois.
--
-- Ajoute aussi le nécessaire pour l'éditeur mis à jour : distance choisie
-- via presets (lib/race-plan.ts), distance des splits configurable (au lieu
-- du fixe 1km du sprint précédent), stratégie d'allure (positive/régulière/
-- négative), et D+/D- par split calculé depuis un import GPX (lib/gpx.ts) —
-- au lieu du D+/D- global saisi à la main sur race_plans.

-- ============================================================================
-- races
-- ============================================================================
create table public.races (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  race_date date,
  distance_km numeric not null check (distance_km > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index races_user_id_idx on public.races (user_id);

-- Au plus une course active par utilisateur — index partiel plutôt qu'un
-- trigger : "marquer une course comme active" ne fait qu'un update, l'ancien
-- index unique bloquerait alors l'insertion de la nouvelle ligne active tant
-- que l'ancienne n'est pas désactivée dans la même transaction (voir route
-- app/api/races/[id]/activate qui fait les deux updates ensemble).
create unique index races_one_active_per_user on public.races (user_id) where is_active;

alter table public.races enable row level security;

-- Même pattern propriétaire que race_plans (auth.uid() direct, pas de
-- risque de récursion) : voir 20260801000000_add_race_plan.sql.
create policy "users can view own races"
  on public.races for select
  using (auth.uid() = user_id);

create policy "users can insert own races"
  on public.races for insert
  with check (auth.uid() = user_id);

create policy "users can update own races"
  on public.races for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Pas de suppression de course dans ce sprint (CLAUDE.md "CE QUI N'EST PAS
-- DEMANDÉ") : pas de policy delete, pas de grant delete.

-- Lecture par le coach (même pattern que race_plans, 20260801000000) : un
-- coach ne voit que les courses d'un athlète qu'il coache déjà, jamais en
-- écriture. coach_relationships n'a pas de policy récursive (auth.uid() =
-- coach_id direct, 20260730000000_add_coach.sql).
create policy "coach can view coached athlete races"
  on public.races for select
  using (
    exists (
      select 1 from public.coach_relationships cr
      where cr.athlete_id = races.user_id and cr.coach_id = auth.uid()
    )
  );

grant select, insert, update on public.races to authenticated;

-- ============================================================================
-- race_plans : rattachement à races au lieu d'un plan unique par user
-- ============================================================================
alter table public.race_plans drop constraint if exists race_plans_user_id_key;

alter table public.race_plans
  add column race_id uuid references public.races (id) on delete cascade,
  add column pace_strategy text not null default 'even' check (pace_strategy in ('positive', 'even', 'negative')),
  add column gpx_filename text,
  add column split_distance_km numeric not null default 1 check (split_distance_km > 0);

-- ----------------------------------------------------------------------------
-- Migration des données existantes : un plan déjà rempli lors du sprint
-- précédent devient une course active, avec un nom par défaut raisonnable
-- si aucune info de nom n'existe. Ne casse rien pour les utilisateurs ayant
-- déjà rempli un plan (CLAUDE.md "MIGRATION DES DONNÉES EXISTANTES").
-- ----------------------------------------------------------------------------
insert into public.races (user_id, name, race_date, distance_km, is_active, created_at)
select user_id, coalesce(nullif(trim(race_name), ''), 'Ma course'), race_date, distance_km, true, created_at
from public.race_plans;

update public.race_plans rp
set race_id = r.id
from public.races r
where r.user_id = rp.user_id and rp.race_id is null;

alter table public.race_plans alter column race_id set not null;
alter table public.race_plans add constraint race_plans_race_id_key unique (race_id);

-- ============================================================================
-- race_plan_splits : D+/D- par split (calculé depuis le GPX importé, voir
-- lib/gpx.ts) — remplace le D+/D- global saisi à la main sur race_plans,
-- qui reste en place pour compat mais n'est plus la source d'ajustement
-- d'allure (voir lib/race-plan.ts computeRacePlanSplits).
-- ============================================================================
alter table public.race_plan_splits
  add column elevation_gain_m numeric check (elevation_gain_m >= 0),
  add column elevation_loss_m numeric check (elevation_loss_m >= 0);
