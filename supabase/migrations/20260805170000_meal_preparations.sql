-- ============================================================================
-- CE QU'ON CUISINE, PAR OPPOSITION À CE QU'ON MANGE
--
-- Le lot était un attribut du PLAT: « ce plat-ci se cuisine une fois pour trois
-- jours ». C'est vrai, et ça oblige les trois jours à manger le MÊME plat.
-- Mesuré: un bowl poulet-riz-brocoli identique lundi, mardi, mercredi et jeudi —
-- techniquement du batch cooking, humainement une punition.
--
-- Or ce qu'on cuisine une fois n'est pas un plat, c'est une PRÉPARATION. 1,2 kg
-- de cuisses rôties devient un bowl lundi, un wrap mardi, une base de curry
-- jeudi. Une cuisson, trois repas différents — c'est ce que les gens cherchent
-- quand ils veulent réduire le temps de cuisine.
--
-- Deux colonnes, et pas une table: ces objets n'ont de sens qu'à l'intérieur
-- d'une génération, ils ne sont jamais interrogés seuls, et rien ne les
-- référence de l'extérieur. Les sortir en tables imposerait deux jointures à
-- chaque lecture d'écran pour une donnée qui vit et meurt avec sa ligne.
--
-- `default '[]'` et NOT NULL: les semaines déjà générées restent lisibles, et
-- un lecteur n'a jamais à distinguer « pas de préparation » de « colonne
-- absente ».
-- ============================================================================

alter table public.student_generated_meals
  add column if not exists preparations jsonb not null default '[]'::jsonb,
  add column if not exists cooking_sessions jsonb not null default '[]'::jsonb;

comment on column public.student_generated_meals.preparations is
  'Ce qui se CUISINE: [{id, title, servings_made, ingredients[], method, '
  'cook_on}]. Plusieurs plats y puisent via dishes[].uses[].preparation_id — '
  'une cuisson, plusieurs repas différents.';

comment on column public.student_generated_meals.cooking_sessions is
  'Quand on cuisine, et dans quel ordre: [{day, preparation_ids[], '
  'run_through}]. Le déroulé est le champ qui compte — l''ordre des gestes se '
  'joue ENTRE les préparations, donc aucun plat ne peut le porter.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'student_generated_meals'
       and column_name = 'preparations'
  ) then
    raise exception 'meal_preparations: la colonne preparations est absente';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'student_generated_meals'
       and column_name = 'cooking_sessions'
  ) then
    raise exception 'meal_preparations: la colonne cooking_sessions est absente';
  end if;
  raise notice 'meal_preparations: les deux colonnes sont en place';
end $$;
