#!/usr/bin/env bash
# CONTRÔLE DE FIXTURE — on relit ce qu'on croit avoir écrit, par les MÊMES
# clés que le moteur lit. Une fixture à moitié écrite fait un banc VERT qui ne
# mesure rien.
source "$(dirname "$0")/00-env.sh"
for E in "$SOLO_EMAIL" "$DUO_EMAIL" "$QUATRE_EMAIL" "$CINQ_EMAIL"; do
  U="$(psqlq -c "select id from auth.users where email='$E'")"
  [ -z "$U" ] && { echo "⛔ $E absent"; continue; }
  echo "═══ $E"
  psqlq -c "
  select 'profil', p.full_name||' | '||coalesce(p.birth_date::text,'⛔SANS DATE')||' | '||coalesce(p.gender,'?')
         ||' | '||coalesce(p.height_cm::text,'?')||'cm | '||coalesce(p.timezone,'⛔')||' | '||coalesce(p.locale,'?')
    from profiles p where p.id='$U'
  union all select 'poids', coalesce((select value_si::text from student_body_measures
    where user_id='$U' and kind='weight' order by measured_at desc limit 1),'⛔AUCUN')
  union all select 'objectif', coalesce(g.goal,'⛔')||' | rythme '||coalesce(g.target_pace_kg_per_week::text,'∅')
         ||' | style '||coalesce(g.practical_constraints->>'cooking_style','⛔')
         ||' | courses '||coalesce(g.practical_constraints->>'grocery_runs','⛔')
         ||' | equip '||coalesce(g.practical_constraints->>'kitchen_equipment','⛔')
    from student_goals g where g.user_id='$U'
  union all select 'gouts(food.exclude)', coalesce((select string_agg(i->>'text'||'→'||(i->>'subject'),', ')
      from student_goals g, jsonb_array_elements(coalesce(g.practical_constraints->'retained_items','[]'::jsonb)) i
     where g.user_id='$U' and i->>'kind'='food.exclude'),'(aucun)')
  union all select 'foyer', coalesce((select h.name||' · '||count(m.member_id)::text||' bouches'
      from households h join household_members m on m.household_id=h.id
     where h.id=public.keel_household_of('$U') group by h.name),'(aucun)')
  union all select 'bouches', coalesce((select string_agg(m.first_name||'['||coalesce(m.goal,'∅')||'/'||coalesce(m.diet,'∅')
      ||'/'||coalesce(b.gender,'⛔SEXE')||'/'||coalesce(b.weight_kg::text,'⛔POIDS')||']', ' ' order by m.first_name)
      from household_members m left join household_member_bodies b on b.member_id=m.member_id
     where m.household_id=public.keel_household_of('$U')),'(aucune)')
  union all select 'allergies', coalesce((select string_agg(m.first_name||':'||a.label,', ')
      from household_member_allergies a join household_members m on m.member_id=a.member_id
     where m.household_id=public.keel_household_of('$U')),'(aucune)')
  union all select 'reglesMaison', coalesce((select count(*)::text from household_food_restrictions r
     where r.household_id=public.keel_household_of('$U')),'0')
  union all select 'envie', coalesce((select left(body,60) from household_envy_submissions
     where household_id=public.keel_household_of('$U') order by created_at desc limit 1),'(aucune)')
  union all select 'coach', coalesce((select status from coach_clients where student_user_id='$U'),'⛔AUCUN')
  union all select 'plans vivants', (select count(*)::text from student_generated_meals
     where user_id='$U' and retired_at is null);"
done
