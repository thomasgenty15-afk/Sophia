-- ===========================================================================
-- LE RÉGLAGE « À-CÔTÉS » — LA CONTRAINTE MORD-ELLE, LA PORTE ÉCRIT-ELLE ?
-- 2026-09-23 · migration `20260923120000_les_a_cotes_se_choisissent.sql`
--
-- ⛔ LES DEUX MOITIÉS, ET LA SECONDE EST CELLE QU'ON OUBLIE. Une contrainte qui
-- refuse TOUT ressemble exactement à une contrainte qui marche. Ce fichier tient
-- donc des cas qui PASSENT, écrits avant les refus, et il échoue si le refus
-- s'élargit.
--
-- ⚠️ CE TEST NE TOURNE PAS DANS `agent-gate.sh` — aucun test SQL n'y tourne. Il
-- se lance à la main, APRÈS la migration, comme ses voisins:
--
--   docker cp supabase/tests/keel/side_courses_habits_test.sql \
--     supabase_db_Sophia_2:/tmp/t.sql \
--     && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--          -v ON_ERROR_STOP=1 -f /tmp/t.sql
--
-- Il n'écrit RIEN: tout se passe dans une transaction annulée à la fin.
--
-- ⚠️ LES COMPARAISONS SONT EN `is distinct from`, JAMAIS EN `<>`. Une porte qui
-- réussit rend `{"ok": true}` SANS clé `reason`: `NULL <> 'not_your_line'` vaut
-- NULL, le `if` ne se déclenche pas, et le test resterait vert sur une porte
-- ouverte. Mesuré en écrivant la migration: la mutation « un membre écrit
-- partout » passait.
-- ===========================================================================

begin;

do $$
declare
  h uuid;
  m uuid;
  refuses int := 0;
  passe   int := 0;
  cas     text;
begin
  insert into public.households (name) values ('side-courses-habits-test') returning id into h;
  insert into public.household_members (household_id, first_name, role)
    values (h, 'probe', 'member') returning member_id into m;

  -- ── CE QUI DOIT PASSER, ET C'EST LA MOITIÉ QUI COMPTE ────────────────────
  -- ⛔ CHAQUE FORME EST UNE RÉPONSE DIFFÉRENTE:
  --   · `side_courses` absent  = « le défaut de l'objectif » (toute la base
  --     d'avant ce lot);
  --   · `{}`                   = rien de réglé, lu comme l'absence;
  --   · `{"dessert": false}`   = « jamais de dessert à ce moment »;
  --   · `{"cheese": true}`     = « toujours du fromage à ce moment »;
  --   · les quatre types, et la clé à côté de `light` et d'une habitude.
  foreach cas in array array[
    '[{"slot":"lunch","kind":"own_usual","usual":"une salade"}]',
    '[{"slot":"dinner","side_courses":{}}]',
    '[{"slot":"dinner","side_courses":{"dessert":false}}]',
    '[{"slot":"lunch","side_courses":{"cheese":true}}]',
    '[{"slot":"lunch","side_courses":{"starter":true,"cheese":false,"dessert":true,"bread":false}}]',
    '[{"slot":"dinner","kind":"household_dish","usual":"","light":true,"side_courses":{"bread":true}},{"slot":"breakfast","light":true}]',
    '[]'
  ] loop
    insert into public.household_member_habits (member_id, household_id, slots)
      values (m, h, cas::jsonb);
    passe := passe + 1;
    delete from public.household_member_habits where member_id = m;
  end loop;

  -- ── CE QUI DOIT ÊTRE REFUSÉ ──────────────────────────────────────────────
  foreach cas in array array[
    '[{"slot":"breakfast","side_courses":{"dessert":false}}]',                  -- petit-déjeuner
    '[{"slot":"before_bed","side_courses":{"dessert":true}}]',                  -- collation
    '[{"slot":"dinner","side_courses":{"soup":true}}]',                         -- type inconnu
    '[{"slot":"dinner","side_courses":{"dessert":"false"}}]',                   -- booléen en chaîne
    '[{"slot":"dinner","side_courses":{"dessert":0}}]',                         -- booléen en nombre
    '[{"slot":"dinner","side_courses":{"dessert":null}}]',                      -- null n'est pas « auto »
    '[{"slot":"dinner","side_courses":["dessert"]}]',                           -- un tableau
    '[{"slot":"dinner","side_courses":"dessert"}]',                             -- une chaîne
    '[{"side_courses":{"dessert":false}}]',                                     -- aucun moment
    '[{"slot":"lunch","side_courses":{"bread":true}},{"slot":"dinner","side_courses":{"wine":true}}]' -- une bonne, une mauvaise
  ] loop
    begin
      insert into public.household_member_habits (member_id, household_id, slots)
        values (m, h, cas::jsonb);
      raise exception 'NON REFUSÉ, et il aurait dû l''être: %', cas;
    exception when check_violation then
      refuses := refuses + 1;
    end;
  end loop;

  if refuses <> 10 or passe <> 7 then
    raise exception 'attendu 10 refus et 7 passages, obtenu % et %', refuses, passe;
  end if;
  raise notice 'household_member_habits_side_courses_check: 10 refus, 7 passages — ok';
end $$;

-- ===========================================================================
-- LA PORTE `keel_household_set_slot_side_courses_for`
-- ===========================================================================
do $$
declare
  v_owner_user uuid;
  v_member_user uuid;
  v_house uuid;
  v_kid uuid;
  v_adult uuid;
  v_res jsonb;
  v_slots jsonb;
  v_i int;
begin
  -- ⚠️ DEUX COMPTES EXISTANTS SANS FOYER, EMPRUNTÉS — jamais créés.
  select u.id into v_owner_user from auth.users u
   where public.keel_household_of(u.id) is null order by u.created_at limit 1;
  select u.id into v_member_user from auth.users u
   where public.keel_household_of(u.id) is null and u.id <> v_owner_user
   order by u.created_at limit 1;
  if v_owner_user is null or v_member_user is null then
    raise exception 'side_courses: il faut deux comptes sans foyer pour tester la porte';
  end if;

  insert into public.households (name) values ('side-courses-rpc-test') returning id into v_house;
  insert into public.household_members (household_id, user_id, role, first_name)
    values (v_house, v_owner_user, 'owner', 'Titulaire');
  insert into public.household_members (household_id, user_id, role, first_name)
    values (v_house, v_member_user, 'member', 'Adulte') returning member_id into v_adult;
  insert into public.household_members (household_id, first_name, role)
    values (v_house, 'Enfant', 'member') returning member_id into v_kid;

  -- ① LE CAS QUI PASSE — le titulaire, une bouche sans compte, et la fusion
  --    garde ce que la fiche portait déjà (son habitude et son « léger »).
  insert into public.household_member_habits (member_id, household_id, slots)
  values (v_kid, v_house,
    '[{"slot":"dinner","kind":"own_usual","usual":"une soupe","light":true}]'::jsonb);
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'dinner', 'dessert', false);
  select slots into v_slots from public.household_member_habits where member_id = v_kid;
  if v_res ->> 'ok' is distinct from 'true'
     or v_slots is distinct from
       '[{"slot":"dinner","kind":"own_usual","usual":"une soupe","light":true,"side_courses":{"dessert":false}}]'::jsonb then
    raise exception '① fusion: % / %', v_res, v_slots;
  end if;

  -- ② UN SECOND TYPE SUR LE MÊME MOMENT S'AJOUTE, LE PREMIER RESTE.
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'dinner', 'cheese', true);
  select slots into v_slots from public.household_member_habits where member_id = v_kid;
  if v_slots -> 0 -> 'side_courses' is distinct from '{"dessert":false,"cheese":true}'::jsonb then
    raise exception '② second type: %', v_slots;
  end if;

  -- ③ LA MÊME VALEUR ⇒ `unchanged`, et rien n'est réécrit.
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'dinner', 'cheese', true);
  if v_res ->> 'reason' is distinct from 'unchanged' then
    raise exception '③ répétition: %', v_res;
  end if;

  -- ④ BASCULER UN TYPE ⇒ la valeur d'avant est rendue.
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'dinner', 'dessert', true);
  if v_res ->> 'ok' is distinct from 'true' or v_res ->> 'previous' is distinct from 'false' then
    raise exception '④ bascule: %', v_res;
  end if;

  -- ⑤ `null` RETIRE LA CLÉ; retirer une clé absente est `unchanged`.
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'dinner', 'dessert', null);
  select slots into v_slots from public.household_member_habits where member_id = v_kid;
  if v_res ->> 'ok' is distinct from 'true'
     or v_slots -> 0 -> 'side_courses' is distinct from '{"cheese":true}'::jsonb then
    raise exception '⑤ retrait: % / %', v_res, v_slots;
  end if;
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'dinner', 'dessert', null);
  if v_res ->> 'reason' is distinct from 'unchanged' then
    raise exception '⑤ retrait d''une clé absente: %', v_res;
  end if;

  -- ⑥ LE DERNIER TYPE RETIRÉ EMPORTE LA CLÉ, PAS L'ENTRÉE (elle a son habitude).
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'dinner', 'cheese', null);
  select slots into v_slots from public.household_member_habits where member_id = v_kid;
  if v_slots is distinct from
       '[{"slot":"dinner","kind":"own_usual","usual":"une soupe","light":true}]'::jsonb then
    raise exception '⑥ dernier type: %', v_slots;
  end if;

  -- ⑦ UNE ENTRÉE QUI N'A PLUS RIEN À DIRE PART DU TABLEAU.
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'lunch', 'bread', false);
  v_res := public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'lunch', 'bread', null);
  select slots into v_slots from public.household_member_habits where member_id = v_kid;
  if jsonb_array_length(v_slots) is distinct from 1 then
    raise exception '⑦ entrée vide gardée: %', v_slots;
  end if;

  -- ⑧ LE MEMBRE ÉCRIT SA LIGNE — et pas celle de l'enfant.
  v_res := public.keel_household_set_slot_side_courses_for(v_member_user, v_adult, 'lunch', 'starter', false);
  if v_res ->> 'ok' is distinct from 'true' then
    raise exception '⑧ un membre ne peut pas écrire sa ligne: %', v_res;
  end if;
  v_res := public.keel_household_set_slot_side_courses_for(v_member_user, v_kid, 'lunch', 'starter', false);
  if v_res ->> 'reason' is distinct from 'not_your_line' then
    raise exception '⑧ un membre écrit la ligne d''un autre: %', v_res;
  end if;

  -- ⑨ LES REFUS NOMMÉS.
  if public.keel_household_set_slot_side_courses_for(null, v_kid, 'lunch', 'dessert', true) ->> 'reason'
       is distinct from 'no_user' then raise exception '⑨ no_user'; end if;
  if public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'breakfast', 'dessert', true) ->> 'reason'
       is distinct from 'bad_slot' then raise exception '⑨ bad_slot'; end if;
  if public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'lunch', 'Dessert', true) ->> 'reason'
       is distinct from 'bad_kind' then raise exception '⑨ bad_kind (casse)'; end if;
  if public.keel_household_set_slot_side_courses_for(v_owner_user, gen_random_uuid(), 'lunch', 'dessert', true) ->> 'reason'
       is distinct from 'not_a_member' then raise exception '⑨ not_a_member'; end if;
  if public.keel_household_set_slot_side_courses_for(gen_random_uuid(), v_kid, 'lunch', 'dessert', true) ->> 'reason'
       is distinct from 'no_household' then raise exception '⑨ no_household'; end if;

  -- ⑩ LE PLAFOND DE SIX ENTRÉES — le moment ne se crée pas au-delà.
  update public.household_member_habits
     set slots = '[{"slot":"breakfast","light":true},{"slot":"snack_am","kind":"own_usual","usual":"a"},
                   {"slot":"snack_pm","kind":"own_usual","usual":"b"},{"slot":"before_bed","kind":"own_usual","usual":"c"},
                   {"slot":"dinner","light":true},{"slot":"dinner","light":false}]'::jsonb
   where member_id = v_kid;
  if public.keel_household_set_slot_side_courses_for(v_owner_user, v_kid, 'lunch', 'dessert', true) ->> 'reason'
       is distinct from 'slots_full' then raise exception '⑩ slots_full'; end if;

  -- ⑪ LES DROITS: `service_role` seul.
  if has_function_privilege('authenticated',
       'public.keel_household_set_slot_side_courses_for(uuid, uuid, text, text, boolean)', 'execute')
     or has_function_privilege('anon',
       'public.keel_household_set_slot_side_courses_for(uuid, uuid, text, text, boolean)', 'execute')
     or not has_function_privilege('service_role',
       'public.keel_household_set_slot_side_courses_for(uuid, uuid, text, text, boolean)', 'execute') then
    raise exception '⑪ la porte n''est pas réservée à service_role';
  end if;

  raise notice 'keel_household_set_slot_side_courses_for: 11 cas — ok';
end $$;

rollback;
