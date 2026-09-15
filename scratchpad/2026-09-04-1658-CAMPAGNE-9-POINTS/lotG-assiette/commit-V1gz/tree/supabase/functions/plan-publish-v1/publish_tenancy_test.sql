-- ============================================================================
-- KEEL W6.2 — plan-publish-v1: the tenancy gate, proved in the database.
--
-- MANUAL psql script, same discipline as _shared/keel/tenancy_rls_test.sql:
--
--   docker cp supabase/functions/plan-publish-v1/publish_tenancy_test.sql \
--     supabase_db_Sophia_2:/tmp/publish_tenancy_test.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -f /tmp/publish_tenancy_test.sql
--
-- Runs inside one transaction ending in ROLLBACK. Every count is SCOPED to the
-- ids this file inserts — the W4 lesson: a global `count(*)` turns any other
-- row in the database into a false red.
--
-- WHY THIS FILE EXISTS
-- `plan-publish-v1` writes under the SERVICE ROLE (the coach has no write
-- policy anywhere, by contract). A service-role write bypasses RLS, so the
-- only thing standing between "coach A publishes to their student" and "coach A
-- publishes into coach B's student's space" is the gate the function calls:
-- `public.coached_student_ids()`, executed under the COACH's own JWT.
--
-- These assertions pin that gate, and the read-only rule around it:
--
--   1. coached_student_ids() as coach A contains A's consented student
--   2. ...and does NOT contain coach B's student            <- the publish gate
--   3. after the student revokes consent, the gate empties  <- revocation bites
--   4. a suspended coach gets an empty gate
--   5. the coach cannot INSERT a plan_versions row directly (no write policy)
--   6. the coach cannot INSERT a plan_commitments row directly
--   7. the coach cannot forge a coach_access_events row (server-written only)
--   8. the partial unique index really allows only ONE published version
--      per student — the constraint plan-publish-v1 sequences around
--   9. a coach CAN read the published plan of their own student (Tier A)
--      and CANNOT read the other coach's (the publish result is visible to
--      the right person only)
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

create or replace function pg_temp.become(u uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', u, 'role', 'authenticated')::text,
                     true);
  execute 'set local role authenticated';
end;
$$;

-- Runs a statement that MUST be refused (by a policy or a constraint) and
-- returns 1 when it was refused, 0 when it went through. A silent success is
-- the failure this file is about.
create or replace function pg_temp.refused(sql text)
returns bigint language plpgsql as $$
begin
  execute sql;
  return 0;
exception when others then
  return 1;
end;
$$;


-- ---------------------------------------------------------------------------
-- Cast — ids namespaced 'w6' so every count below can be scoped to them.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('a6000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w6.coach.a@example.com','x', now(), now(), now(), '{}', '{}','','','',''),
  ('b6000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w6.coach.b@example.com','x', now(), now(), now(), '{}', '{}','','','',''),
  ('c6000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w6.student.a@example.com','x', now(), now(), now(), '{}', '{}','','','',''),
  ('d6000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w6.student.b@example.com','x', now(), now(), now(), '{}', '{}','','','','')
on conflict (id) do nothing;

insert into public.coaches (id, user_id, display_name, status) values
  ('a6111111-0000-0000-0000-0000000000aa','a6000000-0000-0000-0000-0000000000a1','W6 Coach A','active'),
  ('b6111111-0000-0000-0000-0000000000bb','b6000000-0000-0000-0000-0000000000b1','W6 Coach B','active');

insert into public.coach_clients (id, coach_id, student_user_id, status, consent_granted_at, started_at) values
  ('a6222222-0000-0000-0000-0000000000aa','a6111111-0000-0000-0000-0000000000aa',
   'c6000000-0000-0000-0000-0000000000c1','active', now(), now()),
  ('b6222222-0000-0000-0000-0000000000bb','b6111111-0000-0000-0000-0000000000bb',
   'd6000000-0000-0000-0000-0000000000d1','active', now(), now());

update public.profiles set keel_role = 'student'
  where id in ('c6000000-0000-0000-0000-0000000000c1','d6000000-0000-0000-0000-0000000000d1');
update public.profiles set keel_role = 'coach'
  where id in ('a6000000-0000-0000-0000-0000000000a1','b6000000-0000-0000-0000-0000000000b1');

-- One published plan per student — what plan-publish-v1 would have written.
insert into public.plan_versions (id, coach_id, student_id, version, status, title,
  timezone, anchor_week_start, duration_weeks, content_locale, published_at, published_by) values
  ('a6333333-0000-0000-0000-0000000000aa','a6111111-0000-0000-0000-0000000000aa',
   'c6000000-0000-0000-0000-0000000000c1',1,'published','W6 Plan A','Europe/Paris',
   current_date,12,'en-US', now(), 'a6111111-0000-0000-0000-0000000000aa'),
  ('b6333333-0000-0000-0000-0000000000bb','b6111111-0000-0000-0000-0000000000bb',
   'd6000000-0000-0000-0000-0000000000d1',1,'published','W6 Plan B','Europe/Paris',
   current_date,12,'en-US', now(), 'b6111111-0000-0000-0000-0000000000bb');


-- ---------------------------------------------------------------------------
-- 1-2. THE PUBLISH GATE
-- ---------------------------------------------------------------------------
select pg_temp.become('a6000000-0000-0000-0000-0000000000a1');

select pg_temp.assert_eq(
  '1. coach A gate contains their own consented student',
  (select count(*) from unnest(public.coached_student_ids()) sid
    where sid = 'c6000000-0000-0000-0000-0000000000c1'),
  1);

select pg_temp.assert_eq(
  '2. coach A gate does NOT contain coach B''s student (publish refused)',
  (select count(*) from unnest(public.coached_student_ids()) sid
    where sid = 'd6000000-0000-0000-0000-0000000000d1'),
  0);


-- ---------------------------------------------------------------------------
-- 5-7. THE COACH IS STRUCTURALLY READ-ONLY
--      (which is precisely why the publish goes through a service-role
--       function with an explicit gate, instead of a direct client write)
-- ---------------------------------------------------------------------------
select pg_temp.assert_eq(
  '5. coach cannot INSERT a plan_versions row directly',
  pg_temp.refused($ins$
    insert into public.plan_versions (coach_id, student_id, version, status, title,
      timezone, content_locale)
    values ('a6111111-0000-0000-0000-0000000000aa','c6000000-0000-0000-0000-0000000000c1',
            99,'draft','forged','Europe/Paris','en-US')
  $ins$),
  1);

select pg_temp.assert_eq(
  '6. coach cannot INSERT a plan_commitments row directly',
  pg_temp.refused($ins$
    insert into public.plan_commitments (plan_version_id, user_id, coach_id, polarity,
      anchor_kind, measure, target_op, evidence_kind, evaluation_grain, title, content_locale)
    values ('a6333333-0000-0000-0000-0000000000aa','c6000000-0000-0000-0000-0000000000c1',
            'a6111111-0000-0000-0000-0000000000aa','do','free','presence','any',
            'self_report','day','forged','en-US')
  $ins$),
  1);

select pg_temp.assert_eq(
  '7. coach cannot forge a coach_access_events row (server-written only)',
  pg_temp.refused($ins$
    insert into public.coach_access_events (coach_id, student_user_id, surface)
    values ('a6111111-0000-0000-0000-0000000000aa','c6000000-0000-0000-0000-0000000000c1',
            'plan_publish_approval_forged')
  $ins$),
  1);


-- ---------------------------------------------------------------------------
-- 9. TIER A READ — the publish is visible to the right coach only
-- ---------------------------------------------------------------------------
select pg_temp.assert_eq(
  '9a. coach A reads their own student''s published plan',
  (select count(*) from public.plan_versions
    where student_id = 'c6000000-0000-0000-0000-0000000000c1'),
  1);

select pg_temp.assert_eq(
  '9b. coach A cannot read coach B''s student''s published plan',
  (select count(*) from public.plan_versions
    where student_id = 'd6000000-0000-0000-0000-0000000000d1'),
  0);

reset role;


-- ---------------------------------------------------------------------------
-- 8. THE CONSTRAINT plan-publish-v1 SEQUENCES AROUND
-- ---------------------------------------------------------------------------
-- Two published versions for the same student is what the ordering in
-- publish.ts exists to avoid. Proving the index really bites is what makes
-- that ordering necessary rather than decorative.
select pg_temp.assert_eq(
  '8a. a SECOND published version for the same student is rejected',
  pg_temp.refused($ins$
    insert into public.plan_versions (coach_id, student_id, version, status, title,
      timezone, content_locale)
    values ('a6111111-0000-0000-0000-0000000000aa','c6000000-0000-0000-0000-0000000000c1',
            2,'published','W6 Plan A v2','Europe/Paris','en-US')
  $ins$),
  1);

-- ...and the supersede-then-publish order goes through.
update public.plan_versions set status = 'superseded'
  where id = 'a6333333-0000-0000-0000-0000000000aa';
insert into public.plan_versions (id, coach_id, student_id, version, status, title,
  timezone, content_locale, supersedes_version_id)
values ('a6444444-0000-0000-0000-0000000000aa','a6111111-0000-0000-0000-0000000000aa',
        'c6000000-0000-0000-0000-0000000000c1',2,'draft','W6 Plan A v2','Europe/Paris','en-US',
        'a6333333-0000-0000-0000-0000000000aa');
update public.plan_versions set status = 'published', published_at = now()
  where id = 'a6444444-0000-0000-0000-0000000000aa';

select pg_temp.assert_eq(
  '8b. after supersede-then-publish, exactly one published version remains',
  (select count(*) from public.plan_versions
    where student_id = 'c6000000-0000-0000-0000-0000000000c1' and status = 'published'),
  1);


-- ---------------------------------------------------------------------------
-- 3-4. REVOCATION AND SUSPENSION CLOSE THE GATE
-- ---------------------------------------------------------------------------
-- The student pulls consent through the RPC (no client UPDATE policy exists).
select pg_temp.become('c6000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_eq(
  '3a. revoke_coach_access() revokes exactly one link',
  (select public.revoke_coach_access())::bigint,
  1);
reset role;

select pg_temp.become('a6000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_eq(
  '3b. after revocation the publish gate is empty for that student',
  (select count(*) from unnest(public.coached_student_ids()) sid
    where sid = 'c6000000-0000-0000-0000-0000000000c1'),
  0);
reset role;

-- Restore the link, then suspend the coach.
update public.coach_clients
   set status = 'active', consent_granted_at = now()
 where id = 'a6222222-0000-0000-0000-0000000000aa';
update public.coaches set status = 'suspended'
 where id = 'a6111111-0000-0000-0000-0000000000aa';

select pg_temp.become('a6000000-0000-0000-0000-0000000000a1');
-- array_length, not count(*): `coached_student_ids()` returns ONE uuid[] row,
-- so `count(*)` over it is 1 whether the array is empty or full. That is the
-- exact shape of assertion that passes while proving nothing.
select pg_temp.assert_eq(
  '4. a suspended coach has an empty publish gate',
  (select coalesce(array_length(public.coached_student_ids(), 1), 0))::bigint,
  0);
reset role;

rollback;
