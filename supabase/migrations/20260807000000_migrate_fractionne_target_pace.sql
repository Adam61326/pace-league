-- "Allure cible / rep" du formulaire Fractionné passe d'un champ texte libre
-- (placeholder "ex : 3:50/km") à deux inputs numériques min:sec, comme
-- "Allure cible" du formulaire Endurance (voir components/pace-input.tsx,
-- factorisé pour les deux). La clé jsonb correspondante dans
-- training_sessions.details passe donc de targetPacePerRep (text libre) à
-- targetPaceSecPerKmPerRep (numeric, secondes par km — même unité que
-- targetPaceSecPerKm) pour rester cohérente avec les autres champs d'allure
-- du projet.
--
-- Migration best-effort des séances déjà enregistrées avec l'ancien format :
-- parse le motif "min:sec" en tête de chaîne (ex: "3:50/km" -> 230), ignore
-- le suffixe libre ("/km", "environ", etc). Une valeur qui ne correspond pas
-- à ce motif ne peut pas être convertie de façon fiable — laissée à null,
-- avec un NOTICE listant la séance concernée pour vérification manuelle.
do $$
declare
  r record;
  m text[];
  parsed_sec numeric;
begin
  for r in
    select id, details ->> 'targetPacePerRep' as old_value
    from public.training_sessions
    where session_type = 'fractionne'
      and details ? 'targetPacePerRep'
      and details ->> 'targetPacePerRep' is not null
  loop
    m := regexp_match(r.old_value, '^\s*(\d{1,2}):(\d{2})');
    if m is not null then
      parsed_sec := (m[1]::numeric * 60) + m[2]::numeric;
      update public.training_sessions
      set details = (details - 'targetPacePerRep') || jsonb_build_object('targetPaceSecPerKmPerRep', parsed_sec)
      where id = r.id;
    else
      raise notice 'training_sessions %: impossible de convertir targetPacePerRep=% automatiquement, passé à null — vérification manuelle recommandée', r.id, r.old_value;
      update public.training_sessions
      set details = (details - 'targetPacePerRep') || jsonb_build_object('targetPaceSecPerKmPerRep', null)
      where id = r.id;
    end if;
  end loop;

  -- Séances fractionné avec l'ancienne clé mais sans valeur (déjà vide) :
  -- rien à convertir, juste retirer l'ancien nom de clé.
  update public.training_sessions
  set details = details - 'targetPacePerRep'
  where session_type = 'fractionne' and details ? 'targetPacePerRep';
end $$;
