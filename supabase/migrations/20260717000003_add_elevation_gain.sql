-- Sprint 3 : le calcul du D+ nécessite total_elevation_gain (mètres),
-- absent de la table activities (non capté par le webhook du Sprint 2).
alter table public.activities add column total_elevation_gain numeric;
