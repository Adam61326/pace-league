-- Sprint 16 : nom affiché personnalisable. Prérempli à la première connexion
-- Strava (prénom + initiale du nom Strava, voir app/api/strava/callback),
-- modifiable ensuite sur /parametres. Tant qu'il est absent (jamais connecté
-- à Strava), formatDisplayName (lib/display-name.ts) retombe sur le nom
-- Strava puis sur "Coureur Strava" — aucune valeur par défaut écrite ici.
alter table public.users add column display_name text
  check (display_name is null or char_length(trim(display_name)) between 1 and 40);
