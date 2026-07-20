-- Sprint 12 : page Paramètres (profil physiologique), records par distance
-- (best_efforts Strava), algorithme de performance à 4 axes, météo par
-- activité.

-- ============================================================================
-- users : champs physiologiques, tous facultatifs et saisis par
-- l'utilisateur sur /parametres. Alimentent lib/performance.ts (TRIMP a
-- besoin de hr_max/hr_rest) — l'axe correspondant est simplement masqué tant
-- qu'ils ne sont pas renseignés, jamais de valeur inventée.
-- ============================================================================
alter table public.users add column birth_date date;
alter table public.users add column gender text check (gender is null or gender in ('homme', 'femme', 'autre'));
alter table public.users add column height_cm numeric;
alter table public.users add column weight_kg numeric;
alter table public.users add column hr_max int;
alter table public.users add column hr_rest int;

-- hr_rest doit être strictement inférieur à hr_max : la formule TRIMP divise
-- par (hr_max - hr_rest), un ordre inversé donnerait un dénominateur négatif
-- ou nul et un axe Endurance incohérent.
alter table public.users add constraint hr_rest_below_hr_max
  check (hr_rest is null or hr_max is null or hr_rest < hr_max);

-- ============================================================================
-- best_efforts : meilleurs temps par distance standard (5k, 10k, 15k,
-- Half-Marathon, Marathon...), capturés depuis le champ best_efforts de
-- l'activité détaillée Strava (webhook + backfill). Une activité peut
-- produire plusieurs best_efforts (un par distance couverte par un effort
-- continu) : unique(activity_id, distance_label) rend l'upsert idempotent
-- face aux retries webhook.
-- ============================================================================
create table public.best_efforts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  distance_label text not null,
  elapsed_time_seconds int not null,
  achieved_at date not null,
  created_at timestamptz not null default now(),
  unique (activity_id, distance_label)
);

create index best_efforts_user_id_idx on public.best_efforts (user_id);

alter table public.best_efforts enable row level security;

create policy "users can view own best efforts"
  on public.best_efforts for select
  using (auth.uid() = user_id);

-- service_role a déjà tous les droits par défaut sur les futures tables
-- (cf. 20260717000002_service_role_grants.sql) ; seul authenticated a
-- besoin d'un GRANT explicite.
grant select on public.best_efforts to authenticated;

-- ============================================================================
-- activities : météo au moment de l'activité (Open-Meteo, voir
-- lib/weather.ts). Nullable : absente si l'activité n'a pas de coordonnées
-- de départ, ou si l'appel Open-Meteo échoue/n'a pas de donnée pour cette
-- date — jamais une valeur par défaut trompeuse.
-- ============================================================================
alter table public.activities add column weather_temp_celsius numeric;
alter table public.activities add column weather_wind_kmh numeric;
