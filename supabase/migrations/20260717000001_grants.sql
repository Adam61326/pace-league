-- Complément à 20260717000000_init_schema.sql.
-- Les GRANT ne sont pas posés automatiquement par le SQL Editor : sans eux,
-- Postgres refuse l'accès avant même d'évaluer les policies RLS.
-- L'autorisation fine reste portée par les policies RLS ; ces GRANT ne font
-- qu'ouvrir la porte au niveau table pour les rôles anon/authenticated.

grant usage on schema public to anon, authenticated;

-- Tables publiques (lecture seule, sans session)
grant select on public.seasons to anon, authenticated;
grant select on public.country_scores to anon, authenticated;

-- Tables privées (accès restreint à ses propres lignes via RLS)
grant select, update on public.users to authenticated;
grant select on public.activities to authenticated;
grant select on public.weekly_scores to authenticated;
