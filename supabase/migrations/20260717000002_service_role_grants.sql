-- Complément à 20260717000001_grants.sql : service_role manquait aussi ses
-- grants (même cause : tables créées via SQL Editor, pas via l'onboarding
-- standard Supabase qui les pose automatiquement).
--
-- service_role est un rôle serveur-à-serveur de confiance, jamais exposé au
-- navigateur (contrairement à anon/authenticated) : on lui donne un accès
-- complet plutôt que de le restreindre table par table, conformément à ce
-- que Supabase configure par défaut sur un projet standard.

grant all on all tables in schema public to service_role;

-- Pose ce grant par défaut sur toute future table du schéma public, pour que
-- cet oubli ne se reproduise pas aux prochains sprints. On ne fait PAS
-- l'équivalent pour anon/authenticated : ces rôles sont exposés au client,
-- et un grant par défaut sur une table future qui n'aurait pas encore de
-- policy RLS explicite l'exposerait entièrement. Pour ces deux rôles, le
-- grant doit rester un choix explicite posé en même temps que les policies
-- RLS de chaque nouvelle table (voir 20260717000001_grants.sql).
alter default privileges in schema public grant all on tables to service_role;
