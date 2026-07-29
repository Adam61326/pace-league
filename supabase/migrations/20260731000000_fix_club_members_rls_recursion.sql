-- Corrige une récursion RLS infinie introduite par la migration
-- 20260729000000_add_clubs.sql — même bug déjà rencontré et corrigé pour les
-- ligues privées (20260719000000_fix_league_members_rls_recursion.sql), mais
-- réintroduit à l'identique pour les clubs.
--
-- Les deux policies de lecture ("members can view their clubs" sur `clubs`,
-- "members can view fellow club members" sur `club_members`) vérifient
-- l'appartenance via un `exists` qui interroge `club_members`. Comme cette
-- table est elle-même protégée par RLS, cet `exists` réapplique la policy de
-- `club_members` sur elle-même à chaque évaluation : personne ne peut jamais
-- lire ses propres lignes, y compris le créateur du club. Constaté en local :
-- POST /api/clubs/create réussit (passe par le client admin), mais la
-- redirection vers /clubs/[id] renvoie ensuite un 404 (`notFound()` déclenché
-- car la lecture RLS du club via le client normal ne retourne jamais rien).
--
-- Même correctif que pour les ligues : sortir la vérification dans une
-- fonction `security definer`, qui casse la boucle en s'exécutant avec les
-- droits du propriétaire de la table plutôt que ceux du rôle appelant.

create function public.is_club_member(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = p_user_id
  );
$$;

drop policy "members can view their clubs" on public.clubs;

create policy "members can view their clubs"
  on public.clubs for select
  using (public.is_club_member(clubs.id, auth.uid()));

drop policy "members can view fellow club members" on public.club_members;

create policy "members can view fellow club members"
  on public.club_members for select
  using (public.is_club_member(club_members.club_id, auth.uid()));
