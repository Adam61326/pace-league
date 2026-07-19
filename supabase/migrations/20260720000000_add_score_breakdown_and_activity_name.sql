-- Sprint 8 : détail du score journalier (/dashboard) et nom des activités
-- (/mes-activites).

-- distance_points et dplus_points sont des composantes de base_points,
-- persistées séparément pour l'affichage du détail hebdomadaire.
-- base_points reste leur somme + participation_points ; ce dernier n'est
-- pas stocké séparément, dérivé côté affichage par soustraction
-- (base_points - distance_points - dplus_points).
alter table public.weekly_scores add column distance_points numeric not null default 0;
alter table public.weekly_scores add column dplus_points numeric not null default 0;

-- name : titre de l'activité Strava, affiché sur /mes-activites. Absent des
-- activités déjà synchronisées avant cette migration (pas de backfill rétroactif
-- — voir memory no-premature-backfill) : la page affiche un libellé générique
-- pour ces lignes-là.
alter table public.activities add column name text;
