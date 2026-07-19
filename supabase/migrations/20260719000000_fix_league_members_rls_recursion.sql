-- Corrige une récursion RLS infinie introduite par la migration
-- 20260717000005_add_private_leagues.sql.
--
-- Les deux policies de lecture ("members can view their leagues" sur
-- `leagues`, "members can view fellow members of their leagues" sur
-- `league_members`) vérifient l'appartenance via un `exists` qui interroge
-- `league_members`. Comme cette table est elle-même protégée par RLS, cet
-- `exists` réapplique la policy de `league_members` sur elle-même à chaque
-- évaluation : personne ne peut jamais lire ses propres lignes, y compris le
-- créateur de la ligue. Vérifié par test fonctionnel (create + join + lecture
-- échouent silencieusement, aucune ligne retournée).
--
-- Correctif standard Postgres/Supabase pour les policies d'appartenance
-- auto-référentielles : sortir la vérification dans une fonction
-- `security definer`. Exécutée avec les droits du propriétaire de la table
-- (qui n'est pas soumis à ses propres RLS), elle casse la boucle.

create function public.is_league_member(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = p_user_id
  );
$$;

drop policy "members can view their leagues" on public.leagues;

create policy "members can view their leagues"
  on public.leagues for select
  using (public.is_league_member(leagues.id, auth.uid()));

drop policy "members can view fellow members of their leagues" on public.league_members;

create policy "members can view fellow members of their leagues"
  on public.league_members for select
  using (public.is_league_member(league_members.league_id, auth.uid()));
