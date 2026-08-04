-- ===========================================================================
-- LE REPAS UNIQUE SORT DU GÉNÉRATEUR
-- ===========================================================================
--
-- CE QUI ÉTAIT FAUX, ET C'EST UN ARBITRAGE PRODUIT PAS UN BUG
-- -----------------------------------------------------------
-- `scope` acceptait `single_meal`: « compose-moi UN plat ». Décidé le
-- 2026-08-04 que c'est le mauvais outil pour ce besoin.
--
-- Une idée de plat unique est une QUESTION DE CONVERSATION. L'élève l'écrit
-- dans le chat, l'agent répond dans la doctrine de son coach, et c'est réglé en
-- un tour. La faire passer par un générateur, une ligne en base et un PDF est
-- une cérémonie disproportionnée pour « qu'est-ce que je mange ce soir ».
--
-- Ce que la surface repas apporte VRAIMENT commence à plusieurs repas: c'est là
-- qu'il y a une liste de courses à agréger, des jours à répartir, et un
-- document à emporter au magasin. `day` et `several_days` restent, `single_meal`
-- part.
--
-- LES LIGNES EXISTANTES
-- ---------------------
-- On ne les supprime pas (ce dépôt vérifie avant de supprimer): un repas généré
-- est quelque chose que l'élève a demandé et a peut-être cuisiné. Elles sont
-- REQUALIFIÉES en `day`, qui est le scope le plus proche — un plat unique est
-- une journée à un plat — et la requalification est tracée dans
-- `generated_from` pour qu'on comprenne, plus tard, pourquoi une ligne `day` ne
-- porte qu'un seul plat.
-- ===========================================================================

begin;

alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_scope_check;

update public.student_generated_meals
set
  scope = 'day',
  generated_from = coalesce(generated_from, '{}'::jsonb)
    || jsonb_build_object(
         'migrated_by', '20260804110000_meal_scope_drop_single_meal',
         'migration_note',
         'Generated as scope=single_meal, before that scope was retired. '
         || 'Requalified as day: a single dish is a one-dish day. The dish '
         || 'count is therefore lower than a day normally carries.'
       )
where scope = 'single_meal';

-- Le défaut change AVEC la contrainte, jamais après: un défaut qui viole le
-- CHECK est une table dont tout INSERT sans `scope` explicite échoue, et on ne
-- le découvre qu'au premier appelant qui l'omet.
alter table public.student_generated_meals
  alter column scope set default 'day';

alter table public.student_generated_meals
  add constraint student_generated_meals_scope_check
    check (scope in ('day', 'several_days'));

commit;

-- ===========================================================================
-- GARDE — on ne fait pas confiance, on vérifie
-- ===========================================================================
do $$
declare
  v_left    int;
  v_check   int;
  v_default text;
begin
  select count(*) into v_left
  from public.student_generated_meals where scope = 'single_meal';

  select count(*) into v_check
  from pg_constraint
  where conrelid = 'public.student_generated_meals'::regclass
    and conname = 'student_generated_meals_scope_check'
    and pg_get_constraintdef(oid) not like '%single_meal%';

  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'student_generated_meals'
    and column_name = 'scope';

  if v_left <> 0 then
    raise exception 'garde: % ligne(s) portent encore scope=single_meal', v_left;
  end if;
  if v_check <> 1 then
    raise exception 'garde: le CHECK de scope accepte encore single_meal (ou est absent)';
  end if;
  if v_default not like '%day%' then
    raise exception 'garde: le defaut de scope est reste %', v_default;
  end if;

  raise notice 'OK — single_meal retire, % ligne(s) requalifiee(s) en day',
    (select count(*) from public.student_generated_meals
     where generated_from ->> 'migrated_by' = '20260804110000_meal_scope_drop_single_meal');
end $$;
