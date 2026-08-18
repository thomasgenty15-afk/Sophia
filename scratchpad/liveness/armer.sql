-- AUDIT DE LIVENESS · ARMEMENT DES SONDES
--
-- Idempotent. Se défait par `desarmer.sql`.
--
-- Chaque bloc arme UN mécanisme livré, de façon à ce qu'un run réel de
-- `generate-meal-v1` le traverse. Ce qui n'est pas armé ici ne peut pas être
-- observé plus loin — et c'est écrit dans le rapport plutôt que deviné.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- S1 — L'ÉLÈVE COMPLET : corps connu, coach à doctrine pilotée, apports fixes,
--      propriétés de jour. Il arme FF-037, FF-038, FF-039 (per_kg), FF-040,
--      FF-041, FF-051 et FF-052 en une seule génération.
-- ═══════════════════════════════════════════════════════════════════════════
\set s1 '''0499a36b-7fca-04e3-a22c-e32e06871e25'''

-- Le CORPS. Sans lui, `envelopeFor` retombe sur `per_portion` et la moitié du
-- moteur ne peut pas s'exprimer — c'est exactement ce qu'a montré le premier
-- run réel de la session.
update profiles
   set height_cm = 178,
       gender    = 'male',
       birth_date = date '1989-04-12'
 where id = :s1;

insert into student_body_measures (user_id, measured_at, local_date, kind, value_si, source, content_locale)
select :s1, now() - interval '2 days', (current_date - 2), 'weight', 81.5, 'plan_card', 'en-GB'
where not exists (
  select 1 from student_body_measures
   where user_id = :s1 and kind = 'weight' and local_date = (current_date - 2)
);

-- LES APPORTS FIXES (FF-051) et LES PROPRIÉTÉS DE JOUR (FF-052).
-- Une entrée malformée et un jeton bidon sont posés EXPRÈS: les compteurs
-- « écarté et compté » font partie de ce qu'on vérifie.
update student_goals
   set practical_constraints = coalesce(practical_constraints, '{}'::jsonb) || jsonb_build_object(
     'fixed_intakes', jsonb_build_array(
       jsonb_build_object('food_ref','plain_yogurt','label','mon shaker du matin',
                          'amount',250,'unit','g','slot','breakfast','replaces_meal',true,
                          'days', jsonb_build_array('mon','tue','wed','thu','fri')),
       jsonb_build_object('food_ref','whole_milk','label','mon café au lait',
                          'amount',100,'unit','ml','slot','breakfast'),
       jsonb_build_object('food_ref','','amount',30,'unit','g')
     ),
     'day_properties', jsonb_build_array(
       jsonb_build_object('day','sun','properties', jsonb_build_array('batch_cook')),
       jsonb_build_object('day','mon','properties', jsonb_build_array('leftovers','picnic'))
     ))
 where user_id = :s1;

-- LE PILOTAGE DU COACH (FF-041). Posé sur la doctrine du coach de S1.
-- `energy` éteint + `protein_range: very_high` : deux effets qui doivent se
-- voir dans l'enveloppe, et un axe éteint qui doit faire taire une correction.
update coach_doctrines d
   set composition_steering = jsonb_build_array(
     jsonb_build_object(
       'goal_scope', 'muscle_gain',
       'priorities', jsonb_build_array('protein','satiety_density'),
       'off',        jsonb_build_array('energy'),
       'protein_range','very_high',
       'surplus_style','lean',
       'belief_key', 'protein_anchors_the_plate'
     ))
  where d.coach_id = (select coach_id from coach_clients where student_user_id = :s1 limit 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- S2 — LA VÉGANE. Arme FF-042 R6 : `b12_source` doit sortir des trous
--      réparables et atterrir dans le canal structurel du verdict.
-- ═══════════════════════════════════════════════════════════════════════════
\set s2 '''035fabd1-891f-46f4-45f3-efc7ffb8baa0'''

insert into student_safety_constraints
  (user_id, kind, diet_ref, severity, declared_by, content_locale)
-- `declared_by` n'accepte que 'student' | 'coach'; `source` des mesures
-- n'accepte que 'sunday_flow' | 'plan_card' | 'chat'. Deux vocabulaires FERMÉS
-- distincts sur deux tables voisines: écrit ici pour le prochain armement.
select :s2, 'diet', 'vegan', 'strict', 'student', 'fr-FR'
where not exists (
  select 1 from student_safety_constraints
   where user_id = :s2 and kind = 'diet' and diet_ref = 'vegan'
);

update profiles set height_cm = 170, gender = 'female', birth_date = date '1993-09-02'
 where id = :s2;

insert into student_body_measures (user_id, measured_at, local_date, kind, value_si, source, content_locale)
select :s2, now() - interval '2 days', (current_date - 2), 'weight', 62.0, 'plan_card', 'fr-FR'
where not exists (
  select 1 from student_body_measures
   where user_id = :s2 and kind = 'weight' and local_date = (current_date - 2)
);

commit;

-- Ce que l'armement a réellement posé.
select 'S1 corps    : ' || coalesce(height_cm::text,'∅') || ' cm, ' ||
       coalesce(gender,'∅') || ', né ' || coalesce(birth_date::text,'∅')
  from profiles where id = '0499a36b-7fca-04e3-a22c-e32e06871e25';
select 'S1 poids    : ' || count(*)::text || ' mesure(s)'
  from student_body_measures where user_id = '0499a36b-7fca-04e3-a22c-e32e06871e25' and kind='weight';
select 'S1 apports  : ' || jsonb_array_length(practical_constraints->'fixed_intakes')::text || ' déclarés (dont 1 malformé exprès)'
  from student_goals where user_id = '0499a36b-7fca-04e3-a22c-e32e06871e25';
select 'S1 jours    : ' || jsonb_array_length(practical_constraints->'day_properties')::text || ' déclarés (dont 1 jeton bidon)'
  from student_goals where user_id = '0499a36b-7fca-04e3-a22c-e32e06871e25';
select 'S1 objectif : ' || goal from student_goals where user_id = '0499a36b-7fca-04e3-a22c-e32e06871e25';
select 'S1 pilotage : ' || coalesce(composition_steering::text, '∅')
  from coach_doctrines
 where coach_id = (select coach_id from coach_clients where student_user_id='0499a36b-7fca-04e3-a22c-e32e06871e25' limit 1);
select 'S2 régime   : ' || kind || '/' || diet_ref || '/' || severity
  from student_safety_constraints where user_id='035fabd1-891f-46f4-45f3-efc7ffb8baa0' and kind='diet';
