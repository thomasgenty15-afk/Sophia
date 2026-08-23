-- 1V · delta S2 (lane solo) — deux changements, mesurés séparément :
--   ① les pesées sont datées du 2026-08-18 (la veille valait 2026-08-19,
--      c'est-à-dire APRÈS `untilLocalDate` : `body_measure_io.ts:232` les
--      écartait, et le run S1 est parti sans poids ni tour de taille) ;
--   ② l'équipement manquant CHANGE DE CAMP : le four part, la plaque revient.
--      S1 tournait sans plaque. On veut savoir si l'effet mesuré tient dans
--      les deux sens, ou si c'était un coup de dé.
update public.student_body_measures set local_date='2026-08-18'
 where user_id='1e000000-0000-4000-8000-000000000001';

update public.student_goals set practical_constraints =
  jsonb_set(practical_constraints, '{kitchen_equipment}',
    '["stovetop","microwave","freezer","air_fryer","pressure_cooker","blender"]'::jsonb)
 where user_id='1e000000-0000-4000-8000-000000000001';

select kind, value_si, local_date from public.student_body_measures
 where user_id='1e000000-0000-4000-8000-000000000001';
select practical_constraints->'kitchen_equipment' from public.student_goals
 where user_id='1e000000-0000-4000-8000-000000000001';
