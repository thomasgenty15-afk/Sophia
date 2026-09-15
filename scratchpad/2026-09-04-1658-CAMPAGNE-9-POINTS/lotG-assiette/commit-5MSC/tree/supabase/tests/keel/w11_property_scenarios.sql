-- ===========================================================================
-- KEEL — W11 property scenarios (DB layer)
--
-- The three W11 properties are asserted in TypeScript over the modules that
-- render and route (`sophia-brain/test_harness/keel_properties/`). This file
-- asserts the half of them that lives in the SCHEMA — the half no application
-- edit can weaken, and the half a rewritten service would silently lose.
--
-- WHY IT LOOKS DIFFERENT FROM acceptance_fixtures.sql. That file `\echo`s and
-- leaves a human to read the output. This one RAISES. A property test whose
-- result has to be eyeballed is a property test that goes unread the week
-- everyone is busy; every check below either passes silently or aborts the
-- transaction with the reason. Exit status is the signal.
--
--   docker cp supabase/tests/keel/w11_property_scenarios.sql \
--     supabase_db_Sophia_2:/tmp/w11.sql \
--     && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--          -v ON_ERROR_STOP=1 -f /tmp/w11.sql
--
-- Read-only: everything runs inside one transaction that ends in ROLLBACK, and
-- the only writes are negative probes that must fail anyway.
-- ===========================================================================

\set ON_ERROR_STOP on
begin;

do $$ begin raise notice '--- KEEL W11 property scenarios ---'; end $$;

-- ===========================================================================
-- PROPERTY 1 — EXECUTION TRUTH: nothing can be scored that was not prescribed
-- ===========================================================================
-- The honesty rule has a schema half: an evaluation cannot exist for a line the
-- coach never wrote. It is a REFERENCE, not a convention, so no service rewrite
-- can lose it.

do $$
declare
  n int;
begin
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.commitment_evaluations'::regclass
    and contype = 'f'
    and confrelid = 'public.plan_commitments'::regclass;
  if n < 1 then
    raise exception
      'PROPERTY 1 FAILED: commitment_evaluations no longer references plan_commitments — '
      'a grade can now exist for a line nobody prescribed';
  end if;
  raise notice 'PROPERTY 1a ok: commitment_evaluations -> plan_commitments FK present';
end $$;

-- Negative probe: a grade pointing at nothing must be refused by the database.
do $$
declare
  refused boolean := false;
begin
  begin
    insert into commitment_evaluations
      (user_id, commitment_id, plan_version_id, local_date, grain, status, timing_status)
    values
      ('11111111-1111-1111-1111-111111111111',
       '00000000-0000-0000-0000-0000000000ff',
       '22222222-2222-2222-2222-222222222222',
       current_date, 'day', 'met', 'on_time');
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception
      'PROPERTY 1 FAILED: an evaluation was accepted for a commitment_id that does not exist';
  end if;
  raise notice 'PROPERTY 1b ok: a grade with no prescription behind it is refused';
end $$;

-- Append-only: `protocol_events` carries no UPDATE policy at all. Retroactive
-- correction happens by ADDING a fact, never by rewriting one — that is what
-- makes "actually I did eat well on Tuesday" possible without corrupting
-- history, and what stops "mark yesterday as a zero so the week is not ruined".
do $$
declare
  n int;
  del_qual text;
begin
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'protocol_events' and cmd = 'UPDATE';
  if n > 0 then
    raise exception
      'PROPERTY 1 FAILED: protocol_events grew an UPDATE policy — facts are append-only, '
      'and a rewritable fact is a fact a student can be talked into editing';
  end if;

  -- One DELETE policy exists on purpose (undo a mis-tap). It must stay NARROW:
  -- own row, quick_tap only, inside a short window. A broad delete would let a
  -- binge-purge student erase the evidence of the episode.
  select qual into del_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'protocol_events' and cmd = 'DELETE'
  limit 1;
  if del_qual is not null then
    if del_qual not like '%quick_tap%' or del_qual not like '%auth.uid()%'
       or del_qual not like '%occurred_at%' then
      raise exception
        'PROPERTY 1 FAILED: the protocol_events DELETE policy is no longer scoped to '
        '(own row, quick_tap, recent) — it now reads: %', del_qual;
    end if;
  end if;
  raise notice 'PROPERTY 1c ok: protocol_events is append-only, delete stays scoped to an undo';
end $$;

-- Derived state is server-written. A student who could insert their own
-- evaluation would be grading their own paper, which the contract refuses in
-- every form including as an option flag.
do $$
declare
  n int;
begin
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename = 'commitment_evaluations'
    and cmd in ('INSERT', 'UPDATE', 'DELETE');
  if n > 0 then
    raise exception
      'PROPERTY 1 FAILED: commitment_evaluations gained a % policy — the student '
      'now grades their own paper', n;
  end if;
  raise notice 'PROPERTY 1d ok: evaluations are server-written only';
end $$;

-- ===========================================================================
-- PROPERTY 2 — NO CALORIE FIGURE CAN BE STORED AS A PHOTO-DERIVED FACT
-- ===========================================================================
-- CONTRACT non-input #4: a photo may evidence presence / composition / portion
-- / serving; it never produces an energy or macro_* fact. The TypeScript layer
-- strips them at parse; this asserts the table has nowhere to put one even if
-- the parser were bypassed.

do $$
declare
  offending text;
begin
  select string_agg(column_name, ', ') into offending
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'protocol_events'
    and (
      column_name ~* '(calorie|kcal|energy|macro|protein|carb|fat|kj)'
    );
  if offending is not null then
    raise exception
      'PROPERTY 2 FAILED: protocol_events grew energy/macro column(s): % — a photo '
      'never produces an energy fact, not even "internally for the trend" '
      '(docs/keel/PHOTO_QUANTIFICATION.md: the internal number produces a false trend)',
      offending;
  end if;
  raise notice 'PROPERTY 2a ok: protocol_events carries no energy or macro column';
end $$;

-- The ORDINAL is what KEEL is allowed to carry instead. Four values, CHECKed:
-- the token IS the error bar, which is why it needs no number beside it.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.protocol_events'::regclass
    and conname = 'protocol_events_portion_band_check';
  if def is null then
    raise exception
      'PROPERTY 2 FAILED: the portion_band CHECK is gone — the ordinal that '
      'replaces the calorie count is now free text';
  end if;
  for def in select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.protocol_events'::regclass
      and conname = 'protocol_events_portion_band_check'
  loop
    if def not like '%small%' or def not like '%moderate%'
       or def not like '%large%' or def not like '%unclear%' then
      raise exception 'PROPERTY 2 FAILED: portion_band vocabulary changed: %', def;
    end if;
  end loop;
  raise notice 'PROPERTY 2b ok: portion_band is CHECKed to the four ordinal tokens';
end $$;

-- Negative probe: a quantity smuggled into the band is refused.
do $$
declare
  refused boolean := false;
begin
  begin
    insert into protocol_events (user_id, occurred_at, local_date, source, portion_band)
    values ('11111111-1111-1111-1111-111111111111', now(), current_date, 'photo', '850 kcal');
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception 'PROPERTY 2 FAILED: portion_band accepted a calorie string';
  end if;
  raise notice 'PROPERTY 2c ok: a calorie string cannot enter portion_band';
end $$;

-- ===========================================================================
-- PROPERTY 3 — THE COACH DECIDES; THE AI AND THE APP ESCALATE
-- ===========================================================================
-- The restriction floor's escalation path and the non-prescription rule share
-- one schema guarantee: a coach's access is structurally read-only, so no
-- runtime path can apply a change on their behalf.

do $$
declare
  offending text;
begin
  select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ')
    into offending
  from pg_policies
  where schemaname = 'public'
    and tablename in ('plan_versions', 'plan_commitments', 'protocol_events',
                      'commitment_evaluations', 'planned_deviations')
    and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and policyname like '%coach%';
  if offending is not null then
    raise exception
      'PROPERTY 3 FAILED: a coach write policy appeared: % — coach access is '
      'read-only by construction (impersonation was refused on the record)',
      offending;
  end if;
  raise notice 'PROPERTY 3a ok: no coach write policy on any plan or fact table';
end $$;

-- The escalation row exists, and its draft is a DRAFT: `suggested_option` is
-- never applied. The column has to be there for the AI to escalate at all.
do $$
declare
  n int;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'contract_change_requests'
    and column_name in ('suggested_option', 'status');
  if n <> 2 then
    raise exception
      'PROPERTY 3 FAILED: contract_change_requests lost suggested_option/status — '
      'the AI escalates and the coach decides; without these columns there is '
      'nowhere for an undecided request to sit';
  end if;
  raise notice 'PROPERTY 3b ok: the escalation row can hold an undecided draft';
end $$;

-- Safety constraints are STRUCTURED identifiers, never prose. An allergy cannot
-- be a probabilistic memory, and it cannot be a sentence a matcher has to parse.
do $$
declare
  n int;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'student_safety_constraints'
    and column_name in ('allergen_ref', 'substance_ref', 'severity');
  if n < 3 then
    raise exception
      'PROPERTY 3 FAILED: student_safety_constraints lost a structured identifier '
      'column (allergen_ref / substance_ref / severity) — only % of 3 present', n;
  end if;
  raise notice 'PROPERTY 3c ok: safety constraints are structured identifiers';
end $$;

-- ===========================================================================
-- PROPERTY 4 — R1: every stored TOKEN is ASCII snake_case English
-- ===========================================================================
-- The French-weekday bug in one query. Seeds are data, and data drifts: this is
-- the only check that reads what is actually IN the tables rather than what the
-- CHECK would allow.

do $$
declare
  bad text;
begin
  select string_agg(t.src || ':' || t.tok, ', ') into bad
  from (
    select 'slot_vocabulary.key' as src, key as tok from slot_vocabulary
    union all
    select 'food_groups.slug', slug from food_groups
    union all
    select 'substance_limits.substance_ref', substance_ref from substance_limits
  ) t
  where t.tok !~ '^[a-z][a-z0-9_]*$';
  if bad is not null then
    raise exception 'PROPERTY 4 FAILED: non-ASCII-snake_case token(s) seeded: %', bad;
  end if;
  raise notice 'PROPERTY 4 ok: every seeded token is ASCII snake_case';
end $$;

do $$ begin raise notice '--- ALL W11 DB PROPERTIES PASSED ---'; end $$;

rollback;
