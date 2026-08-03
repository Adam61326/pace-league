-- Commentaire par split (icône chat sur le tableau, voir capture Claude
-- Design) : n'importe quel propriétaire du plan peut commenter un split de
-- son propre plan (pas réservé à la Vue Coach). Une ligne séparée plutôt
-- qu'une colonne sur race_plan_splits : cette table est régénérée en bloc
-- (delete + insert) à chaque enregistrement du plan (voir
-- app/api/course-plan/route.ts), donc un commentaire stocké directement
-- dessus serait perdu au prochain recalcul. Clé sur (race_plan_id,
-- lap_number) — stable tant que la distance/les splits-par ne changent
-- pas ; un changement de découpage peut associer un vieux commentaire à un
-- point différent de la course, limitation acceptée pour cette v1.
create table public.race_plan_split_comments (
  id uuid primary key default gen_random_uuid(),
  race_plan_id uuid not null references public.race_plans (id) on delete cascade,
  lap_number int not null check (lap_number > 0),
  comment text not null check (char_length(comment) between 1 and 2000),
  updated_at timestamptz not null default now(),
  unique (race_plan_id, lap_number)
);

create index race_plan_split_comments_race_plan_id_idx on public.race_plan_split_comments (race_plan_id);

alter table public.race_plan_split_comments enable row level security;

-- Même pattern que race_plan_splits (EXISTS via race_plans, pas de risque
-- de récursion RLS) : voir 20260801000000_add_race_plan.sql.
create policy "users can view own split comments"
  on public.race_plan_split_comments for select
  using (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_split_comments.race_plan_id and rp.user_id = auth.uid()
    )
  );

create policy "users can insert own split comments"
  on public.race_plan_split_comments for insert
  with check (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_split_comments.race_plan_id and rp.user_id = auth.uid()
    )
  );

create policy "users can update own split comments"
  on public.race_plan_split_comments for update
  using (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_split_comments.race_plan_id and rp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_split_comments.race_plan_id and rp.user_id = auth.uid()
    )
  );

create policy "users can delete own split comments"
  on public.race_plan_split_comments for delete
  using (
    exists (
      select 1 from public.race_plans rp
      where rp.id = race_plan_split_comments.race_plan_id and rp.user_id = auth.uid()
    )
  );

-- Lecture par le coach (même pattern que race_plans/race_plan_splits,
-- 20260801000000_add_race_plan.sql) : un coach voit les commentaires du
-- plan d'un athlète qu'il coache déjà, jamais en écriture.
create policy "coach can view coached athlete split comments"
  on public.race_plan_split_comments for select
  using (
    exists (
      select 1 from public.race_plans rp
      join public.coach_relationships cr on cr.athlete_id = rp.user_id
      where rp.id = race_plan_split_comments.race_plan_id and cr.coach_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.race_plan_split_comments to authenticated;
