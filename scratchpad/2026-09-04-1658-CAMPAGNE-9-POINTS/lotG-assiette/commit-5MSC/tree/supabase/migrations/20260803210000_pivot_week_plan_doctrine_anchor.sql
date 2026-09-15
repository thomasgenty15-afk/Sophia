-- ===========================================================================
-- PIVOT NUTRITION — C1 : l'ancre du plan élève passe du PROGRAMME à la DOCTRINE
-- ===========================================================================
--
-- CE QUI ÉTAIT FAUX
-- -----------------
-- La migration N0 exigeait que toute ligne `nutrition` d'un plan élève porte
-- une `source_commitment_key` — la clé d'un engagement dans le programme écrit
-- par le coach. Ce modèle suppose un coach qui rédige un programme ligne à
-- ligne.
--
-- Le produit réel vend l'inverse : le coach anime une MASTERCLASSE. Il n'écrit
-- pas de programme, il transmet une méthode. `plan_templates.commitments` est
-- donc vide, `generate-week-plan-v1` renvoyait `coach_has_no_program` à tous
-- les coups, et ce CHECK aurait de toute façon rejeté chaque ligne produite.
-- La chaîne était morte à l'allumage sur le seul modèle qui compte.
--
-- CE QUE ÇA DEVIENT
-- -----------------
-- L'ancre est la CONVICTION : `coach_doctrines.beliefs[].key`. Chaque ligne
-- alimentaire nomme la conviction qu'elle applique. Ce que la base garantit
-- reste exactement de même nature — une ligne alimentaire ne peut pas flotter
-- sans origine déclarée — mais l'origine est désormais une philosophie et non
-- un catalogue.
--
-- CE QUE LA BASE NE GARANTIT PAS, ET IL FAUT LE DIRE
-- --------------------------------------------------
-- Que la ligne applique FIDÈLEMENT la conviction. Le CHECK vérifie qu'une clé
-- est présente ; il ne peut pas juger une interprétation. C'est pour ça que
-- l'app affiche à l'élève la conviction source sous chaque ligne : la fidélité
-- se juge à l'œil, par l'élève et par le coach.
--
-- DONNÉES EXISTANTES
-- ------------------
-- Les plans déjà écrits ont été produits sous l'ancien modèle. On ne les
-- supprime pas (ce dépôt vérifie avant de supprimer) : on renomme le champ pour
-- qu'aucune donnée ne soit perdue, ET on les archive, parce qu'un plan dont
-- l'ancre pointe vers un catalogue qui n'existe plus n'est pas un plan valide
-- qu'on peut laisser passer pour actif.
-- ===========================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Retirer l'ancien CHECK avant de toucher aux données
-- --------------------------------------------------------------------------
alter table public.student_week_plans
  drop constraint if exists student_week_plans_nutrition_traceable_check;

-- --------------------------------------------------------------------------
-- 2. Renommer le champ dans les lignes existantes, sans rien perdre
-- --------------------------------------------------------------------------
update public.student_week_plans p
set
  items = coalesce(
    (
      select jsonb_agg(
        case
          when item ? 'source_commitment_key'
            then (item - 'source_commitment_key')
                 || jsonb_build_object('source_belief_key', item -> 'source_commitment_key')
          else item
        end
        order by ord
      )
      from jsonb_array_elements(p.items) with ordinality as t(item, ord)
    ),
    '[]'::jsonb
  ),
  -- Trace de l'opération: en relisant la ligne dans six mois, on doit pouvoir
  -- comprendre pourquoi sa clé ne résout dans aucune doctrine.
  generated_from = coalesce(p.generated_from, '{}'::jsonb)
    || jsonb_build_object(
         'migrated_by', '20260803210000_pivot_week_plan_doctrine_anchor',
         'migration_note',
         'Generated under the programme-anchored model. source_commitment_key '
         || 'was renamed to source_belief_key; the key does NOT resolve against '
         || 'any published doctrine. Archived for that reason.'
       ),
  status = 'archived'
where jsonb_path_exists(p.items, '$[*] ? (exists(@.source_commitment_key))');

-- --------------------------------------------------------------------------
-- 3. Le nouveau CHECK : toute ligne nutrition nomme sa conviction
-- --------------------------------------------------------------------------
alter table public.student_week_plans
  add constraint student_week_plans_doctrine_traceable_check check (
    not jsonb_path_exists(
      items,
      '$[*] ? (@.kind == "nutrition" && (!exists(@.source_belief_key) || @.source_belief_key == null))'
    )
  );

commit;

-- ===========================================================================
-- GARDE — on ne fait pas confiance, on vérifie
-- ===========================================================================
do $$
declare
  v_old_check int;
  v_new_check int;
  v_dangling  int;
begin
  select count(*) into v_old_check
  from pg_constraint
  where conrelid = 'public.student_week_plans'::regclass
    and conname = 'student_week_plans_nutrition_traceable_check';

  select count(*) into v_new_check
  from pg_constraint
  where conrelid = 'public.student_week_plans'::regclass
    and conname = 'student_week_plans_doctrine_traceable_check';

  -- Aucune ligne ne doit conserver l'ancien champ.
  select count(*) into v_dangling
  from public.student_week_plans
  where jsonb_path_exists(items, '$[*] ? (exists(@.source_commitment_key))');

  if v_old_check <> 0 then
    raise exception 'C1 guard: ancien CHECK toujours présent';
  end if;
  if v_new_check <> 1 then
    raise exception 'C1 guard: nouveau CHECK absent (trouvé %)', v_new_check;
  end if;
  if v_dangling <> 0 then
    raise exception 'C1 guard: % ligne(s) portent encore source_commitment_key', v_dangling;
  end if;

  raise notice 'C1 OK — ancre doctrine posée, % plan(s) migré(s) et archivé(s)',
    (select count(*) from public.student_week_plans
     where generated_from ->> 'migrated_by' = '20260803210000_pivot_week_plan_doctrine_anchor');
end $$;
