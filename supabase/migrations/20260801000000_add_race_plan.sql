-- Plan de course (prérequis minimal pour "Envoyer le plan à la montre") :
-- il n'existait jusqu'ici aucune table de splits ni de page d'édition — voir
-- app/(authenticated)/plan-entrainement/page.tsx (ComingSoon statique, TODO
-- "aucune table training_plans en base"). Scope volontairement réduit à un
-- seul plan de course actif par utilisateur (pas un historique de courses
-- passées, pas de plan d'entraînement semaine par semaine) : le strict
-- nécessaire pour donner un support réel au tableau de splits + à l'export
-- TCX de ce sprint.
--
-- Toute écriture passe par le client authentifié normal (pas le client
-- admin) : contrairement à clubs/coach, il n'y a ici aucun effet de bord sur
-- un autre utilisateur — un coureur ne modifie jamais que sa propre ligne,
-- RLS directe sur auth.uid() suffit (même pattern que "users can update own
-- profile", 20260717000000_init_schema.sql).

-- ============================================================================
-- race_plans
-- ============================================================================
create table public.race_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  race_name text,
  race_date date,
  distance_km numeric not null check (distance_km > 0),
  target_pace_sec_per_km numeric not null check (target_pace_sec_per_km > 0),
  elevation_gain_m numeric check (elevation_gain_m >= 0),
  elevation_loss_m numeric check (elevation_loss_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.race_plans enable row level security;

create policy "users can view own race plan"
  on public.race_plans for select
  using (auth.uid() = user_id);

create policy "users can insert own race plan"
  on public.race_plans for insert
  with check (auth.uid() = user_id);

create policy "users can update own race plan"
  on public.race_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own race plan"
  on public.race_plans for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- race_plan_splits
-- ============================================================================
-- Régénérés en bloc (delete + insert) à chaque enregistrement du plan côté
-- route API plutôt qu'un update ligne par ligne : le nombre de splits change
-- à chaque fois que distance ou allure cible changent, un upsert partiel
-- laisserait des lignes orphelines d'un ancien découpage.
create table public.race_plan_splits (
  id uuid primary key default gen_random_uuid(),
  race_plan_id uuid not null references public.race_plans (id) on delete cascade,
  lap_number int not null check (lap_number > 0),
  distance_km numeric not null check (distance_km > 0),
  target_pace_sec_per_km numeric not null check (target_pace_sec_per_km > 0),
  is_finish_lap boolean not null default false,
  unique (race_plan_id, lap_number)
);

create index race_plan_splits_race_plan_id_idx on public.race_plan_splits (race_plan_id);

alter table public.race_plan_splits enable row level security;

-- Pas de user_id direct sur cette table : l'appartenance se vérifie via
-- race_plans, elle-même filtrée par auth.uid() (pas de risque de récursion
-- RLS ici, contrairement à club_members/league_members — cet EXISTS pointe
-- vers une table différente, pas vers lui-même).
create policy "users can view own race plan splits"
  on public.race_plan_splits for select
  using (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_splits.race_plan_id and rp.user_id = auth.uid()
    )
  );

create policy "users can insert own race plan splits"
  on public.race_plan_splits for insert
  with check (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_splits.race_plan_id and rp.user_id = auth.uid()
    )
  );

create policy "users can delete own race plan splits"
  on public.race_plan_splits for delete
  using (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_splits.race_plan_id and rp.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Lecture par le coach (export TCX "en lecture" depuis la Vue Coach, voir
-- CLAUDE.md "Vue Coach" / app/api/course-plan/[id]/export-tcx) : un coach ne
-- doit voir le plan de course que d'un athlète qu'il coache déjà, jamais
-- écrire dessus. coach_relationships n'a pas de policy récursive (auth.uid()
-- = coach_id direct, 20260730000000_add_coach.sql) donc pas de risque de
-- boucle RLS en la référençant ici.
-- ============================================================================
create policy "coach can view coached athlete race plan"
  on public.race_plans for select
  using (
    exists (
      select 1 from public.coach_relationships cr
      where cr.athlete_id = race_plans.user_id and cr.coach_id = auth.uid()
    )
  );

create policy "coach can view coached athlete race plan splits"
  on public.race_plan_splits for select
  using (
    exists (
      select 1 from public.race_plans rp
      join public.coach_relationships cr on cr.athlete_id = rp.user_id
      where rp.id = race_plan_splits.race_plan_id and cr.coach_id = auth.uid()
    )
  );

-- service_role a déjà tous les droits par défaut sur les futures tables
-- (cf. 20260717000002_service_role_grants.sql) ; seul authenticated a
-- besoin d'un GRANT explicite. Contrairement à clubs/coach (écriture
-- exclusivement via le client admin), ici authenticated a aussi besoin
-- d'insert/update/delete : c'est le client authentifié normal qui écrit,
-- voir note d'en-tête de fichier.
grant select, insert, update, delete on public.race_plans to authenticated;
grant select, insert, delete on public.race_plan_splits to authenticated;
