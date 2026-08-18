\echo '=== 1) LE COMPTEUR ARCHIVE, PLAN PAR PLAN (les 20 derniers) ==='
select
  m.id,
  m.plan_kind,
  m.created_at,
  m.generated_from->>'prompt_version'                     as prompt_version,
  (m.generated_from->'same_day'->>'dishes')::int          as dishes,
  (m.generated_from->'same_day'->>'declared')::int        as declared,
  (m.generated_from->'same_day'->>'invalid')::int         as invalid,
  (m.generated_from->'same_day'->>'minutes_missing')::int as minutes_missing
from student_generated_meals m
where m.generated_from ? 'same_day'
order by m.created_at desc
limit 20;

\echo '=== 2) LE TAUX DE SERVICE, PAR LANE ==='
select
  m.plan_kind,
  count(*)                                                     as plans,
  sum((m.generated_from->'same_day'->>'dishes')::int)          as dishes,
  sum((m.generated_from->'same_day'->>'declared')::int)        as declared,
  round(100.0 * sum((m.generated_from->'same_day'->>'declared')::int)
        / nullif(sum((m.generated_from->'same_day'->>'dishes')::int), 0), 1)
                                                               as pct_declared,
  sum((m.generated_from->'same_day'->>'invalid')::int)         as invalid,
  sum((m.generated_from->'same_day'->>'minutes_missing')::int) as minutes_missing
from student_generated_meals m
where m.generated_from ? 'same_day'
group by m.plan_kind
order by m.plan_kind;

\echo '=== 3) LA CONTRE-EPREUVE SUR LES PLATS (le compteur peut mentir, pas les plats) ==='
select
  m.id,
  m.plan_kind,
  count(*)                                                      as dishes_in_jsonb,
  count(*) filter (where d ? 'same_day')                        as key_written,
  count(*) filter (where d->'same_day' = 'null'::jsonb)         as key_written_null,
  count(*) filter (where jsonb_typeof(d->'same_day') = 'object') as with_gesture,
  count(*) filter (where jsonb_typeof(d->'same_day') = 'object'
                     and d->'same_day'->>'minutes' is null)      as gesture_without_minutes
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where m.generated_from ? 'same_day'
group by m.id, m.plan_kind
order by m.id;

\echo '=== 4) LA DISTRIBUTION DES QUATRE JETONS ==='
select
  d->'same_day'->>'kind' as kind,
  count(*)               as dishes,
  round(avg((d->'same_day'->>'minutes')::numeric), 1) as avg_minutes
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where jsonb_typeof(d->'same_day') = 'object'
group by 1
order by 2 desc;

\echo '=== 5) C3 — LA COHERENCE DOUCE, PLAT PAR PLAT ==='
select
  m.id,
  d->>'day'                as day,
  d->>'title'              as dish,
  d->'same_day'->>'kind'   as kind,
  jsonb_array_length(coalesce(d->'uses', '[]'::jsonb)) as uses
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where (d->'same_day'->>'kind' = 'reheat_only'
        and jsonb_array_length(coalesce(d->'uses', '[]'::jsonb)) = 0)
   or (d->'same_day'->>'kind' = 'none'
        and jsonb_array_length(coalesce(d->'uses', '[]'::jsonb)) > 0)
order by m.id;

\echo '=== 6) C3 — LES PLATS SANS AUCUN GESTE DECLARE (le silence du modele) ==='
select
  m.id,
  m.plan_kind,
  count(*) filter (where d->'same_day' is null
                      or d->'same_day' = 'null'::jsonb) as silent_dishes,
  count(*)                                              as dishes
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where m.generated_from ? 'same_day'
group by m.id, m.plan_kind
having count(*) filter (where d->'same_day' is null
                           or d->'same_day' = 'null'::jsonb) > 0
order by m.id;

\echo '=== 7) LES ISSUES DU LOT, TELLES QU ARCHIVEES ==='
select m.id, i as issue
from student_generated_meals m,
     lateral jsonb_array_elements_text(
       coalesce(m.generated_from->'issues', '[]'::jsonb)) as i
where i like '%same_day%'
order by m.id;
