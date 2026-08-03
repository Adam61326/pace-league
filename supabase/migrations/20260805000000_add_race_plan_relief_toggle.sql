-- Bouton ON/OFF de l'éditeur de plan pour désactiver l'impact du D+/D- sur
-- l'allure cible (CLAUDE.md n'en parle pas encore, ajouté à la demande) : le
-- D+/D- reste enregistré et affiché par split, seul son ajustement d'allure
-- (lib/race-plan.ts computeReliefDeltaSecPerKm) est neutralisé quand
-- désactivé. true par défaut pour ne pas changer l'allure déjà calculée des
-- plans existants.
alter table public.race_plans
  add column relief_enabled boolean not null default true;
