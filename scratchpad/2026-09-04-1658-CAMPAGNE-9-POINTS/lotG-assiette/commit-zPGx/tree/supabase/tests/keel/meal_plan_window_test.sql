-- ============================================================================
-- KEEL — LA FENÊTRE D'UN PLAN DE REPAS, testée là où elle est tenue.
--
-- MANUEL. Contre la base LOCALE:
--
--   docker cp supabase/tests/keel/meal_plan_window_test.sql \
--     supabase_db_Sophia_2:/tmp/window.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/window.sql
--
-- POURQUOI ICI ET PAS EN DENO
-- Tout ce qui est sous test est une CONTRAINTE D'EXCLUSION, un CHECK ou une
-- fonction SECURITY DEFINER. Un test TypeScript de la même logique serait vert
-- le jour où la contrainte serait absente de la base — et c'est précisément la
-- classe de défaut que ce dépôt paie (« la garde était prouvée sur la fonction
-- et jamais sur le câblage »).
--
-- Tout tourne dans une transaction qui finit en ROLLBACK.
--
-- CE QUI EST AFFIRMÉ
--   1. deux plans vivants ne peuvent pas se chevaucher (la contrainte, pas la
--      politesse applicative)
--   2. `prepare_next` qui chevauche TRONQUE le plan antérieur, et seulement sa
--      fenêtre
--   3. la troncature ne touche NI `dishes` NI `shopping_list` — les clés de
--      coche sont positionnelles
--   4. un plan qui démarre le même jour ou après est REFUSÉ, jamais tronqué à
--      zéro
--   5. `replace_current` exige la ligne qu'il remplace, et ne peut pas la
--      remplacer deux fois
--   6. une intention inconnue s'arrête (R6), une durée hors bornes aussi
--   7. `scope` est DÉRIVÉ de la durée et n'est plus une entrée
--   8. retirer un plan LIBÈRE sa fenêtre
-- ============================================================================

begin;

\set u '''99990000-0000-4000-8000-0000000000aa'''

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values (:u::uuid, 'window-test@test.dev', 'x', now(), 'authenticated', 'authenticated')
on conflict (id) do nothing;

do $$
declare
  u uuid := '99990000-0000-4000-8000-0000000000aa';
  v_a uuid;
  v_b uuid;
  v_row record;
  v_msg text;
  v_dishes jsonb := jsonb_build_array(
    jsonb_build_object('title', 'un'), jsonb_build_object('title', 'deux'));
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'mode', 'to_shop', 'dishes', v_dishes, 'content_locale', 'en',
    'shopping_list', jsonb_build_array(jsonb_build_object('term','riz','aisle','grains')));

  -- ── 1. un plan courant ────────────────────────────────────────────────
  select meal_id into v_a from public.write_student_meal_plan(
    u, 'prepare_next', '2026-08-10'::date, 7::smallint, v_payload);
  if v_a is null then raise exception 'T1: no plan created'; end if;

  -- ── 7. `scope` est DÉRIVÉ, pas reçu ───────────────────────────────────
  -- Une ligne `scope='day'` portant une fenêtre de sept jours était possible
  -- avant; elle ne l'est plus, parce que l'appelant ne choisit plus.
  select scope into v_msg from public.student_generated_meals where id = v_a;
  if v_msg <> 'several_days' then
    raise exception 'T7: scope should be derived to several_days, got %', v_msg;
  end if;

  -- ── 2. le chevauchement TRONQUE l'antérieur ───────────────────────────
  select * into v_row from public.write_student_meal_plan(
    u, 'prepare_next', '2026-08-13'::date, 5::smallint, v_payload);
  v_b := v_row.meal_id;
  if v_row.truncated_plan_id is distinct from v_a then
    raise exception 'T2: expected % truncated, got %', v_a, v_row.truncated_plan_id;
  end if;
  if v_row.truncated_from <> 7 or v_row.truncated_to <> 3 then
    raise exception 'T2: expected 7 -> 3, got % -> %', v_row.truncated_from, v_row.truncated_to;
  end if;

  -- ── 3. LA TRONCATURE NE TOUCHE QUE LA FENÊTRE ─────────────────────────
  -- `meal_tick:<id>:<index>` est POSITIONNEL. Retirer des entrées de `dishes`
  -- renumérote les suivantes et repointe des coches existantes vers la mauvaise
  -- assiette, sans erreur, dans la table que le coach lit. C'est l'assertion la
  -- plus importante de ce fichier.
  select * into v_row from public.student_generated_meals where id = v_a;
  if jsonb_array_length(v_row.dishes) <> 2 then
    raise exception 'T3: truncation touched dishes (% left)', jsonb_array_length(v_row.dishes);
  end if;
  if jsonb_array_length(v_row.shopping_list) <> 1 then
    raise exception 'T3: truncation touched the shopping list';
  end if;
  if v_row.generated_from -> 'truncated_by' ->> 'from_duration_days' <> '7' then
    raise exception 'T3: the truncation left no trace on the shortened row';
  end if;

  -- ── 1bis. LA CONTRAINTE, pas l'application ────────────────────────────
  -- Un insert direct qui chevauche doit être refusé par la BASE, même si
  -- quelqu'un contourne la fonction un jour.
  begin
    insert into public.student_generated_meals
      (user_id, starts_on, duration_days, scope, mode, dishes, content_locale)
    values (u, '2026-08-14'::date, 3::smallint, 'several_days', 'to_shop', v_dishes, 'en');
    raise exception 'T1bis: an overlapping live plan was accepted';
  exception when exclusion_violation then null;
  end;

  -- ── 4. démarrer le même jour ou après: REFUS, jamais troncature à zéro ─
  begin
    perform public.write_student_meal_plan(
      u, 'prepare_next', '2026-08-13'::date, 2::smallint, v_payload);
    raise exception 'T4: a plan starting on the same day was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('plan_overlaps_existing' in v_msg) = 0 then
      raise exception 'T4: wrong failure: %', v_msg;
    end if;
  end;

  -- ── 5. `replace_current` exige sa cible, et ne la prend qu'une fois ────
  begin
    perform public.write_student_meal_plan(
      u, 'replace_current', '2026-08-20'::date, 2::smallint, v_payload, null);
    raise exception 'T5: replace_current without a target was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('replaces_required' in v_msg) = 0 then
      raise exception 'T5: wrong failure: %', v_msg;
    end if;
  end;

  -- ── 8. retirer LIBÈRE la fenêtre ──────────────────────────────────────
  -- `replace_current` sur le plan du 13 le retire, et la fenêtre qu'il occupait
  -- redevient disponible dans la même transaction.
  select * into v_row from public.write_student_meal_plan(
    u, 'replace_current', '2026-08-13'::date, 5::smallint, v_payload, v_b);
  if v_row.retired_plan_id is distinct from v_b then
    raise exception 'T8: expected % retired, got %', v_b, v_row.retired_plan_id;
  end if;

  -- La même cible ne peut pas être retirée deux fois: le prédicat
  -- `retired_at is null` EST la garde de concurrence.
  begin
    perform public.write_student_meal_plan(
      u, 'replace_current', '2026-08-25'::date, 1::smallint, v_payload, v_b);
    raise exception 'T5bis: a plan was replaced twice';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('plan_not_replaceable' in v_msg) = 0 then
      raise exception 'T5bis: wrong failure: %', v_msg;
    end if;
  end;

  -- ── 6. R6 et les bornes ───────────────────────────────────────────────
  begin
    perform public.write_student_meal_plan(
      u, 'whatever', '2026-09-01'::date, 3::smallint, v_payload);
    raise exception 'T6: an unknown intent was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('unknown_intent' in v_msg) = 0 then
      raise exception 'T6: wrong failure: %', v_msg;
    end if;
  end;

  -- Huit jours: un jeton de jour désignerait deux dates dans la même ligne.
  begin
    perform public.write_student_meal_plan(
      u, 'prepare_next', '2026-09-01'::date, 8::smallint, v_payload);
    raise exception 'T6: an 8-day window was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('bad_duration' in v_msg) = 0 then
      raise exception 'T6: wrong failure on 8 days: %', v_msg;
    end if;
  end;

  begin
    perform public.write_student_meal_plan(
      u, 'prepare_next', '2026-09-01'::date, 0::smallint, v_payload);
    raise exception 'T6: a 0-day window was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('bad_duration' in v_msg) = 0 then
      raise exception 'T6: wrong failure on 0 days: %', v_msg;
    end if;
  end;

  raise notice 'meal_plan_window: all assertions passed';
end $$;

rollback;
