-- Calendrier d'entraînement (nouvelle fonctionnalité, distincte du plan de
-- course/splits de race_plans) : une séance par jour et par utilisateur,
-- créée/éditée via le modal "Ajouter une séance" (clic sur un jour du
-- calendrier, voir components/training-calendar.tsx).
--
-- Champs très hétérogènes selon le type de séance (endurance/fractionné/
-- renfo-PPG/repos n'ont presque aucun champ en commun, voir
-- components/training-session-modal.tsx) : `details` en jsonb plutôt que des
-- dizaines de colonnes nullables séparées, une par champ de chaque type.
-- `notes`, seul champ commun à tous les types, reste une vraie colonne.
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  session_date date not null,
  session_type text not null check (session_type in ('endurance', 'fractionne', 'renfo_ppg', 'repos')),
  details jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une seule séance par jour : cliquer un jour déjà rempli édite la séance
  -- existante plutôt que d'en empiler une nouvelle (upsert côté route API).
  unique (user_id, session_date)
);

create index training_sessions_user_id_idx on public.training_sessions (user_id);

alter table public.training_sessions enable row level security;

-- Même pattern propriétaire que races/race_plans (auth.uid() direct, pas de
-- risque de récursion) : voir 20260802000000_add_multi_race_plans.sql.
create policy "users can view own training sessions"
  on public.training_sessions for select
  using (auth.uid() = user_id);

create policy "users can insert own training sessions"
  on public.training_sessions for insert
  with check (auth.uid() = user_id);

create policy "users can update own training sessions"
  on public.training_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Pas de suppression de séance dans ce sprint (pas demandé) : pas de policy
-- delete, pas de grant delete.

grant select, insert, update on public.training_sessions to authenticated;
