-- ===========================================================================
-- QA AGENT 5 — scenario 8: the CHECK is the real belt
-- ===========================================================================
-- Hand-written INSERTs, bypassing the edge function entirely. The point is
-- exactly that: a test protects the path it exercises, a CHECK protects every
-- future writer — the edge function, a manual repair, a backfill.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-5-adversarial.sql
--
-- Everything in ONE transaction that ends in ROLLBACK: this file must never
-- leave a row behind.
--
-- P9 doctrine: a belt ships with its DISARM condition. The last two cases are
-- the false-premise tests — the belt must NOT bite a well-formed plan.
-- ===========================================================================

begin;

create or replace function pg_temp.assert_rejects(label text, want_constraint text, stmt text)
returns void language plpgsql as $$
declare
  got text;
begin
  begin
    execute stmt;
  exception when others then
    got := sqlerrm;
    if want_constraint is not null and position(want_constraint in got) = 0 then
      raise exception 'FAIL % : rejected, but by the WRONG rule: %', label, got;
    end if;
    raise notice 'PASS % (rejected by %)', label, coalesce(want_constraint, 'a constraint');
    return;
  end;
  raise exception 'FAIL % : the write SUCCEEDED but should have been rejected', label;
end;
$$;

create or replace function pg_temp.assert_accepts(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'PASS % (accepted, as it must be)', label;
end;
$$;

-- The student is the agent-5 fixture's nominal student.
-- 8a — a food line with NO source_belief_key at all.
select pg_temp.assert_rejects(
  '8a nutrition line with NO source_belief_key',
  'student_week_plans_doctrine_traceable_check',
  $q$
  insert into public.student_week_plans (user_id, week_start, items, content_locale)
  values ('22222222-0000-4000-8000-000000000001', '2026-09-07',
    '[{"kind":"nutrition","label":"Build lunch around a protein anchor","days":["mon"]}]'::jsonb,
    'en-GB')
  $q$);

-- 8b — the key present but NULL. The nastier shape: `exists()` is true.
select pg_temp.assert_rejects(
  '8b source_belief_key explicitly null',
  'student_week_plans_doctrine_traceable_check',
  $q$
  insert into public.student_week_plans (user_id, week_start, items, content_locale)
  values ('22222222-0000-4000-8000-000000000001', '2026-09-07',
    '[{"kind":"nutrition","label":"x","source_belief_key":null,"days":["mon"]}]'::jsonb,
    'en-GB')
  $q$);

-- 8c — one good line and one bad line in the SAME array. A belt that only
-- looked at items[0] would let this through.
select pg_temp.assert_rejects(
  '8c one traceable line hiding one untraceable line',
  'student_week_plans_doctrine_traceable_check',
  $q$
  insert into public.student_week_plans (user_id, week_start, items, content_locale)
  values ('22222222-0000-4000-8000-000000000001', '2026-09-07',
    '[{"kind":"nutrition","label":"ok","source_belief_key":"protein_anchors_the_plate","days":["mon"]},
      {"kind":"nutrition","label":"smuggled","days":["tue"]}]'::jsonb,
    'en-GB')
  $q$);

-- 8d — a `kind` outside the closed vocabulary.
select pg_temp.assert_rejects(
  '8d kind outside {nutrition, action}',
  'student_week_plans_kind_closed_check',
  $q$
  insert into public.student_week_plans (user_id, week_start, items, content_locale)
  values ('22222222-0000-4000-8000-000000000001', '2026-09-07',
    '[{"kind":"supplement","label":"Take creatine","days":["mon"]}]'::jsonb,
    'en-GB')
  $q$);

-- 8e — adoption without a timestamp.
select pg_temp.assert_rejects(
  '8e status=adopted with no adopted_at',
  'student_week_plans_check',
  $q$
  insert into public.student_week_plans (user_id, week_start, items, status, content_locale)
  values ('22222222-0000-4000-8000-000000000001', '2026-09-07',
    '[{"kind":"action","label":"Walk after lunch","action_kind":"walk","days":["mon"]}]'::jsonb,
    'adopted', 'en-GB')
  $q$);

-- ── FALSE-PREMISE TESTS: the belt must not bite what is well formed ────────
-- 8f — a traced nutrition line plus an action with no key at all.
select pg_temp.assert_accepts(
  '8f traced nutrition + keyless action (the belt stays open)',
  $q$
  insert into public.student_week_plans (user_id, week_start, items, content_locale)
  values ('22222222-0000-4000-8000-000000000001', '2026-09-14',
    '[{"kind":"nutrition","label":"Build lunch around an anchor","source_belief_key":"protein_anchors_the_plate","source_belief_claim":"Every plate starts with its protein anchor.","days":["mon","wed"]},
      {"kind":"action","label":"Ten minutes out after lunch","action_kind":"walk","source_belief_key":null,"days":["tue"]}]'::jsonb,
    'en-GB')
  $q$);

-- 8g — an empty plan is structurally legal (the REFUSAL to write one is the
-- edge function's job, tested at scenario 13 — not the database's).
select pg_temp.assert_accepts(
  '8g empty items array is not a constraint violation',
  $q$
  insert into public.student_week_plans (user_id, week_start, items, content_locale)
  values ('22222222-0000-4000-8000-000000000001', '2026-09-21', '[]'::jsonb, 'en-GB')
  $q$);

rollback;
