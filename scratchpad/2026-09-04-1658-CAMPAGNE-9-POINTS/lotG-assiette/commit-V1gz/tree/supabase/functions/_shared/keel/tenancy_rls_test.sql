-- ============================================================================
-- KEEL — TENANCY RLS: negative test (BUILD_PLAN W1.1, "Verif")
--
-- MANUAL. Run by hand against the LOCAL database, after `npx supabase db reset`.
-- This is a psql script, not a deno test: the thing under test is the Postgres
-- policy engine, and a client library that bypasses `set local role` would test
-- nothing at all.
--
--   docker cp supabase/functions/_shared/keel/tenancy_rls_test.sql \
--     supabase_db_Sophia_2:/tmp/tenancy_rls_test.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -f /tmp/tenancy_rls_test.sql
--
-- Everything runs inside one transaction that ends with ROLLBACK: the database
-- is left exactly as found. Nothing here is a fixture for other tests.
--
-- WHAT IS ASSERTED
--   1. coach A reads their own consented student            -> 1 row
--   2. coach A reads the student of coach B                 -> 0 rows  (RLS)
--   3. coach A after the student revokes consent            -> 0 rows
--   4. an 'invited' (unconsented) link grants nothing       -> 0 rows
--   5. a suspended coach reads nothing                      -> 0 rows
--   6. anon reads nothing, anywhere                         -> 0 rows
--   7. the coach cannot WRITE student data                  -> 0 rows written
--   8. Tier B views hide student verbatim                   -> no student_note,
--                                                              no media_path
--   9. structural invariants of the link                    -> 3 bad writes rejected
--  10. revoking consent does not lock the student in        -> switch coach OK
--
-- SECTION 10 REQUIRES A RE-RESET. It asserts the corrected predicate of
-- `one_live_coach_per_student` (status in ('invited','active')). A database
-- still carrying the first version of 20260727120000 (predicate
-- `status <> 'ended'`) fails it with a unique_violation on coach_clients —
-- that red IS the lock-in bug, not a broken test. Run
-- `npx supabase db reset --local` first.
--
-- Every assertion is an `assert_eq`: a wrong count RAISES. A silent pass on a
-- broken policy is the one outcome this file exists to prevent (R7).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Assertion helper (dropped with the rollback).
-- ---------------------------------------------------------------------------
create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, got, want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

-- Impersonate an authenticated user the way PostgREST does.
create or replace function pg_temp.become(student uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', student, 'role', 'authenticated')::text,
                     true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end;
$$;


-- ---------------------------------------------------------------------------
-- W12-V — HERMÉTICITÉ VIS-À-VIS DES VOISINS.
--
-- `auth.users` portait déjà `on conflict (id) do nothing`, mais PAS les tables
-- métier en dessous. Mesuré le 27/07 : une vérification end-to-end avait créé
-- un `coaches` pour `aaaaaaaa-…0001` (l'uuid le plus évident du dépôt, donc
-- l'aimant à collision), et ce fichier est passé de **28 PASS à 0** sur un
-- `coaches_user_id_key` — puis toutes les assertions suivantes sur
-- « transaction is aborted ». Un test de référence qui devient rouge à cause
-- du VOISINAGE apprend à ignorer le rouge ; c'est la classe de défaut que le
-- fichier de fixtures documente déjà (« un test de référence doit échouer sur
-- le modèle, jamais sur les voisins ») et que celui-ci n'avait pas.
--
-- Les suppressions sont DANS la transaction qui finit par ROLLBACK : la base
-- reste exactement telle qu'on l'a trouvée, voisins compris.
-- ---------------------------------------------------------------------------
delete from public.coach_clients where student_user_id in (
  'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004');
delete from public.plan_versions where student_id in (
  'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004');
delete from public.coaches where user_id in (
  'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------------
-- Cast: 2 coaches, 2 students, 1 consented link each.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','coach.a@example.com','x', now(), now(), now(), '{}', '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','coach.b@example.com','x', now(), now(), now(), '{}', '{}'),
  ('cccccccc-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','student.a@example.com','x', now(), now(), now(), '{}', '{}'),
  ('dddddddd-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','student.b@example.com','x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.coaches (id, user_id, display_name, status) values
  ('a0000000-0000-0000-0000-0000000000aa','aaaaaaaa-0000-0000-0000-000000000001','Coach A','active'),
  ('b0000000-0000-0000-0000-0000000000bb','bbbbbbbb-0000-0000-0000-000000000002','Coach B','active');

-- Consent is a CHECK, not a convention: status='active' without
-- consent_granted_at cannot be inserted at all.
insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at) values
  ('a0000000-0000-0000-0000-0000000000aa','cccccccc-0000-0000-0000-000000000003','active', now(), now()),
  ('b0000000-0000-0000-0000-0000000000bb','dddddddd-0000-0000-0000-000000000004','active', now(), now());

-- One published plan + one fact per student, so there is something to leak.
insert into public.plan_versions (id, coach_id, student_id, version, status, title,
  timezone, anchor_week_start, duration_weeks, content_locale) values
  ('a1111111-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-0000000000aa',
   'cccccccc-0000-0000-0000-000000000003',1,'published','Plan A','America/New_York',current_date,12,'en-US'),
  ('b1111111-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-0000000000bb',
   'dddddddd-0000-0000-0000-000000000004',1,'published','Plan B','America/New_York',current_date,12,'en-US');

insert into public.protocol_events (user_id, occurred_at, local_date, source,
  student_note, media_path, content_locale) values
  ('cccccccc-0000-0000-0000-000000000003', now(), current_date, 'chat',
   'private student verbatim A','meal-photos/a/1.jpg','en-US'),
  ('dddddddd-0000-0000-0000-000000000004', now(), current_date, 'chat',
   'private student verbatim B','meal-photos/b/1.jpg','en-US');

-- Profiles exist already (handle_new_user); make the names deterministic.
update public.profiles set full_name = 'Student A'
  where id = 'cccccccc-0000-0000-0000-000000000003';
update public.profiles set full_name = 'Student B'
  where id = 'dddddddd-0000-0000-0000-000000000004';


-- ---------------------------------------------------------------------------
-- 1 + 2. The core assertion: coach A sees A's student, and only A's student.
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001');

  perform pg_temp.assert_eq('coach A: coached_student_ids cardinality',
    (select count(*)::bigint from unnest(public.coached_student_ids())), 1);

  perform pg_temp.assert_eq('coach A reads own student plan_versions',
    (select count(*) from public.plan_versions
      where student_id = 'cccccccc-0000-0000-0000-000000000003'), 1);

  -- THE test: coach B's student must be invisible BY RLS, not by a WHERE clause.
  perform pg_temp.assert_eq('coach A reads coach B student plan_versions',
    (select count(*) from public.plan_versions
      where student_id = 'dddddddd-0000-0000-0000-000000000004'), 0);

  perform pg_temp.assert_eq('coach A reads all visible plan_versions',
    (select count(*) from public.plan_versions), 1);

  perform pg_temp.assert_eq('coach A reads directory (own student only)',
    (select count(*) from public.coach_student_directory), 1);

  perform pg_temp.assert_eq('coach A reads events view (own student only)',
    (select count(*) from public.coach_student_events), 1);

  -- Tier A on the raw facts table is deliberately absent: the coach goes
  -- through the view. A row count of 0 here is the design, not a regression.
  perform pg_temp.assert_eq('coach A reads raw protocol_events',
    (select count(*) from public.protocol_events), 0);

  reset role;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. The student revokes. Access dies on the next query, with no cache.
-- ---------------------------------------------------------------------------
do $$
declare v_revoked integer;
begin
  perform pg_temp.become('cccccccc-0000-0000-0000-000000000003');
  select public.revoke_coach_access() into v_revoked;
  perform pg_temp.assert_eq('student A revokes one link', v_revoked::bigint, 1);

  -- The student keeps seeing the (paused) link: transparency is the
  -- counterpart of the coach's read access.
  perform pg_temp.assert_eq('student A still sees the paused link',
    (select count(*) from public.coach_clients where status = 'paused'), 1);
  reset role;

  perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001');
  perform pg_temp.assert_eq('coach A after revocation: plan_versions',
    (select count(*) from public.plan_versions), 0);
  perform pg_temp.assert_eq('coach A after revocation: directory',
    (select count(*) from public.coach_student_directory), 0);
  reset role;
end;
$$;

-- Re-consent for the remaining assertions (server-side path).
update public.coach_clients
   set status = 'active', consent_granted_at = now()
 where student_user_id = 'cccccccc-0000-0000-0000-000000000003';


-- ---------------------------------------------------------------------------
-- 4. An invitation is not a consent. status='invited' grants nothing.
-- ---------------------------------------------------------------------------
do $$
begin
  update public.coach_clients set status = 'invited', consent_granted_at = null
   where student_user_id = 'cccccccc-0000-0000-0000-000000000003';

  perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001');
  perform pg_temp.assert_eq('invited link grants no read',
    (select count(*) from public.plan_versions), 0);
  reset role;

  update public.coach_clients set status = 'active', consent_granted_at = now()
   where student_user_id = 'cccccccc-0000-0000-0000-000000000003';
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. A suspended coach reads nothing, consent or not.
-- ---------------------------------------------------------------------------
do $$
begin
  update public.coaches set status = 'suspended'
   where id = 'a0000000-0000-0000-0000-0000000000aa';

  perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001');
  perform pg_temp.assert_eq('suspended coach reads nothing',
    (select count(*) from public.plan_versions), 0);
  reset role;

  update public.coaches set status = 'active'
   where id = 'a0000000-0000-0000-0000-0000000000aa';
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. anon. No policy names `anon` anywhere in KEEL; the grants are revoked on
--    top of that. Both belts are checked.
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.become_anon();

  perform pg_temp.assert_eq('anon reads plan_versions',
    (select count(*) from public.plan_versions), 0);
  perform pg_temp.assert_eq('anon reads plan_commitments',
    (select count(*) from public.plan_commitments), 0);
  perform pg_temp.assert_eq('anon reads protocol_events',
    (select count(*) from public.protocol_events), 0);

  reset role;
end;
$$;

-- Grant-level check, separate from RLS: `anon` must hold no privilege at all
-- on the tenancy tables (Supabase default privileges grant `all` on creation).
do $$
begin
  perform pg_temp.assert_eq('anon privileges on tenancy tables',
    (select count(*) from information_schema.role_table_grants
      where grantee = 'anon'
        and table_schema = 'public'
        and table_name in ('coaches','coach_clients','coach_invitations',
                           'coach_access_events','coach_student_directory',
                           'coach_student_events')), 0);
end;
$$;

-- anon must not be able to call the gate either.
do $$
begin
  perform pg_temp.become_anon();
  begin
    perform public.coached_student_ids();
    raise exception 'FAIL anon can execute coached_student_ids()';
  exception
    when insufficient_privilege then
      raise notice 'PASS anon cannot execute coached_student_ids()';
  end;
  reset role;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. The coach is structurally read-only on student data. No write policy
--    exists, so every write is rejected — insert, update and delete alike.
-- ---------------------------------------------------------------------------
do $$
declare v_blocked int := 0;
begin
  perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001');

  begin
    insert into public.protocol_events (user_id, occurred_at, local_date, source, content_locale)
    values ('cccccccc-0000-0000-0000-000000000003', now(), current_date, 'coach_entry', 'en-US');
  exception when insufficient_privilege then v_blocked := v_blocked + 1;
  end;

  -- UPDATE / DELETE hit no policy: 0 rows touched, silently and correctly.
  update public.plan_commitments set title = 'coach edit' where true;
  perform pg_temp.assert_eq('coach update on plan_commitments',
    (select count(*) from public.plan_commitments where title = 'coach edit'), 0);

  delete from public.plan_versions where true;

  reset role;

  perform pg_temp.assert_eq('coach insert into protocol_events was blocked',
    v_blocked::bigint, 1);
  -- Both plan_versions survived the coach's DELETE. Scoped to THIS test's two
  -- rows: an unscoped count would also tally whatever else the local database
  -- holds (a real end-to-end student, another lot's seed) and would turn a
  -- neighbour's row into a red on a tenancy assertion it has nothing to do
  -- with. What is asserted is "the coach's DELETE removed none of ours".
  perform pg_temp.assert_eq('plan_versions survived coach delete',
    (select count(*) from public.plan_versions
      where id in ('a1111111-0000-0000-0000-00000000000a',
                   'b1111111-0000-0000-0000-00000000000b')), 2);
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. Tier B views carry no student verbatim. Asserted on the CATALOG, not on
--    the data: a future ALTER that adds student_note back fails this test even
--    if every row happens to be null that day.
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.assert_eq('coach_student_events exposes no verbatim column',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'coach_student_events'
        and column_name in ('student_note','media_path')), 0);

  perform pg_temp.assert_eq('coach_student_directory exposes no PII column',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'coach_student_directory'
        and column_name in ('email','phone_number','birth_date','gender',
                            'access_tier','stripe_customer_id')), 0);

  -- The views must not run as the caller, or they would inherit the caller's
  -- (absent) policies on the base tables and return nothing.
  perform pg_temp.assert_eq('Tier B views are security definer',
    (select count(*) from pg_class
      where relname in ('coach_student_directory','coach_student_events')
        and relkind = 'v'
        and coalesce(reloptions::text, '') not like '%security_invoker=on%'), 2);
end;
$$;


-- ---------------------------------------------------------------------------
-- 9. Structural invariants of the link itself.
-- ---------------------------------------------------------------------------
do $$
declare v_blocked int := 0;
begin
  -- active without consent: impossible.
  begin
    insert into public.coach_clients (coach_id, student_user_id, status)
    values ('b0000000-0000-0000-0000-0000000000bb',
            'cccccccc-0000-0000-0000-000000000003','active');
  exception when check_violation then v_blocked := v_blocked + 1;
  end;

  -- two live coaches for one student: impossible.
  begin
    insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at)
    values ('b0000000-0000-0000-0000-0000000000bb',
            'cccccccc-0000-0000-0000-000000000003','active', now());
  exception when unique_violation then v_blocked := v_blocked + 1;
  end;

  -- a non-lowercased email: rejected at the write (citext stand-in).
  begin
    insert into public.coach_invitations (coach_id, email, invite_token_hash, expires_at)
    values ('a0000000-0000-0000-0000-0000000000aa','Mixed.Case@Example.com',
            'deadbeef', now() + interval '7 days');
  exception when check_violation then v_blocked := v_blocked + 1;
  end;

  perform pg_temp.assert_eq('link invariants rejected 3 bad writes', v_blocked::bigint, 3);
end;
$$;


-- ---------------------------------------------------------------------------
-- 10. Revoking consent must not lock the student in.
--
-- revoke_coach_access() writes status='paused'. While the partial unique index
-- counted 'paused' as a live link, the student who revoked could never be
-- picked up by another coach: the new link hit one_live_coach_per_student and
-- the revocation quietly became a lock-in on the coach they had just fired.
-- ---------------------------------------------------------------------------
do $$
declare v_paused int;
begin
  perform pg_temp.become('cccccccc-0000-0000-0000-000000000003');
  perform public.revoke_coach_access();
  reset role;

  select count(*) into v_paused from public.coach_clients
   where student_user_id = 'cccccccc-0000-0000-0000-000000000003'
     and status = 'paused';
  perform pg_temp.assert_eq('revocation pauses the link', v_paused::bigint, 1);

  -- Coach B may now take the student on. This INSERT is the assertion: a
  -- unique_violation here is the lock-in bug, so it is deliberately not caught.
  insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at)
  values ('b0000000-0000-0000-0000-0000000000bb',
          'cccccccc-0000-0000-0000-000000000003','active', now(), now());

  perform pg_temp.assert_eq('student can switch coach after revoking',
    (select count(*) from public.coach_clients
      where student_user_id = 'cccccccc-0000-0000-0000-000000000003'
        and status = 'active'), 1);

  -- The old link survives as history, not as a seat.
  perform pg_temp.assert_eq('the revoked link survives as history',
    (select count(*) from public.coach_clients
      where student_user_id = 'cccccccc-0000-0000-0000-000000000003'
        and status = 'paused'), 1);
end;
$$;


rollback;
