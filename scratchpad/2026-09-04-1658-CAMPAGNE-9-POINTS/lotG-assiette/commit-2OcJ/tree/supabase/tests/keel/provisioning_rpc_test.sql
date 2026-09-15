-- ============================================================================
-- KEEL W4.2 — the provisioning RPCs, tested where they run (Postgres).
--
-- MANUAL. Run against the LOCAL database, after `npx supabase db reset --local`:
--
--   docker cp supabase/tests/keel/provisioning_rpc_test.sql \
--     supabase_db_Sophia_2:/tmp/prov.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/prov.sql
--
-- WHY HERE AND NOT IN DENO
-- The three things under test are database behaviours that no fake can prove:
-- an ON CONFLICT against a FUNCTIONAL unique index, a join-on-the-write-path in
-- the sweep, and the re-validation that makes the RPC refuse a stale caller.
-- A TypeScript test of those would only prove that the TypeScript is consistent
-- with itself.
--
-- Everything runs inside one transaction ending with ROLLBACK.
--
-- WHAT IS ASSERTED
--   1. seed: pre-seeds the nominal lines it is given, in `unknown`
--   2. seed: idempotent — a second identical call inserts 0, conflicts N
--   3. seed: idempotent for a day/week grain row too (slot_key NULL — the case
--            a plain UNIQUE constraint would have duplicated forever)
--   4. seed: refuses an opportunistic line even when the caller asks for it
--   5. seed: refuses a line of a version that is not published (stale caller)
--   6. seed: never overwrites an already-resolved evaluation
--   7. sweep: unresolved `do` line -> missed
--   8. sweep: unresolved `avoid` line -> met (R6 inverted default)
--   9. sweep: device-fed line -> STAYS unknown (R6, never missed)
--  10. sweep: a line covered by a planned deviation -> not_applicable
--  11. sweep: flex-eligible line + consumed flex -> flex_used
--  12. sweep: an opportunistic row that somehow exists is NOT swept
--  13. sweep: idempotent — a second run resolves nothing more
--  14. sweep: a resolved `met` is not overwritten by the close
--  15. invalidate: drops the superseded version's in-flight rows only
--  16. invalidate: keeps resolved history and past days
--  17. cancel: cancels the KEEL checkins in flight, leaves the others alone
-- ============================================================================

begin;

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, got, want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

create or replace function pg_temp.assert_txt(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, coalesce(got,'<null>'), want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scaffolding
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','w42-student@example.com','x',
        now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

-- The published version, and a superseded one to prove the republication scope.
insert into plan_versions (id, coach_id, student_id, version, status, title,
  timezone, anchor_week_start, duration_weeks, content_locale)
values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   2, 'published', 'W4.2 plan', 'Europe/Paris', date '2026-07-27', 12, 'en-US'),
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   1, 'superseded', 'W4.2 plan (old)', 'Europe/Paris', date '2026-07-27', 12, 'en-US');

-- Commitments. Ids are readable so a failure names the line.
insert into plan_commitments
(id, plan_version_id, user_id, coach_id, polarity, activity_class, anchor_kind,
 slot_key, measure, unit, target_op, target_min, substance_ref, evidence_kind,
 auto_source, counts_toward_adherence, evaluation_grain, slot_kind,
 scheduled_days, flex_eligible, title, content_locale)
values
  -- 1. nominal `do`, occasion grain, slotted
  ('dddddddd-0000-0000-0000-00000000000d',
   'bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001','do','supplement','slot','breakfast',
   'dose','IU','>=',5000,'vitamin_d3','self_report',null,true,'occasion','nominal',
   '{mon,tue,wed,thu,fri,sat,sun}',false,'D3 5000 IU','en-US'),
  -- 2. nominal `avoid`, day grain (slot_key NULL on the evaluation row)
  ('dddddddd-0000-0000-0000-00000000000a',
   'bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001','avoid','nutrition','free',null,
   'presence','none','==',0,'alcohol','none_implicit',null,true,'day','nominal',
   '{mon,tue,wed,thu,fri,sat,sun}',false,'No alcohol','en-US'),
  -- 3. nominal, device-fed (R6 guardrail)
  ('dddddddd-0000-0000-0000-00000000000e',
   'bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001','capture','sleep','free',null,
   'duration','h','>=',7,null,'device','oura',false,'day','nominal',
   '{mon,tue,wed,thu,fri,sat,sun}',false,'Sleep 7h+','en-US'),
  -- 4. opportunistic (must never be seeded nor swept)
  ('dddddddd-0000-0000-0000-00000000000f',
   'bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001','do','nutrition','slot','any_meal',
   'serving','serving','>=',2,null,'photo',null,true,'day','opportunistic',
   '{mon,tue,wed,thu,fri,sat,sun}',false,'Cruciferous veg','en-US'),
  -- 5. nominal, flex-eligible, slotted (deviation branches)
  ('dddddddd-0000-0000-0000-000000000010',
   'bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001','do','nutrition','slot','dinner',
   'presence','none','any',null,null,'photo',null,true,'occasion','nominal',
   '{mon,tue,wed,thu,fri,sat,sun}',true,'Dinner per plan','en-US'),
  -- 6. a line of the SUPERSEDED version (republication scope)
  ('dddddddd-0000-0000-0000-000000000011',
   'bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001','do','supplement','slot','on_waking',
   'dose','mg','>=',25,'iron_bisglycinate','self_report',null,true,'occasion','nominal',
   '{mon,tue,wed,thu,fri,sat,sun}',false,'Withdrawn iron line','en-US');

\set day '''2026-07-28'''

-- ---------------------------------------------------------------------------
-- 1-3. keel_seed_evaluations: seeds, and is idempotent on BOTH key shapes
-- ---------------------------------------------------------------------------

\echo '--- 1..3: seed + idempotence (including the slot_key NULL case) ---'

create or replace function pg_temp.seed_payload(p_day date)
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object(
      'user_id','aaaaaaaa-0000-0000-0000-000000000001',
      'commitment_id','dddddddd-0000-0000-0000-00000000000d',
      'plan_version_id','bbbbbbbb-0000-0000-0000-000000000001',
      'local_date', p_day, 'slot_key','breakfast','grain','occasion',
      'expected', jsonb_build_object('measure','dose')),
    jsonb_build_object(
      'user_id','aaaaaaaa-0000-0000-0000-000000000001',
      'commitment_id','dddddddd-0000-0000-0000-00000000000a',
      'plan_version_id','bbbbbbbb-0000-0000-0000-000000000001',
      'local_date', p_day, 'slot_key', null, 'grain','day',
      'expected', jsonb_build_object('measure','presence')),
    jsonb_build_object(
      'user_id','aaaaaaaa-0000-0000-0000-000000000001',
      'commitment_id','dddddddd-0000-0000-0000-00000000000e',
      'plan_version_id','bbbbbbbb-0000-0000-0000-000000000001',
      'local_date', p_day, 'slot_key', null, 'grain','day',
      'expected', jsonb_build_object('measure','duration')),
    jsonb_build_object(
      'user_id','aaaaaaaa-0000-0000-0000-000000000001',
      'commitment_id','dddddddd-0000-0000-0000-000000000010',
      'plan_version_id','bbbbbbbb-0000-0000-0000-000000000001',
      'local_date', p_day, 'slot_key','dinner','grain','occasion',
      'expected', jsonb_build_object('measure','presence'))
  );
$$;

select pg_temp.assert_eq('1. first seed inserts 4',
  (public.keel_seed_evaluations(pg_temp.seed_payload(:day)) ->> 'inserted')::bigint, 4);

-- SCOPED TO THE FIXTURE, and that is not cosmetic. This assertion used to
-- count EVERY row of `commitment_evaluations` on `:day`, so it went red on any
-- database that also held a real student — 4 seeded + 9 belonging to somebody
-- else read as "got 13, want 4". A test that fails because the database is not
-- empty is a false red, and a false red is a test people learn to ignore.
select pg_temp.assert_eq('1b. all seeded rows are unknown/unresolved',
  (select count(*) from commitment_evaluations
   where local_date = :day and status = 'unknown' and resolved_at is null
     and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and plan_version_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 4);

with second as (select public.keel_seed_evaluations(pg_temp.seed_payload(:day)) as r)
select
  pg_temp.assert_eq('2. replay inserts 0', ((select r from second) ->> 'inserted')::bigint, 0),
  pg_temp.assert_eq('2b. replay conflicts 4', ((select r from second) ->> 'conflicted')::bigint, 0 + 4);

-- 3 is the one a plain UNIQUE constraint would have failed: Postgres treats
-- NULLs as distinct, so the two slot_key NULL rows would have duplicated on
-- every single replay. The functional index coalesces to 'no_slot'.
select pg_temp.assert_eq('3. no duplicate for the slot_key NULL rows',
  (select count(*) from commitment_evaluations
   where local_date = :day and slot_key is null
     and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and plan_version_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 2);

-- ---------------------------------------------------------------------------
-- 4-6. keel_seed_evaluations refuses what the caller must not be able to write
-- ---------------------------------------------------------------------------

\echo '--- 4..6: the RPC re-validates the caller (execution truth) ---'

with r as (
  select public.keel_seed_evaluations(jsonb_build_array(jsonb_build_object(
    'user_id','aaaaaaaa-0000-0000-0000-000000000001',
    'commitment_id','dddddddd-0000-0000-0000-00000000000f',   -- opportunistic
    'plan_version_id','bbbbbbbb-0000-0000-0000-000000000001',
    'local_date', :day, 'slot_key', null, 'grain','day',
    'expected','{}'::jsonb))) as v
)
select
  pg_temp.assert_eq('4. opportunistic line rejected', ((select v from r) ->> 'rejected')::bigint, 1),
  pg_temp.assert_eq('4b. nothing inserted', ((select v from r) ->> 'inserted')::bigint, 0);

with r as (
  select public.keel_seed_evaluations(jsonb_build_array(jsonb_build_object(
    'user_id','aaaaaaaa-0000-0000-0000-000000000001',
    'commitment_id','dddddddd-0000-0000-0000-000000000011', -- superseded version
    'plan_version_id','bbbbbbbb-0000-0000-0000-000000000002',
    'local_date', :day, 'slot_key','on_waking','grain','occasion',
    'expected','{}'::jsonb))) as v
)
select pg_temp.assert_eq('5. line of a non-published version rejected',
  ((select v from r) ->> 'rejected')::bigint, 1);

-- 6: an evaluation resolved by a real fact must survive a re-provisioning of
-- the same day (DST double tick, manual replay). `unknown` is never restored
-- over a `met`.
update commitment_evaluations
set status = 'met', resolved_at = now(), resolved_by = 'student', evidence = 'self_report'
where local_date = :day and commitment_id = 'dddddddd-0000-0000-0000-00000000000d';

select public.keel_seed_evaluations(pg_temp.seed_payload(:day));
select pg_temp.assert_txt('6. resolved row not reset by a re-seed',
  (select status from commitment_evaluations
   where local_date = :day and commitment_id = 'dddddddd-0000-0000-0000-00000000000d'),
  'met');

-- ---------------------------------------------------------------------------
-- 7-14. keel_sweep_day_evaluations: the named branches at day close
-- ---------------------------------------------------------------------------

\echo '--- 7..14: end-of-day sweep ---'

-- A deviation on the dinner slot, spending a flex on a flex-eligible line.
insert into planned_deviations
  (user_id, plan_version_id, local_date, slot_key, kind, declared_via,
   content_locale, consumed_flex)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', :day, 'dinner',
        'restaurant', 'chat', 'en-US', true);

-- An orphan opportunistic row, to prove the sweep does not touch it even if it
-- exists (belt: the evaluator can create one from a fact).
insert into commitment_evaluations
  (user_id, commitment_id, plan_version_id, local_date, slot_key, grain, status)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-00000000000f',
        'bbbbbbbb-0000-0000-0000-000000000001', :day, null, 'day', 'unknown');

with s as (
  select public.keel_sweep_day_evaluations(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000001',
    :day) as v
)
select
  pg_temp.assert_eq('8. avoid line resolved met', ((select v from s) ->> 'met')::bigint, 1),
  pg_temp.assert_eq('11. flex-eligible + consumed flex -> flex_used',
    ((select v from s) ->> 'flex_used')::bigint, 1),
  pg_temp.assert_eq('9. device line held unknown',
    ((select v from s) ->> 'held_device_unknown')::bigint, 1),
  -- The `do` line was resolved `met` by assertion 6, so nothing is left to
  -- miss. This is assertion 14 in disguise: the sweep only touches unknowns.
  pg_temp.assert_eq('14. resolved met not overwritten by the close',
    ((select v from s) ->> 'missed')::bigint, 0);

select pg_temp.assert_txt('9b. device-fed row is STILL unknown',
  (select status from commitment_evaluations
   where local_date = :day and commitment_id = 'dddddddd-0000-0000-0000-00000000000e'),
  'unknown');

select pg_temp.assert_txt('12. opportunistic row untouched by the sweep',
  (select status from commitment_evaluations
   where local_date = :day and commitment_id = 'dddddddd-0000-0000-0000-00000000000f'),
  'unknown');

select pg_temp.assert_eq('13. sweep replay resolves nothing more',
  (select (public.keel_sweep_day_evaluations(
     'aaaaaaaa-0000-0000-0000-000000000001',
     'bbbbbbbb-0000-0000-0000-000000000001', :day) ->> 'missed')::bigint), 0);

-- 7 and 10 on a clean day: a plain `do` line with no fact and no deviation, and
-- a day-wide deviation.
\set day2 '''2026-07-29'''

select public.keel_seed_evaluations(pg_temp.seed_payload(:day2));

with s as (
  select public.keel_sweep_day_evaluations(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000001', :day2) as v
)
select
  pg_temp.assert_eq('7. unresolved do lines -> missed', ((select v from s) ->> 'missed')::bigint, 2),
  pg_temp.assert_eq('7b. avoid still met', ((select v from s) ->> 'met')::bigint, 1);

select pg_temp.assert_txt('7c. timing_status on a missed line is unknown',
  (select timing_status from commitment_evaluations
   where local_date = :day2 and commitment_id = 'dddddddd-0000-0000-0000-00000000000d'),
  'unknown');

\set day3 '''2026-07-30'''
select public.keel_seed_evaluations(pg_temp.seed_payload(:day3));
insert into planned_deviations
  (user_id, plan_version_id, local_date, slot_key, kind, declared_via,
   content_locale, consumed_flex)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', :day3, null,
        'travel', 'chat', 'en-US', false);

with s as (
  select public.keel_sweep_day_evaluations(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000001', :day3) as v
)
select
  -- A day declared in advance leaves the denominator entirely. Without this
  -- branch the sweep would hand a `missed` to a student who declared their
  -- travel three days ahead.
  pg_temp.assert_eq('10. day-wide deviation -> not_applicable',
    ((select v from s) ->> 'not_applicable')::bigint, 3),
  pg_temp.assert_eq('10b. nothing missed on a declared day',
    ((select v from s) ->> 'missed')::bigint, 0);

-- ---------------------------------------------------------------------------
-- 15-16. keel_invalidate_inflight_evaluations
-- ---------------------------------------------------------------------------

\echo '--- 15..16: republication invalidates only what is in flight ---'

-- In-flight rows of the SUPERSEDED version: yesterday (resolved), today
-- (unknown), tomorrow (unknown).
insert into commitment_evaluations
  (user_id, commitment_id, plan_version_id, local_date, slot_key, grain, status,
   resolved_at, resolved_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000011',
   'bbbbbbbb-0000-0000-0000-000000000002', date '2026-08-09', 'on_waking','occasion',
   'met', now(), 'student'),
  ('aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000011',
   'bbbbbbbb-0000-0000-0000-000000000002', date '2026-08-10', 'on_waking','occasion',
   'unknown', null, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000011',
   'bbbbbbbb-0000-0000-0000-000000000002', date '2026-08-11', 'on_waking','occasion',
   'unknown', null, null),
  -- and one resolved row ON the publication day: history, must survive
  ('aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000011',
   'bbbbbbbb-0000-0000-0000-000000000002', date '2026-08-10', 'breakfast','occasion',
   'missed', now(), 'system');

select pg_temp.assert_eq('15. two in-flight rows dropped',
  public.keel_invalidate_inflight_evaluations(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000001',
    date '2026-08-10')::bigint, 2);

select pg_temp.assert_eq('16. yesterday and the resolved rows survive',
  (select count(*) from commitment_evaluations
   where plan_version_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 2);

select pg_temp.assert_eq('16b. the new version is never touched',
  (select count(*) from commitment_evaluations
   where plan_version_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     and local_date = :day), 5);

-- ---------------------------------------------------------------------------
-- 17. keel_cancel_inflight_checkins
-- ---------------------------------------------------------------------------

\echo '--- 17: republication cancels the KEEL reminders, and only those ---'

insert into scheduled_checkins (user_id, event_context, scheduled_for, status, origin)
values
  ('aaaaaaaa-0000-0000-0000-000000000001','keel_slot_reminder:breakfast',
   now() + interval '4 hours','pending','unknown'),
  ('aaaaaaaa-0000-0000-0000-000000000001','keel_sunday_digest',
   now() + interval '30 hours','pending','unknown'),
  -- Already fired: a message the student has read. Not ours to rewrite.
  ('aaaaaaaa-0000-0000-0000-000000000001','keel_slot_reminder:on_waking',
   now() - interval '3 hours','sent','unknown'),
  -- The student's own reminder is not a prescription.
  ('aaaaaaaa-0000-0000-0000-000000000001','one_shot_reminder:call_mum',
   now() + interval '6 hours','pending','unknown');

select pg_temp.assert_eq('17. two KEEL reminders cancelled',
  public.keel_cancel_inflight_checkins(
    'aaaaaaaa-0000-0000-0000-000000000001', now())::bigint, 2);

select pg_temp.assert_eq('17b. the student''s own reminder survives',
  (select count(*) from scheduled_checkins
   where event_context like 'one_shot_reminder:%' and status = 'pending'), 1);

select pg_temp.assert_eq('17c. an already-sent KEEL reminder is not rewritten',
  (select count(*) from scheduled_checkins
   where event_context = 'keel_slot_reminder:on_waking' and status = 'sent'), 1);

-- ---------------------------------------------------------------------------
-- Crons must exist, with the right cadence (R7: a silent no-op here means a
-- fleet whose days never open and never close).
-- ---------------------------------------------------------------------------

\echo '--- crons ---'
select pg_temp.assert_eq('cron keel-provision-day hourly at :00',
  (select count(*) from cron.job
   where jobname = 'keel-provision-day' and schedule = '0 * * * *'), 1);
select pg_temp.assert_eq('cron keel-sweep-day hourly at :55',
  (select count(*) from cron.job
   where jobname = 'keel-sweep-day' and schedule = '55 * * * *'), 1);

-- ---------------------------------------------------------------------------
-- profiles.country (W3.3 defect closed in 20260727190000)
-- ---------------------------------------------------------------------------

\echo '--- profiles.country ---'
select pg_temp.assert_eq('country column exists, nullable',
  (select count(*) from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name='country' and is_nullable='YES'), 1);

savepoint country_neg;
\set ON_ERROR_STOP off
\echo 'NEG: a lowercase / 3-letter country must be refused'
insert into profiles (id, locale, country)
values ('aaaaaaaa-0000-0000-0000-000000000001','en-US','usa')
on conflict (id) do update set country = 'usa';
\set ON_ERROR_STOP on
rollback to savepoint country_neg;

rollback;
