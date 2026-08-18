begin;

-- meals-demo : profil COMPLET
update public.profiles
   set height_cm = 178, gender = 'male', birth_date = '1990-04-12'
 where id = '3e5f4256-7060-4fc7-a0c5-28476eb02a65';

-- une série de poids (3 points, pour que trendOf ait de quoi mordre) + tour de taille
insert into public.student_body_measures
  (user_id, measured_at, local_date, kind, value_si, source, content_locale)
values
 ('3e5f4256-7060-4fc7-a0c5-28476eb02a65', now() - interval '21 days', current_date - 21, 'weight', 94, 'plan_card', 'en-GB'),
 ('3e5f4256-7060-4fc7-a0c5-28476eb02a65', now() - interval '14 days', current_date - 14, 'weight', 93, 'plan_card', 'en-GB'),
 ('3e5f4256-7060-4fc7-a0c5-28476eb02a65', now() - interval '2 days',  current_date - 2,  'weight', 92, 'plan_card', 'en-GB'),
 ('3e5f4256-7060-4fc7-a0c5-28476eb02a65', now() - interval '2 days',  current_date - 2,  'waist',  96, 'plan_card', 'en-GB');

-- contraintes pratiques COMPLÈTES
update public.student_goals
   set practical_constraints = coalesce(practical_constraints, '{}'::jsonb)
     || jsonb_build_object(
          'eating_rhythm', jsonb_build_array(
             jsonb_build_object('slot','breakfast','size','small'),
             jsonb_build_object('slot','lunch','size','large'),
             jsonb_build_object('slot','dinner','size','medium')),
          'cooking_time_min', 30,
          'recipe_difficulty', 'normal',
          'variety', 'some',
          'budget_band', 'normal',
          'cook_days', jsonb_build_array('sun','wed'),
          'activity_level', 'lightly_active',
          'fixed_intakes', jsonb_build_array(
             jsonb_build_object('food_ref','whey_protein_powder','label','mon shaker',
                                'amount',30,'unit','g','slot','breakfast',
                                'days', jsonb_build_array('mon','tue','wed','thu','fri'))),
          'day_properties', jsonb_build_array(
             jsonb_build_object('day','sun','property','batch_cook'),
             jsonb_build_object('day','mon','property','leftovers'))),
       situation = 'I work late on Tuesdays and eat at the office canteen at lunch.'
 where user_id = '3e5f4256-7060-4fc7-a0c5-28476eb02a65';

commit;
update public.student_goals
   set practical_constraints = practical_constraints
     || jsonb_build_object(
          'fixed_intakes', jsonb_build_array(
             jsonb_build_object('food_ref','whey_protein_powder','label','mon shaker',
                                'amount',30,'unit','g','slot','breakfast',
                                'replaces_meal', true,
                                'days', jsonb_build_array('mon','tue','wed','thu','fri'))),
          'day_properties', jsonb_build_array(
             jsonb_build_object('day','sun','properties', jsonb_build_array('batch_cook')),
             jsonb_build_object('day','mon','properties', jsonb_build_array('leftovers'))))
 where user_id = '3e5f4256-7060-4fc7-a0c5-28476eb02a65';
