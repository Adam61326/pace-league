-- Sprint 3 : identité affichée sur le classement public ("Prénom I.").
-- Renseigné à la connexion Strava (athlete summary déjà fourni par Strava au
-- token exchange, aucun scope OAuth supplémentaire nécessaire).
alter table public.users add column strava_firstname text;
alter table public.users add column strava_lastname text;
