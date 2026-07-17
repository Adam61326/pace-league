-- Sprint 1 : schéma initial (users, activities, weekly_scores, country_scores, seasons)
-- Voir CLAUDE.md section "Schéma de données" pour la spec de référence.

-- ============================================================================
-- seasons
-- ============================================================================
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  season_number int not null unique,
  start_date date not null,
  end_date date not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  constraint season_length check (end_date = start_date + interval '4 weeks')
);

alter table public.seasons enable row level security;

create policy "seasons are publicly readable"
  on public.seasons for select
  using (true);

-- ============================================================================
-- users (profil applicatif, 1-1 avec auth.users)
-- ============================================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  strava_athlete_id text unique,
  strava_access_token text,
  strava_refresh_token text,
  strava_token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users can view own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "users can update own profile"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-provisioning du profil applicatif à la création d'un compte Supabase Auth.
-- country_code est fourni via les métadonnées passées à supabase.auth.signUp().
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, country_code)
  values (new.id, new.email, upper(new.raw_user_meta_data ->> 'country_code'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- activities
-- ============================================================================
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  strava_activity_id text not null unique,
  distance_km numeric,
  moving_time_seconds int,
  avg_speed_kmh numeric,
  has_gps boolean not null default false,
  activity_date date not null,
  created_at timestamptz not null default now()
);

create index activities_user_id_idx on public.activities (user_id);

alter table public.activities enable row level security;

create policy "users can view own activities"
  on public.activities for select
  using (auth.uid() = user_id);

-- ============================================================================
-- weekly_scores
-- ============================================================================
create table public.weekly_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  week_start_date date not null,
  base_points numeric not null default 0,
  progression_bonus numeric not null default 0,
  regularity_bonus numeric not null default 0,
  total_points numeric not null default 0,
  unique (user_id, week_start_date)
);

create index weekly_scores_user_id_idx on public.weekly_scores (user_id);

alter table public.weekly_scores enable row level security;

create policy "users can view own weekly scores"
  on public.weekly_scores for select
  using (auth.uid() = user_id);

-- ============================================================================
-- country_scores
-- ============================================================================
create table public.country_scores (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  season_id uuid not null references public.seasons (id) on delete cascade,
  week_start_date date not null,
  total_points numeric not null default 0,
  active_runners_count int not null default 0,
  division text not null check (division in ('A', 'B', 'C')),
  unique (country_code, season_id, week_start_date)
);

create index country_scores_season_id_idx on public.country_scores (season_id);

alter table public.country_scores enable row level security;

create policy "country scores are publicly readable"
  on public.country_scores for select
  using (true);
