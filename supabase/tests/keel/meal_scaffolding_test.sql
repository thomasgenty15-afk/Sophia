-- ===========================================================================
-- KEEL Q6 — meal scaffolding: the wall, the author, and the empty array.
-- Run against the LOCAL DB only:
--   docker cp supabase/tests/keel/meal_scaffolding_test.sql \
--     supabase_db_Sophia_2:/tmp/meals.sql \
--   && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--        -v ON_ERROR_STOP=1 -f /tmp/meals.sql
--   expected: `--- ALL MEAL SCAFFOLDING PROPERTIES PASSED ---` and exit 0
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The meal layer's whole safety story is "it structurally cannot reach the
-- adherence counter". Structural claims deserve structural tests, and the ones
-- worth writing are the ones that would go RED the day somebody relaxes the
-- invariant by accident:
--
--   1. `author_kind` still has exactly two values, and 'ai' is not one.
--   2. Nothing in the meal layer can produce a `commitment_evaluations` row.
--   3. Neither meal table carries anything that could make it look scored
--      (no counts_toward_adherence, no status verdict, no evaluation).
--   4. The student has SELECT and nothing else on both tables.
--   5. A dish with NO food group is legal. This is the empty-array regression:
--      `array_length('{}', 1)` is NULL, and comparing NULL to 0 rejected every
--      dish nobody had ticked a group on. Caught by a real student-side probe,
--      not by reading the trigger.
--
-- Everything runs inside a transaction and rolls back: no row survives.
-- ===========================================================================

begin;

create temporary table meal_test_results (step text, ok boolean, detail text);

create or replace function pg_temp.expect(step text, ok boolean, detail text default null)
returns void language plpgsql as $$
begin
  insert into meal_test_results values (step, ok, detail);
end;
$$;


-- ---------------------------------------------------------------------------
-- 1. THE AUTHOR — two values, and the absence of a third is the feature
-- ---------------------------------------------------------------------------

select pg_temp.expect(
  'author/two_values_only',
  (select pg_get_constraintdef(oid) like '%''coach''%'
      and pg_get_constraintdef(oid) like '%''keel_library''%'
      and pg_get_constraintdef(oid) not like '%''ai''%'
   from pg_constraint
   where conrelid = 'public.meal_ideas'::regclass
     and pg_get_constraintdef(oid) like '%author_kind%'
   limit 1)
);

do $$
declare
  coach_row uuid;
  ok boolean := false;
begin
  select id into coach_row from public.coaches limit 1;
  if coach_row is null then
    -- No coach in this database: the write probes below cannot run, and
    -- SILENTLY PASSING them would be the worst outcome. Say so instead.
    perform pg_temp.expect('author/rejects_ai_value', false, 'no coaches row to probe with');
    perform pg_temp.expect('idea/empty_food_groups_is_legal', false, 'no coaches row to probe with');
    perform pg_temp.expect('idea/duplicate_food_groups_rejected', false, 'no coaches row to probe with');
    perform pg_temp.expect('idea/unknown_food_group_rejected', false, 'no coaches row to probe with');
    return;
  end if;

  begin
    insert into public.meal_ideas (author_kind, coach_id, title)
    values ('ai', coach_row, 'written by a model');
  exception when check_violation then
    ok := true;
  end;
  perform pg_temp.expect('author/rejects_ai_value', ok);

  -- 5. THE EMPTY-ARRAY REGRESSION. A dish with nothing ticked is legal: it
  --    simply cannot cover a nutrition line, and the coverage read says that
  --    out loud instead of pretending. Before the coalesce fix, this insert
  --    failed with "contains duplicates" on an EMPTY array.
  ok := false;
  begin
    insert into public.meal_ideas (coach_id, title) values (coach_row, 'plain dish');
    ok := true;
  exception when others then
    ok := false;
  end;
  perform pg_temp.expect('idea/empty_food_groups_is_legal', ok);

  ok := false;
  begin
    insert into public.meal_ideas (coach_id, title, food_group_refs)
    values (coach_row, 'doubled', array['legumes','legumes']);
  exception when others then
    ok := true;
  end;
  perform pg_temp.expect('idea/duplicate_food_groups_rejected', ok);

  ok := false;
  begin
    insert into public.meal_ideas (coach_id, title, food_group_refs)
    values (coach_row, 'invented', array['unicorn_meat']);
  exception when others then
    ok := true;
  end;
  perform pg_temp.expect('idea/unknown_food_group_rejected', ok);
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. THE WALL — a meal cannot become an evaluation
-- ---------------------------------------------------------------------------

select pg_temp.expect(
  'wall/evaluations_still_reference_commitments',
  (select count(*) > 0
   from information_schema.referential_constraints rc
   join information_schema.key_column_usage kcu
     on kcu.constraint_name = rc.constraint_name
    and kcu.constraint_schema = rc.constraint_schema
   join information_schema.constraint_column_usage ccu
     on ccu.constraint_name = rc.constraint_name
    and ccu.constraint_schema = rc.constraint_schema
   where kcu.table_schema = 'public'
     and kcu.table_name = 'commitment_evaluations'
     and kcu.column_name = 'commitment_id'
     and ccu.table_name = 'plan_commitments')
);

select pg_temp.expect(
  'wall/meal_tables_reference_no_grading_table',
  (select count(*) = 0
   from information_schema.referential_constraints rc
   join information_schema.key_column_usage kcu
     on kcu.constraint_name = rc.constraint_name
    and kcu.constraint_schema = rc.constraint_schema
   join information_schema.constraint_column_usage ccu
     on ccu.constraint_name = rc.constraint_name
    and ccu.constraint_schema = rc.constraint_schema
   where kcu.table_schema = 'public'
     and kcu.table_name in ('meal_ideas','meal_plan_entries')
     and ccu.table_name in ('commitment_evaluations','protocol_events','weekly_reviews'))
);

-- A meal id in commitment_evaluations must be refused by the FK itself.
do $$
declare ok boolean := false; idea uuid; coach_row uuid;
begin
  select id into coach_row from public.coaches limit 1;
  if coach_row is null then
    perform pg_temp.expect('wall/meal_id_cannot_be_evaluated', false, 'no coaches row to probe with');
    return;
  end if;
  insert into public.meal_ideas (coach_id, title) values (coach_row, 'probe') returning id into idea;
  begin
    insert into public.commitment_evaluations
      (user_id, commitment_id, plan_version_id, local_date, grain, status)
    select u.id, idea, pv.id, current_date, 'day', 'met'
    from auth.users u, public.plan_versions pv limit 1;
  exception when others then
    ok := true;
  end;
  perform pg_temp.expect('wall/meal_id_cannot_be_evaluated', ok);
end;
$$;

-- No column on either table could be mistaken for a grade.
select pg_temp.expect(
  'wall/no_scoring_shaped_column',
  (select count(*) = 0
   from information_schema.columns
   where table_schema = 'public'
     and table_name in ('meal_ideas','meal_plan_entries')
     and column_name in (
       'counts_toward_adherence','adherence','score','evaluation_grain',
       'commitment_id','observed_value','timing_status','priority'))
);


-- ---------------------------------------------------------------------------
-- 3. RLS — the coach writes, the student only reads
-- ---------------------------------------------------------------------------

select pg_temp.expect(
  'rls/enabled_on_both_tables',
  (select count(*) = 2 from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in ('meal_ideas','meal_plan_entries')
     and relrowsecurity)
);

-- Every policy that is not the coach's own must be SELECT. A student INSERT,
-- UPDATE or DELETE policy anywhere here would turn the coach's word into a
-- shared document, which is the one thing that makes it worth reading.
select pg_temp.expect(
  'rls/no_student_write_policy',
  (select count(*) = 0
   from pg_policies
   where schemaname = 'public'
     and tablename in ('meal_ideas','meal_plan_entries')
     and policyname not like '%coach%'
     and cmd <> 'SELECT'),
  (select string_agg(policyname || ':' || cmd, ', ')
   from pg_policies
   where schemaname = 'public'
     and tablename in ('meal_ideas','meal_plan_entries')
     and policyname not like '%coach%'
     and cmd <> 'SELECT')
);

select pg_temp.expect(
  'rls/student_read_policies_exist',
  (select count(*) = 2 from pg_policies
   where schemaname = 'public'
     and tablename in ('meal_ideas','meal_plan_entries')
     and policyname like '%student_read%'
     and cmd = 'SELECT')
);


-- ===========================================================================
-- REPORT — raises rather than echoes, so the exit code is the signal
-- ===========================================================================

select step, ok, detail from meal_test_results order by step;

do $$
declare failed int;
begin
  select count(*) into failed from meal_test_results where not ok;
  if failed > 0 then
    raise exception '% MEAL SCAFFOLDING PROPERTY CHECK(S) FAILED', failed;
  end if;
  raise notice '--- ALL MEAL SCAFFOLDING PROPERTIES PASSED ---';
end;
$$;

rollback;
