-- Sprint 13 : remplacement des ligues par pays (divisions A/B/C) par une
-- progression individuelle par paliers (Bronze III -> Legend), saisons
-- passées de 4 à 12 semaines. Voir CLAUDE.md "Logique de progression
-- individuelle par paliers" pour la spec produit.
--
-- L'ancien système (country_scores, divisions A/B/C) N'EST PAS supprimé :
-- la table et son calcul (lib/scoring.ts computeCountryScores) restent en
-- place et continuent d'être alimentés par le cron, au cas où les ligues par
-- pays reviendraient un jour. Seule la page /ligues qui les affichait est
-- remplacée (voir app/(authenticated)/_deprecated/ligues-pays/).

-- ============================================================================
-- seasons : 4 semaines -> 12 semaines
-- ============================================================================
-- "if exists" : rejouable sans erreur si un essai précédent avait déjà fait
-- tomber la contrainte avant d'échouer plus loin dans le script.
alter table public.seasons drop constraint if exists season_length;

-- Corrige la saison de test existante (créée manuellement sur 4 semaines,
-- cf. CLAUDE.md "priorités de développement") pour respecter la nouvelle
-- règle des 12 semaines, plutôt que de la recréer. Doit impérativement
-- s'exécuter avant l'ajout de la nouvelle contrainte ci-dessous, sinon
-- celle-ci échoue immédiatement sur la ligne existante encore à 4 semaines.
update public.seasons
set end_date = start_date + interval '12 weeks'
where end_date <> start_date + interval '12 weeks';

alter table public.seasons add constraint season_length
  check (end_date = start_date + interval '12 weeks');

-- ============================================================================
-- player_tiers : palier courant de chaque joueur, un seul en vigueur.
-- ============================================================================
create table public.player_tiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade unique,
  tier text not null default 'bronze_3' check (tier in (
    'bronze_3', 'bronze_2', 'bronze_1',
    'silver_3', 'silver_2', 'silver_1',
    'gold_3', 'gold_2', 'gold_1',
    'diamond', 'master', 'legend'
  )),
  updated_at timestamptz not null default now()
);

create index player_tiers_tier_idx on public.player_tiers (tier);

alter table public.player_tiers enable row level security;

-- Public en lecture (comme country_scores) : le palier d'un joueur doit être
-- visible par les autres membres de sa cohorte, pas seulement par lui-même.
create policy "player tiers are publicly readable"
  on public.player_tiers for select
  using (true);

grant select on public.player_tiers to authenticated, anon;

-- Un nouvel utilisateur démarre à bronze_3 (CLAUDE.md) : étend le trigger
-- d'auto-provisioning existant plutôt que d'en créer un second.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, country_code)
  values (new.id, new.email, upper(new.raw_user_meta_data ->> 'country_code'));

  insert into public.player_tiers (user_id, tier)
  values (new.id, 'bronze_3');

  return new;
end;
$$;

-- Backfill : les utilisateurs déjà inscrits avant ce sprint n'ont pas de
-- ligne player_tiers (le trigger ne s'applique qu'aux futurs inserts dans
-- auth.users) ; ils démarrent également à bronze_3.
insert into public.player_tiers (user_id, tier)
select id, 'bronze_3' from public.users
on conflict (user_id) do nothing;

-- ============================================================================
-- tier_cohorts / cohort_members : regroupement hebdomadaire par lots de ~30
-- au sein d'un même palier, classement et décision promotion/relégation.
-- ============================================================================
create table public.tier_cohorts (
  id uuid primary key default gen_random_uuid(),
  tier text not null,
  week_start_date date not null,
  -- Une fois true, la cohorte est figée : le mouvement de palier a déjà été
  -- appliqué à player_tiers pour cette semaine et ne doit plus être rejoué
  -- (le cron recalcule les 4 dernières semaines chaque nuit, cf.
  -- app/api/cron/compute-scores).
  movements_applied boolean not null default false,
  created_at timestamptz not null default now()
);

create index tier_cohorts_tier_week_idx on public.tier_cohorts (tier, week_start_date);

alter table public.tier_cohorts enable row level security;

create policy "tier cohorts are publicly readable"
  on public.tier_cohorts for select
  using (true);

grant select on public.tier_cohorts to authenticated, anon;

create table public.cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.tier_cohorts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  week_points numeric not null default 0,
  rank int not null,
  movement text not null default 'stable' check (movement in ('promoted', 'relegated', 'stable')),
  unique (cohort_id, user_id)
);

create index cohort_members_user_id_idx on public.cohort_members (user_id);

alter table public.cohort_members enable row level security;

create policy "cohort members are publicly readable"
  on public.cohort_members for select
  using (true);

grant select on public.cohort_members to authenticated, anon;
