-- Sprint 14 : badges, rivaux (basés sur la cohorte), Hall of Fame, cartes
-- hebdomadaires partageables. Voir CLAUDE.md pour la logique produit.

-- ============================================================================
-- badges / user_badges
-- ============================================================================
create table public.badges (
  key text primary key,
  category text not null check (category in ('distance', 'dplus', 'regularity', 'performance')),
  label text not null,
  description text not null,
  threshold_value numeric,
  threshold_unit text
);

alter table public.badges enable row level security;

create policy "badges are publicly readable"
  on public.badges for select
  using (true);

grant select on public.badges to authenticated, anon;

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  badge_key text not null references public.badges (key) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_key)
);

create index user_badges_user_id_idx on public.user_badges (user_id);

alter table public.user_badges enable row level security;

-- Données personnelles (comme weekly_scores/activities/best_efforts), pas
-- une donnée compétitive publique comme country_scores/tier_cohorts : un
-- utilisateur ne voit que ses propres badges pour l'instant.
create policy "users can view own badges"
  on public.user_badges for select
  using (auth.uid() = user_id);

grant select on public.user_badges to authenticated;

insert into public.badges (key, category, label, description, threshold_value, threshold_unit) values
  ('distance_5km', 'distance', '5 km cumulés', 'Avoir couru 5 km au total.', 5, 'km'),
  ('distance_10km', 'distance', '10 km cumulés', 'Avoir couru 10 km au total.', 10, 'km'),
  ('distance_21km', 'distance', '21,1 km cumulés', 'L''équivalent d''un semi-marathon, cumulé.', 21.1, 'km'),
  ('distance_42km', 'distance', '42,2 km cumulés', 'L''équivalent d''un marathon, cumulé.', 42.2, 'km'),
  ('distance_100km', 'distance', '100 km cumulés', 'Avoir couru 100 km au total.', 100, 'km'),
  ('distance_500km', 'distance', '500 km cumulés', 'Avoir couru 500 km au total.', 500, 'km'),
  ('distance_1000km', 'distance', '1 000 km cumulés', 'Avoir couru 1 000 km au total.', 1000, 'km'),
  ('distance_5000km', 'distance', '5 000 km cumulés', 'Avoir couru 5 000 km au total.', 5000, 'km'),
  ('distance_10000km', 'distance', '10 000 km cumulés', 'Avoir couru 10 000 km au total.', 10000, 'km'),
  ('dplus_1000m', 'dplus', '1 000 m de D+ cumulés', 'Avoir grimpé 1 000 m de dénivelé positif au total.', 1000, 'm'),
  ('dplus_5000m', 'dplus', '5 000 m de D+ cumulés', 'Avoir grimpé 5 000 m de dénivelé positif au total.', 5000, 'm'),
  ('dplus_10000m', 'dplus', '10 000 m de D+ cumulés', 'Avoir grimpé 10 000 m de dénivelé positif au total.', 10000, 'm'),
  ('dplus_50000m', 'dplus', '50 000 m de D+ cumulés', 'Avoir grimpé 50 000 m de dénivelé positif au total.', 50000, 'm'),
  ('dplus_100000m', 'dplus', '100 000 m de D+ cumulés', 'Avoir grimpé 100 000 m de dénivelé positif au total.', 100000, 'm'),
  ('streak_7d', 'regularity', '7 jours de série', 'Courir 7 jours consécutifs.', 7, 'jours'),
  ('streak_30d', 'regularity', '30 jours de série', 'Courir 30 jours consécutifs.', 30, 'jours'),
  ('streak_100d', 'regularity', '100 jours de série', 'Courir 100 jours consécutifs.', 100, 'jours'),
  ('streak_365d', 'regularity', '365 jours de série', 'Courir 365 jours consécutifs.', 365, 'jours'),
  ('top1000_world', 'performance', 'Top 1000 mondial', 'Terminer une semaine dans le top 1000 mondial du classement individuel.', 1000, 'rang mondial'),
  ('top100_france', 'performance', 'Top 100 France', 'Terminer une semaine dans le top 100 France du classement individuel.', 100, 'rang France'),
  ('top10_france', 'performance', 'Top 10 France', 'Terminer une semaine dans le top 10 France du classement individuel.', 10, 'rang France'),
  ('weekly_win', 'performance', 'Victoire hebdomadaire', 'Terminer 1er de sa cohorte sur une semaine (cohorte d''au moins 10 joueurs actifs).', 1, 'victoire'),
  ('podium_10', 'performance', '10 podiums cumulés', 'Terminer 10 fois dans le top 3 de sa cohorte (cohortes d''au moins 10 joueurs actifs).', 10, 'podiums'),
  ('podium_50', 'performance', '50 podiums cumulés', 'Terminer 50 fois dans le top 3 de sa cohorte (cohortes d''au moins 10 joueurs actifs).', 50, 'podiums')
on conflict (key) do nothing;

-- ============================================================================
-- tier_cohorts.member_count : dénormalisé à la création de la cohorte
-- (lib/tiers.ts computeTierCohortsForWeek), évite de recompter les membres à
-- chaque vérification de badge "victoire hebdo"/"podiums" (lib/badges.ts).
-- ============================================================================
alter table public.tier_cohorts add column member_count int not null default 0;

update public.tier_cohorts tc
set member_count = (select count(*) from public.cohort_members cm where cm.cohort_id = tc.id)
where member_count = 0;

-- ============================================================================
-- hall_of_fame : top 3 mondial archivé pour chaque semaine terminée. Figé
-- définitivement une fois écrit (même logique que tier_cohorts.movements_applied,
-- CLAUDE.md Sprint 13) : jamais recalculé rétroactivement.
-- ============================================================================
create table public.hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  rank int not null check (rank in (1, 2, 3)),
  user_id uuid not null references public.users (id) on delete cascade,
  total_points numeric not null,
  created_at timestamptz not null default now(),
  unique (week_start_date, rank)
);

create index hall_of_fame_week_idx on public.hall_of_fame (week_start_date);

alter table public.hall_of_fame enable row level security;

create policy "hall of fame is publicly readable"
  on public.hall_of_fame for select
  using (true);

grant select on public.hall_of_fame to authenticated, anon;

-- ============================================================================
-- users.share_token : identifiant opaque pour /api/weekly-card/[token],
-- distinct du user_id brut pour éviter qu'on puisse deviner/scraper les
-- cartes d'autres utilisateurs (CLAUDE.md Sprint 14).
-- ============================================================================
alter table public.users add column share_token uuid not null default gen_random_uuid() unique;
