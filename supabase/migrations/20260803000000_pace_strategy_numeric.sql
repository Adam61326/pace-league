-- Curseur "Stratégie d'allure" à 5 crans au lieu de 3 (bug constaté : un
-- enum à 3 valeurs ne peut pas représenter "très positif"/"très négatif").
-- Remplace l'enum text pace_strategy ('positive' | 'even' | 'negative') par
-- une valeur numérique continue (-1 = très positif, -0.5 = positif, 0 =
-- régulier, 0.5 = négatif, 1 = très négatif) — voir lib/race-plan.ts
-- PACE_STRATEGY_LEVELS et computeStrategyDeltaSecPerKm.
--
-- Les anciens crans "positif"/"négatif" sont mappés sur ±0.5 plutôt que ±1 :
-- computeStrategyDeltaSecPerKm a été recalibré pour que ±0.5 reproduise
-- exactement la dérive de l'ancien enum (10% pic-à-pic) — aucune perte de
-- données, l'allure déjà calculée des plans existants ne change pas.

alter table public.race_plans add column pace_strategy_numeric numeric;

update public.race_plans
set pace_strategy_numeric = case pace_strategy
  when 'positive' then -0.5
  when 'negative' then 0.5
  else 0
end;

alter table public.race_plans drop column pace_strategy;
alter table public.race_plans rename column pace_strategy_numeric to pace_strategy;

alter table public.race_plans
  alter column pace_strategy set not null,
  alter column pace_strategy set default 0,
  add constraint race_plans_pace_strategy_range check (pace_strategy >= -1 and pace_strategy <= 1);
