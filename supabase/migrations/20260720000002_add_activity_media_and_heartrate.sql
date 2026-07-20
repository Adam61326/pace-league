-- Sprint 10 : fréquence cardiaque moyenne, tracé GPS, photo d'activité.
--
-- Toutes nullable : une activité peut ne pas avoir de capteur cardiaque, un
-- tracé (activités indoor/manuelles bien que celles-ci soient déjà exclues
-- par has_gps), ou aucune photo attachée. Ne jamais afficher 0/vide comme si
-- c'était une vraie valeur — voir lib/strava.ts et les pages qui consomment
-- ces colonnes.

-- average_heartrate côté API Strava, absent si l'activité n'a pas de donnée
-- cardiaque (pas de capteur) : dans ce cas on stocke null, jamais 0.
alter table public.activities add column avg_heartrate numeric;

-- summary_polyline (format "encoded polyline" Google), utilisé pour tracer
-- un aperçu du parcours sans fond de carte ni clé API externe (décodé côté
-- app, voir lib/polyline.ts).
alter table public.activities add column route_polyline text;

-- URL de la première photo Strava attachée à l'activité (GET
-- /activities/{id}/photos), si l'utilisateur en a ajouté une.
alter table public.activities add column photo_url text;
