-- ===========================================================================
-- KEEL W8 — cards: render parity, write-path determinism, arming invariants.
-- Run against the LOCAL DB only:
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/keel/card_render_test.sql
--
-- WHY THIS FILE EXISTS
-- --------------------
-- `student_cards.rendered` is written by a DATABASE trigger, and the frontend
-- previews the same sentence with a TypeScript renderer. Two implementations of
-- one rule is a divergence risk, so the three cases in section 1 are the SAME
-- fixture asserted in `keel-cards-v1/cards.ts` (RENDER_PARITY_CASES). If either
-- side drifts, one of the two suites goes red on the same expected string —
-- instead of a student seeing one card in the wizard and another one after
-- saving.
--
-- Everything is wrapped in a transaction and rolled back: this test leaves no
-- row behind, so it can run against a database that already holds an e2e
-- student (the W4 lesson — the two reference suites counted without a filter
-- and turned red for reasons unrelated to what they test).
-- ===========================================================================

begin;

create temporary table card_test_results (
  step text,
  ok boolean,
  detail text
);

create or replace function pg_temp.expect(p_step text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  insert into card_test_results values (p_step, p_ok, p_detail);
  if not p_ok then
    raise exception 'FAILED: % (%)', p_step, p_detail;
  end if;
end;
$$;

-- Runs a snippet expected to RAISE. Fails the suite if it succeeds.
create or replace function pg_temp.expect_raise(p_step text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    perform pg_temp.expect(p_step, false, 'expected an exception, got none');
  exception
    when others then
      -- Only the "expected an exception" marker must propagate.
      if sqlerrm like 'FAILED:%' then raise; end if;
      perform pg_temp.expect(p_step, true, sqlerrm);
  end;
end;
$$;


-- ===========================================================================
-- 1. RENDER PARITY — the same three cases as RENDER_PARITY_CASES in cards.ts
-- ===========================================================================

select pg_temp.expect(
  'parity/restaurant_order',
  public.keel_render_card(
    E'Situation: I am at {{place}}.\nSignal: {{signal}}\nThen: I order {{go_to_dish}} before I read the rest of the menu.\nPlan B: {{plan_b}}',
    '[
      {"key":"place","label":"Which restaurant?","type":"text"},
      {"key":"go_to_dish","label":"Which dish?","type":"text"},
      {"key":"signal","label":"Signal","type":"choice","options":[
        {"value":"menu_arrives","label":"the menu arrives"},
        {"value":"first_drink","label":"the first drink is served"}
      ]},
      {"key":"plan_b","label":"Fallback","type":"text"}
    ]'::jsonb,
    '{"place":"Chez Marco","go_to_dish":"grilled salmon and greens","signal":"menu_arrives","plan_b":"steak and salad, no fries"}'::jsonb
  ) = E'Situation: I am at Chez Marco.\nSignal: the menu arrives\nThen: I order grilled salmon and greens before I read the rest of the menu.\nPlan B: steak and salad, no fries'
);

select pg_temp.expect(
  'parity/repeated_slot_and_number',
  public.keel_render_card(
    E'I cook {{dish}}, {{portions}} portions.\nEven a bad week has {{portions}} meals handled.',
    '[
      {"key":"dish","label":"Dish","type":"text"},
      {"key":"portions","label":"Portions","type":"number"}
    ]'::jsonb,
    '{"dish":"lentil and chicken traybake","portions":5}'::jsonb
  ) = E'I cook lentil and chicken traybake, 5 portions.\nEven a bad week has 5 meals handled.'
);

select pg_temp.expect(
  'parity/time_variable',
  public.keel_render_card(
    'At {{when_to_prepare}} I prepare {{prepared}}.',
    '[
      {"key":"when_to_prepare","label":"When","type":"time"},
      {"key":"prepared","label":"What","type":"text"}
    ]'::jsonb,
    '{"when_to_prepare":"21:30","prepared":"tomorrow''s lunch box"}'::jsonb
  ) = 'At 21:30 I prepare tomorrow''s lunch box.'
);

-- Determinism, stated as an assertion rather than a comment.
select pg_temp.expect(
  'render/deterministic',
  (select count(distinct r) = 1
   from generate_series(1, 25) as g,
        lateral public.keel_render_card(
          '{{a}} and {{b}}',
          '[{"key":"a","label":"A","type":"text"},{"key":"b","label":"B","type":"text"}]'::jsonb,
          '{"a":"one","b":"two"}'::jsonb
        ) as r)
);


-- ===========================================================================
-- 2. THE RENDERER REFUSES EVERY WAY A CARD COULD LIE
-- ===========================================================================

select pg_temp.expect_raise('neg/missing_value', $q$
  select public.keel_render_card('a {{x}}', '[{"key":"x","label":"X","type":"text"}]'::jsonb, '{}'::jsonb)
$q$);

select pg_temp.expect_raise('neg/blank_value', $q$
  select public.keel_render_card('a {{x}}', '[{"key":"x","label":"X","type":"text"}]'::jsonb, '{"x":"   "}'::jsonb)
$q$);

select pg_temp.expect_raise('neg/choice_out_of_options', $q$
  select public.keel_render_card('a {{x}}',
    '[{"key":"x","label":"X","type":"choice","options":[{"value":"a","label":"A"},{"value":"b","label":"B"}]}]'::jsonb,
    '{"x":"zzz"}'::jsonb)
$q$);

-- Without this rule the substitution is order-dependent: a value containing a
-- marker would be expanded by a later pass, so "deterministic" would depend on
-- the order the coach declared the variables in.
select pg_temp.expect_raise('neg/value_carries_markers', $q$
  select public.keel_render_card('{{a}} {{b}}',
    '[{"key":"a","label":"A","type":"text"},{"key":"b","label":"B","type":"text"}]'::jsonb,
    '{"a":"{{b}} x","b":"ok"}'::jsonb)
$q$);

select pg_temp.expect_raise('neg/values_not_an_object', $q$
  select public.keel_render_card('a {{x}}', '[{"key":"x","label":"X","type":"text"}]'::jsonb, '"nope"'::jsonb)
$q$);


-- ===========================================================================
-- 3. A TEMPLATE THAT COULD NEVER RENDER CANNOT BE WRITTEN
--    (the substance_ref lesson from W1.0-bis: constrain at the write, loudly,
--     not three layers later at render time)
-- ===========================================================================

select pg_temp.expect_raise('neg/template_undeclared_slot', $q$
  insert into public.card_templates
    (owner_scope, template_key, card_kind, title, purpose, produces, usage,
     body_template, variables, content_locale)
  values ('global','tst_undeclared','defense','t','p','pr','u',
          'hello {{nope}}', '[{"key":"x","label":"X","type":"text"}]'::jsonb, 'en')
$q$);

select pg_temp.expect_raise('neg/template_stray_marker', $q$
  insert into public.card_templates
    (owner_scope, template_key, card_kind, title, purpose, produces, usage,
     body_template, variables, content_locale)
  values ('global','tst_stray','defense','t','p','pr','u',
          'hello {{ x }} {{x}}', '[{"key":"x","label":"X","type":"text"}]'::jsonb, 'en')
$q$);

select pg_temp.expect_raise('neg/template_bad_variable_type', $q$
  insert into public.card_templates
    (owner_scope, template_key, card_kind, title, purpose, produces, usage,
     body_template, variables, content_locale)
  values ('global','tst_badtype','defense','t','p','pr','u',
          'hello {{x}}', '[{"key":"x","label":"X","type":"dropdown"}]'::jsonb, 'en')
$q$);

select pg_temp.expect_raise('neg/template_choice_one_option', $q$
  insert into public.card_templates
    (owner_scope, template_key, card_kind, title, purpose, produces, usage,
     body_template, variables, content_locale)
  values ('global','tst_onechoice','defense','t','p','pr','u',
          'hello {{x}}',
          '[{"key":"x","label":"X","type":"choice","options":[{"value":"a","label":"A"}]}]'::jsonb, 'en')
$q$);

select pg_temp.expect_raise('neg/template_global_with_coach', $q$
  insert into public.card_templates
    (owner_scope, coach_id, template_key, card_kind, title, purpose, produces, usage,
     body_template, variables, content_locale)
  values ('global','44444444-4444-4444-4444-444444444444','tst_scope','defense','t','p','pr','u',
          'hello {{x}}', '[{"key":"x","label":"X","type":"text"}]'::jsonb, 'en')
$q$);


-- ===========================================================================
-- 4. THE SEED — one catalogue, the three copies collapsed into it
-- ===========================================================================

select pg_temp.expect(
  'seed/sixteen_global_templates',
  (select count(*) = 16 from public.card_templates where owner_scope = 'global'),
  'expected 6 attack + 10 defense'
);

select pg_temp.expect(
  'seed/six_attack_techniques',
  (select count(*) = 6 from public.card_templates
   where owner_scope = 'global' and card_kind = 'attack')
);

select pg_temp.expect(
  'seed/ten_nutrition_defense_cards',
  (select count(*) = 10 from public.card_templates
   where owner_scope = 'global' and card_kind = 'defense')
);

-- Every retired technique key has exactly one home. Without this the stored
-- legacy cards in user_attack_cards would orphan on the rename.
select pg_temp.expect(
  'seed/legacy_keys_all_mapped',
  (select count(*) = 6 from public.card_templates
   where legacy_technique_key in (
     'texte_recadrage','mantra_force','ancre_visuelle',
     'visualisation_matinale','preparer_terrain','pre_engagement'
   ))
);

-- Every seeded template must actually render with plausible values. A catalogue
-- entry that throws at render is a card the student can never write.
do $$
declare
  tpl record;
  vals jsonb;
  v jsonb;
  rendered text;
begin
  for tpl in select template_key, body_template, variables from public.card_templates
             where owner_scope = 'global' loop
    vals := '{}'::jsonb;
    for v in select * from jsonb_array_elements(tpl.variables) loop
      if v ->> 'type' = 'choice' then
        vals := vals || jsonb_build_object(v ->> 'key', (v -> 'options' -> 0 ->> 'value'));
      elsif v ->> 'type' = 'number' then
        vals := vals || jsonb_build_object(v ->> 'key', 5);
      elsif v ->> 'type' = 'time' then
        vals := vals || jsonb_build_object(v ->> 'key', '19:30');
      else
        vals := vals || jsonb_build_object(v ->> 'key', 'sample value');
      end if;
    end loop;
    rendered := public.keel_render_card(tpl.body_template, tpl.variables, vals);
    if rendered is null or btrim(rendered) = '' then
      raise exception 'template % rendered empty', tpl.template_key;
    end if;
  end loop;
  perform pg_temp.expect('seed/every_template_renders', true);
end $$;


-- ===========================================================================
-- 5. THE WRITE PATH — the database is the renderer, not the client
-- ===========================================================================

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('c0000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','card-fixture@example.com','x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

-- The client sends prose in `rendered`. The trigger must ignore it entirely:
-- this is the defense-card-ui-qa failure mode (an enrichment step rewriting the
-- user's own words) made structurally impossible.
insert into public.student_cards
  (id, user_id, template_id, variable_values, rendered, content_locale, keyword)
values (
  'c0000000-0000-0000-0000-0000000000d1',
  'c0000000-0000-0000-0000-0000000000c1',
  (select id from public.card_templates where template_key = 'restaurant_order'),
  '{"place":"Chez Marco","go_to_dish":"grilled salmon","signal":"menu_arrives","plan_b":"steak and salad"}'::jsonb,
  'TEXT INJECTED BY A CLIENT OR A MODEL',
  'en',
  '  Anchor  '
);

select pg_temp.expect(
  'write/client_rendered_is_discarded',
  (select rendered not like '%INJECTED%' from public.student_cards
   where id = 'c0000000-0000-0000-0000-0000000000d1')
);

select pg_temp.expect(
  'write/rendered_equals_deterministic_render',
  (select sc.rendered = public.keel_render_card(ct.body_template, ct.variables, sc.variable_values)
   from public.student_cards sc
   join public.card_templates ct on ct.id = sc.template_id
   where sc.id = 'c0000000-0000-0000-0000-0000000000d1')
);

select pg_temp.expect(
  'write/keyword_normalized_at_the_write',
  (select keyword = 'anchor' from public.student_cards
   where id = 'c0000000-0000-0000-0000-0000000000d1')
);

-- Editing the values re-renders. The student's edit is the only author.
update public.student_cards
set variable_values = '{"place":"La Table","go_to_dish":"roast chicken","signal":"first_drink","plan_b":"omelette"}'::jsonb
where id = 'c0000000-0000-0000-0000-0000000000d1';

select pg_temp.expect(
  'write/update_rerenders',
  (select rendered like '%La Table%' and rendered like '%the first drink is served%'
   from public.student_cards where id = 'c0000000-0000-0000-0000-0000000000d1')
);

select pg_temp.expect_raise('neg/write_undeclared_variable_key', $q$
  update public.student_cards
  set variable_values = variable_values || '{"ghost":"x"}'::jsonb
  where id = 'c0000000-0000-0000-0000-0000000000d1'
$q$);

select pg_temp.expect_raise('neg/write_missing_variable', $q$
  update public.student_cards
  set variable_values = '{"place":"only this"}'::jsonb
  where id = 'c0000000-0000-0000-0000-0000000000d1'
$q$);

select pg_temp.expect_raise('neg/keyword_must_be_a_token', $q$
  update public.student_cards set keyword = 'two words'
  where id = 'c0000000-0000-0000-0000-0000000000d1'
$q$);

select pg_temp.expect_raise('neg/approval_needs_an_author_and_a_date', $q$
  update public.student_cards set coach_approved = true
  where id = 'c0000000-0000-0000-0000-0000000000d1'
$q$);


-- ===========================================================================
-- 6. ARMING — "before the event" is a CHECK, not a convention
-- ===========================================================================

insert into public.upcoming_contexts (id, user_id, local_date, slot_key, kind, source, content_locale)
values ('c0000000-0000-0000-0000-0000000000e1',
        'c0000000-0000-0000-0000-0000000000c1',
        current_date + 1, 'dinner', 'restaurant', 'chat', 'en');

insert into public.card_armings
  (user_id, student_card_id, trigger_kind, trigger_ref_id, local_date, slot_key, event_at, arm_at)
values ('c0000000-0000-0000-0000-0000000000c1',
        'c0000000-0000-0000-0000-0000000000d1',
        'upcoming_context', 'c0000000-0000-0000-0000-0000000000e1',
        current_date + 1, 'dinner', now() + interval '10 hours', now() + interval '7 hours');

select pg_temp.expect(
  'arming/written',
  (select count(*) = 1 from public.card_armings
   where student_card_id = 'c0000000-0000-0000-0000-0000000000d1')
);

select pg_temp.expect_raise('neg/arming_after_the_event', $q$
  insert into public.card_armings
    (user_id, student_card_id, trigger_kind, trigger_ref_id, local_date, slot_key, event_at, arm_at)
  values ('c0000000-0000-0000-0000-0000000000c1',
          'c0000000-0000-0000-0000-0000000000d1',
          'upcoming_context', 'c0000000-0000-0000-0000-0000000000e1',
          current_date + 2, 'lunch', now() + interval '2 hours', now() + interval '5 hours')
$q$);

select pg_temp.expect_raise('neg/arming_duplicate_is_rejected', $q$
  insert into public.card_armings
    (user_id, student_card_id, trigger_kind, trigger_ref_id, local_date, slot_key, event_at, arm_at)
  values ('c0000000-0000-0000-0000-0000000000c1',
          'c0000000-0000-0000-0000-0000000000d1',
          'upcoming_context', 'c0000000-0000-0000-0000-0000000000e1',
          current_date + 1, 'dinner', now() + interval '10 hours', now() + interval '7 hours')
$q$);

select pg_temp.expect_raise('neg/arming_delivered_without_a_trace', $q$
  update public.card_armings set status = 'delivered'
  where student_card_id = 'c0000000-0000-0000-0000-0000000000d1'
$q$);


-- ===========================================================================
-- 7. CARD WINS — append-only facts, never an adherence input
-- ===========================================================================

insert into public.card_wins
  (user_id, student_card_id, local_date, slot_key, outcome, source, source_message_id, content_locale)
values ('c0000000-0000-0000-0000-0000000000c1',
        'c0000000-0000-0000-0000-0000000000d1',
        current_date, 'dinner', 'held', 'whatsapp', 'wamid.TEST1', 'en');

select pg_temp.expect(
  'wins/written',
  (select count(*) = 1 from public.card_wins
   where student_card_id = 'c0000000-0000-0000-0000-0000000000d1')
);

-- One inbound message writes one win. Replaying it must not double-count.
select pg_temp.expect_raise('neg/wins_idempotent_on_source_message', $q$
  insert into public.card_wins
    (user_id, student_card_id, local_date, slot_key, outcome, source, source_message_id, content_locale)
  values ('c0000000-0000-0000-0000-0000000000c1',
          'c0000000-0000-0000-0000-0000000000d1',
          current_date, 'dinner', 'held', 'whatsapp', 'wamid.TEST1', 'en')
$q$);

select pg_temp.expect_raise('neg/wins_unknown_outcome', $q$
  insert into public.card_wins
    (user_id, student_card_id, local_date, outcome, source, content_locale)
  values ('c0000000-0000-0000-0000-0000000000c1',
          'c0000000-0000-0000-0000-0000000000d1',
          current_date, 'crushed_it', 'app', 'en')
$q$);

-- CONTRACT non-input: holding a card is not following the prescription.
-- The evaluator writes commitment_evaluations; a win must never create one.
select pg_temp.expect(
  'wins/never_produce_an_evaluation',
  (select count(*) = 0 from public.commitment_evaluations
   where user_id = 'c0000000-0000-0000-0000-0000000000c1')
);


-- ===========================================================================
-- 8. RLS IS ON EVERYWHERE (a table with policies and RLS off is a table with
--    no policies at all)
-- ===========================================================================

select pg_temp.expect(
  'rls/enabled_on_all_four_tables',
  (select count(*) = 4 from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('card_templates','student_cards','card_armings','card_wins')
     and c.relrowsecurity)
);

-- No write policy for anybody on card_armings: the sweep is the only author.
select pg_temp.expect(
  'rls/card_armings_is_read_only_for_authenticated',
  (select count(*) = 0 from pg_policies
   where schemaname = 'public' and tablename = 'card_armings' and cmd <> 'SELECT')
);

-- THE SECOND LOCK. B2 in MEGA_REVIEW shipped writable Tier B views because a
-- migration relied on "no policy grants it" while the ROLE still held the
-- privilege. A policy is a filter; a grant is a capability. These four
-- assertions are about capabilities, and they are what turns "append-only" and
-- "system-written" from comments into properties.
select pg_temp.expect(
  'grants/anon_has_nothing_on_the_card_tables',
  (select count(*) = 0 from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('card_templates','student_cards','card_armings','card_wins')
     and grantee = 'anon')
);

select pg_temp.expect(
  'grants/card_armings_not_writable_by_authenticated',
  (select count(*) = 0 from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'card_armings'
     and grantee = 'authenticated'
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
);

select pg_temp.expect(
  'grants/card_wins_is_append_only',
  (select count(*) = 0 from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'card_wins'
     and grantee = 'authenticated'
     and privilege_type in ('UPDATE','DELETE','TRUNCATE'))
  and (select count(*) = 1 from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'card_wins'
     and grantee = 'authenticated' and privilege_type = 'INSERT')
);

-- The arming ledger's idempotency key must be a PLAIN-COLUMN unique index.
-- An expression index (the first version used COALESCE) cannot be named in
-- PostgREST's on_conflict, and the sweep then fails on every single pass while
-- reporting "0 armings written" — indistinguishable from a quiet week.
select pg_temp.expect(
  'arming/idempotency_index_is_upsertable',
  (select indexdef like '%(student_card_id, trigger_kind, trigger_ref_id, local_date, slot_key)%'
      and indexdef like '%NULLS NOT DISTINCT%'
   from pg_indexes
   where schemaname = 'public' and indexname = 'card_armings_unique_idx')
);


-- ===========================================================================
-- REPORT
-- ===========================================================================

select
  count(*) as checks,
  count(*) filter (where ok) as passed,
  count(*) filter (where not ok) as failed
from card_test_results;

select step, detail from card_test_results where not ok;

rollback;
