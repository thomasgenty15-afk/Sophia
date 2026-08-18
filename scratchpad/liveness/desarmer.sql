-- AUDIT DE LIVENESS · DÉSARMEMENT. Défait exactement ce qu'`armer.sql` a posé,
-- plus le foyer créé pour la sonde FF-043.
begin;
-- Les plans produits PAR les sondes: créés à la minute par ce run, et seuls
-- rattachés à ce foyer. Vérifiés un par un avant suppression.
delete from meal_composition_verdicts v
 using student_generated_meals m, households h
 where v.meal_id = m.id and m.household_id = h.id and h.name = 'Foyer sonde liveness';
delete from student_generated_meals m
 using households h where m.household_id = h.id and h.name = 'Foyer sonde liveness';

delete from household_member_allergies a
 using households h where a.household_id = h.id and h.name = 'Foyer sonde liveness';
delete from household_members m
 using households h where m.household_id = h.id and h.name = 'Foyer sonde liveness';
delete from households where name = 'Foyer sonde liveness';

delete from student_safety_constraints
 where user_id = '035fabd1-891f-46f4-45f3-efc7ffb8baa0' and kind = 'diet' and diet_ref = 'vegan';

delete from student_body_measures
 where user_id in ('0499a36b-7fca-04e3-a22c-e32e06871e25','035fabd1-891f-46f4-45f3-efc7ffb8baa0')
   and source = 'plan_card' and local_date = (current_date - 2);

update profiles set height_cm = null, gender = null, birth_date = null
 where id in ('0499a36b-7fca-04e3-a22c-e32e06871e25','035fabd1-891f-46f4-45f3-efc7ffb8baa0');

update student_goals
   set practical_constraints = practical_constraints - 'fixed_intakes' - 'day_properties'
 where user_id = '0499a36b-7fca-04e3-a22c-e32e06871e25';

update coach_doctrines set composition_steering = '[]'::jsonb
 where coach_id = (select coach_id from coach_clients where student_user_id='0499a36b-7fca-04e3-a22c-e32e06871e25' limit 1);
commit;

select 'foyers sonde restants : ' || count(*) from households where name='Foyer sonde liveness';
select 'régime végan restant  : ' || count(*) from student_safety_constraints where kind='diet';
select 'apports fixes restants: ' || count(*) from student_goals where practical_constraints ? 'fixed_intakes';
select 'profils armés restants: ' || count(*) from profiles where id in ('0499a36b-7fca-04e3-a22c-e32e06871e25','035fabd1-891f-46f4-45f3-efc7ffb8baa0') and height_cm is not null;
