-- ============================================================================
-- KEEL — INVITATION + COACH READ SURFACE: negative test (BUILD_PLAN W6.5/W6.6)
--
-- MANUAL. Run by hand against the LOCAL database, after `npx supabase db reset`.
-- Same discipline as supabase/functions/_shared/keel/tenancy_rls_test.sql: the
-- things under test are Postgres functions, grants and policies, so the test is
-- a psql script. A client library that could not `set local role` would be
-- testing its own service key, not the boundary.
--
--   docker cp supabase/functions/coach-invite-student-v1/invitation_rls_test.sql \
--     supabase_db_Sophia_2:/tmp/invitation_rls_test.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -f /tmp/invitation_rls_test.sql
--
-- One transaction, ROLLBACK at the end: the database is left exactly as found.
-- Every count is SCOPED to the ids created here — a global count(*) would turn
-- red the day an unrelated e2e student exists in the same database, which is
-- the failure mode documented in EXECUTION_LOG for the W1 reference suites.
--
-- WHAT IS ASSERTED
--   1. the SQL hash equals the TypeScript hash (shared vector)
--   2. preview: invalid / expired / revoked / accepted tokens leak NOTHING
--   3. preview: the valid branch returns exactly {valid, coach_first_name,
--      email} — first name only, no id of any kind
--   4. grants: anon may preview, anon may NOT accept or write an audit line
--   5. accept: creates ONE active, consented link + flips the invitation
--   6. accept: an expired token is refused AND burned to status='expired'
--   7. accept: a student already live with another coach is REFUSED
--   8. signup path: the token in raw_user_meta_data creates the link...
--   9. ...and a BROKEN invitation NEVER breaks a signup (the referral rule)
--  10. log_coach_student_access: derives coach_id, refuses foreign students,
--      refuses unknown surface tokens, refuses non-coaches
--  11. the coach's read surface carries no student verbatim
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

create or replace function pg_temp.assert_text(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, coalesce(got,'<null>'), coalesce(want,'<null>');
  end if;
  raise notice 'PASS % (%)', label, coalesce(got,'<null>');
end;
$$;

create or replace function pg_temp.become(u uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end;
$$;


-- ---------------------------------------------------------------------------
-- Cast. Coach A (Marie Dupont), coach B, student S already coached by B,
-- student T unattached, plus a would-be signup U that does not exist yet.
--
-- coalesce(...,'') on the token columns: a hand-inserted auth.users row with
-- NULL there breaks GoTrue (documented pitfall).
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('11111111-6300-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w63.coach.a@example.com','x', now(), now(), now(),
   '{}', '{"full_name":"Marie Dupont"}', '', '', '', ''),
  ('22222222-6300-0000-0000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w63.coach.b@example.com','x', now(), now(), now(),
   '{}', '{"full_name":"Bruno Bernard"}', '', '', '', ''),
  ('33333333-6300-0000-0000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w63.student.s@example.com','x', now(), now(), now(),
   '{}', '{"full_name":"Sam Student"}', '', '', '', ''),
  ('44444444-6300-0000-0000-000000000004','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','w63.student.t@example.com','x', now(), now(), now(),
   '{}', '{"full_name":"Tess Student"}', '', '', '', '');

insert into public.coaches (id, user_id, display_name, status) values
  ('a6300000-0000-0000-0000-0000000000aa','11111111-6300-0000-0000-000000000001','Marie Dupont','active'),
  ('b6300000-0000-0000-0000-0000000000bb','22222222-6300-0000-0000-000000000002','Bruno Bernard','active');

-- Student S is already the live, consented client of coach B.
insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at)
values ('b6300000-0000-0000-0000-0000000000bb','33333333-6300-0000-0000-000000000003',
        'active', now(), now());

-- Four invitations from coach A, all with a KNOWN clear token.
insert into public.coach_invitations (coach_id, email, invite_token_hash, expires_at, status) values
  ('a6300000-0000-0000-0000-0000000000aa','w63.student.t@example.com',
   public.coach_invite_token_hash('TOKEN_VALID_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
   now() + interval '14 days', 'pending'),
  ('a6300000-0000-0000-0000-0000000000aa','w63.expired@example.com',
   public.coach_invite_token_hash('TOKEN_EXPIRED_bbbbbbbbbbbbbbbbbbbbbbbbbb'),
   now() - interval '1 day', 'pending'),
  ('a6300000-0000-0000-0000-0000000000aa','w63.revoked@example.com',
   public.coach_invite_token_hash('TOKEN_REVOKED_cccccccccccccccccccccccccc'),
   now() + interval '14 days', 'revoked'),
  ('a6300000-0000-0000-0000-0000000000aa','w63.student.s@example.com',
   public.coach_invite_token_hash('TOKEN_FOR_S_dddddddddddddddddddddddddddd'),
   now() + interval '14 days', 'pending'),
  -- Signup-path tokens.
  ('a6300000-0000-0000-0000-0000000000aa','w63.signup@example.com',
   public.coach_invite_token_hash('TOKEN_SIGNUP_eeeeeeeeeeeeeeeeeeeeeeeeeee'),
   now() + interval '14 days', 'pending');


-- ---------------------------------------------------------------------------
-- 1. The two hashes are one hash.
--
-- If this line ever goes red, every invitation minted by the edge function is
-- unopenable and the only symptom in production is "invalid_token" on a link
-- the coach watched being sent. invite_token_test.ts pins the same vector on
-- the TypeScript side.
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.assert_text('sha256 vector matches invite_token_test.ts',
    public.coach_invite_token_hash('hello'),
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
end;
$$;


-- ---------------------------------------------------------------------------
-- 2 & 3. preview_coach_invitation — the only anon-callable KEEL function.
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  perform pg_temp.become_anon();

  -- A garbage token: refused on shape, before any hashing.
  r := public.preview_coach_invitation('nope');
  perform pg_temp.assert_text('preview rejects a malformed token', r->>'reason', 'invalid_token');
  perform pg_temp.assert_eq('malformed preview returns 2 keys only',
    (select count(*) from jsonb_object_keys(r))::bigint, 2);

  -- A well-shaped token that matches nothing.
  r := public.preview_coach_invitation('TOKEN_UNKNOWN_zzzzzzzzzzzzzzzzzzzzzzzzzz');
  perform pg_temp.assert_text('preview rejects an unknown token', r->>'reason', 'invalid_token');
  perform pg_temp.assert_text('an unknown token yields no email', r->>'email', null);

  -- Expired: named as expired, and STILL no email.
  r := public.preview_coach_invitation('TOKEN_EXPIRED_bbbbbbbbbbbbbbbbbbbbbbbbbb');
  perform pg_temp.assert_text('preview names an expired invitation', r->>'reason', 'expired');
  perform pg_temp.assert_text('an expired token yields no email', r->>'email', null);
  perform pg_temp.assert_text('an expired token yields no coach name', r->>'coach_first_name', null);

  -- Revoked.
  r := public.preview_coach_invitation('TOKEN_REVOKED_cccccccccccccccccccccccccc');
  perform pg_temp.assert_text('preview names a revoked invitation', r->>'reason', 'revoked');
  perform pg_temp.assert_text('a revoked token yields no email', r->>'email', null);

  -- Valid: exactly three keys, first name only, no id anywhere.
  r := public.preview_coach_invitation('TOKEN_VALID_aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  perform pg_temp.assert_text('preview accepts a live token', r->>'valid', 'true');
  perform pg_temp.assert_text('preview returns the coach FIRST name only',
    r->>'coach_first_name', 'Marie');
  perform pg_temp.assert_text('preview pre-fills the invited email',
    r->>'email', 'w63.student.t@example.com');
  perform pg_temp.assert_text('the valid preview key set is exactly {coach_first_name,email,valid}',
    (select array_agg(k order by k)::text from jsonb_object_keys(r) k),
    '{coach_first_name,email,valid}');

  reset role;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Grants. anon may look; anon may not act.
-- ---------------------------------------------------------------------------
do $$
declare v_blocked int := 0;
begin
  perform pg_temp.become_anon();

  begin
    perform public.accept_coach_invitation('TOKEN_VALID_aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  exception when insufficient_privilege then v_blocked := v_blocked + 1;
  end;

  begin
    perform public.accept_coach_invitation_for_user(
      '44444444-6300-0000-0000-000000000004','TOKEN_VALID_aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  exception when insufficient_privilege then v_blocked := v_blocked + 1;
  end;

  begin
    perform public.log_coach_student_access('33333333-6300-0000-0000-000000000003','student_dashboard');
  exception when insufficient_privilege then v_blocked := v_blocked + 1;
  end;

  begin
    perform public.coach_invite_token_hash('x');
  exception when insufficient_privilege then v_blocked := v_blocked + 1;
  end;

  reset role;
  perform pg_temp.assert_eq('anon is refused on all 4 non-preview functions', v_blocked::bigint, 4);
end;
$$;

-- An authenticated non-coach may not write an audit line either.
do $$
declare v_blocked int := 0;
begin
  perform pg_temp.become('44444444-6300-0000-0000-000000000004');
  begin
    perform public.log_coach_student_access('33333333-6300-0000-0000-000000000003','student_dashboard');
  exception when others then v_blocked := v_blocked + 1;
  end;
  reset role;
  perform pg_temp.assert_eq('a student cannot forge a coach access line', v_blocked::bigint, 1);
  perform pg_temp.assert_eq('...and nothing was written',
    (select count(*) from public.coach_access_events
      where student_user_id = '33333333-6300-0000-0000-000000000003')::bigint, 0);
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. accept_coach_invitation — the signed-in path, student T.
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  perform pg_temp.become('44444444-6300-0000-0000-000000000004');
  r := public.accept_coach_invitation('TOKEN_VALID_aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  reset role;

  perform pg_temp.assert_text('T accepts the invitation', r->>'accepted', 'true');
  perform pg_temp.assert_text('the answer names the coach', r->>'coach_first_name', 'Marie');

  perform pg_temp.assert_eq('exactly one live link was created',
    (select count(*) from public.coach_clients
      where student_user_id = '44444444-6300-0000-0000-000000000004'
        and coach_id = 'a6300000-0000-0000-0000-0000000000aa'
        and status = 'active'
        and consent_granted_at is not null)::bigint, 1);

  perform pg_temp.assert_eq('the invitation is spent',
    (select count(*) from public.coach_invitations
      where email = 'w63.student.t@example.com' and status = 'accepted'
        and accepted_at is not null)::bigint, 1);

  perform pg_temp.assert_text('the accepting user becomes a student',
    (select keel_role from public.profiles where id = '44444444-6300-0000-0000-000000000004'),
    'student');

  -- The coach can now read them: coached_student_ids() is the single gate.
  perform pg_temp.become('11111111-6300-0000-0000-000000000001');
  perform pg_temp.assert_eq('the new student is visible to the coach directory',
    (select count(*) from public.coach_student_directory
      where id = '44444444-6300-0000-0000-000000000004')::bigint, 1);
  reset role;
end;
$$;

-- Replaying the same token changes nothing.
do $$
declare r jsonb;
begin
  perform pg_temp.become('44444444-6300-0000-0000-000000000004');
  r := public.accept_coach_invitation('TOKEN_VALID_aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  reset role;
  perform pg_temp.assert_text('a spent token is refused', r->>'reason', 'already_accepted');
  perform pg_temp.assert_eq('the replay created no second link',
    (select count(*) from public.coach_clients
      where student_user_id = '44444444-6300-0000-0000-000000000004')::bigint, 1);
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. An expired token is refused AND burned, so the coach's list stops lying.
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  perform pg_temp.become('44444444-6300-0000-0000-000000000004');
  r := public.accept_coach_invitation('TOKEN_EXPIRED_bbbbbbbbbbbbbbbbbbbbbbbbbb');
  reset role;
  perform pg_temp.assert_text('an expired token is refused', r->>'reason', 'expired');
  perform pg_temp.assert_eq('the expired invitation was burned to status=expired',
    (select count(*) from public.coach_invitations
      where email = 'w63.expired@example.com' and status = 'expired')::bigint, 1);
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. THE ONE THAT MATTERS FOR TENANCY. Student S is live with coach B.
--    Coach A's invitation cannot pull them across.
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  perform pg_temp.become('33333333-6300-0000-0000-000000000003');
  r := public.accept_coach_invitation('TOKEN_FOR_S_dddddddddddddddddddddddddddd');
  reset role;

  perform pg_temp.assert_text('a student of another live coach is refused',
    r->>'reason', 'already_coached');
  perform pg_temp.assert_eq('coach A got no link to S',
    (select count(*) from public.coach_clients
      where student_user_id = '33333333-6300-0000-0000-000000000003'
        and coach_id = 'a6300000-0000-0000-0000-0000000000aa')::bigint, 0);
  perform pg_temp.assert_eq('S is still coach B''s client, untouched',
    (select count(*) from public.coach_clients
      where student_user_id = '33333333-6300-0000-0000-000000000003'
        and coach_id = 'b6300000-0000-0000-0000-0000000000bb'
        and status = 'active')::bigint, 1);
  perform pg_temp.assert_eq('the refused invitation stays pending, not spent',
    (select count(*) from public.coach_invitations
      where email = 'w63.student.s@example.com' and status = 'pending')::bigint, 1);

  -- And coach A still reads nothing of S.
  perform pg_temp.become('11111111-6300-0000-0000-000000000001');
  perform pg_temp.assert_eq('coach A reads nothing of coach B''s student',
    (select count(*) from public.coach_student_directory
      where id = '33333333-6300-0000-0000-000000000003')::bigint, 0);
  reset role;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. The signup path. The token travels in raw_user_meta_data and
--    handle_new_user() applies it — same shape as referral attribution.
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '55555555-6300-0000-0000-000000000005','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','w63.signup@example.com','x', now(), now(), now(), '{}',
  '{"full_name":"Uma Signup","locale":"en-US","coach_invite_token":"TOKEN_SIGNUP_eeeeeeeeeeeeeeeeeeeeeeeeeee"}',
  '', '', '', ''
);

do $$
begin
  perform pg_temp.assert_eq('signup attached the student to the inviting coach',
    (select count(*) from public.coach_clients
      where student_user_id = '55555555-6300-0000-0000-000000000005'
        and coach_id = 'a6300000-0000-0000-0000-0000000000aa'
        and status = 'active'
        and consent_granted_at is not null)::bigint, 1);
  perform pg_temp.assert_text('signup set keel_role',
    (select keel_role from public.profiles where id = '55555555-6300-0000-0000-000000000005'),
    'student');
end;
$$;


-- ---------------------------------------------------------------------------
-- 9. A BROKEN INVITATION MUST NEVER BREAK A SIGNUP.
--
-- This is the whole reason the call sits in a begin/exception inside
-- handle_new_user (referral pattern, 20260708160000). The insert below carries
-- a token that matches nothing; if it raises, the account is never created and
-- a person cannot join the product because of an invitation bug.
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '66666666-6300-0000-0000-000000000006','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','w63.badtoken@example.com','x', now(), now(), now(), '{}',
  '{"full_name":"Vic Badtoken","coach_invite_token":"@@@ not even a token @@@"}',
  '', '', '', ''
);

do $$
begin
  perform pg_temp.assert_eq('a broken invitation still produced an account',
    (select count(*) from public.profiles
      where id = '66666666-6300-0000-0000-000000000006')::bigint, 1);
  perform pg_temp.assert_eq('...and attached it to nobody',
    (select count(*) from public.coach_clients
      where student_user_id = '66666666-6300-0000-0000-000000000006')::bigint, 0);
  perform pg_temp.assert_text('...and left keel_role alone',
    (select keel_role from public.profiles where id = '66666666-6300-0000-0000-000000000006'),
    null);
end;
$$;


-- ---------------------------------------------------------------------------
-- 10. log_coach_student_access — the audit line the coach cannot forge.
-- ---------------------------------------------------------------------------
do $$
declare v_blocked int := 0;
begin
  perform pg_temp.become('11111111-6300-0000-0000-000000000001');

  -- The happy path: coach A opening student T's space.
  perform public.log_coach_student_access('44444444-6300-0000-0000-000000000004','student_dashboard');

  -- A student they do not coach.
  begin
    perform public.log_coach_student_access('33333333-6300-0000-0000-000000000003','student_dashboard');
  exception when others then v_blocked := v_blocked + 1;
  end;

  -- An off-vocabulary surface token (R1/R7).
  begin
    perform public.log_coach_student_access('44444444-6300-0000-0000-000000000004','tableau_de_bord');
  exception when others then v_blocked := v_blocked + 1;
  end;

  reset role;
  perform pg_temp.assert_eq('foreign student + unknown surface both raise', v_blocked::bigint, 2);

  perform pg_temp.assert_eq('exactly one audit line, with the derived coach_id',
    (select count(*) from public.coach_access_events
      where student_user_id = '44444444-6300-0000-0000-000000000004'
        and coach_id = 'a6300000-0000-0000-0000-0000000000aa'
        and surface = 'student_dashboard')::bigint, 1);

  -- The student reads every access to their own space (transparency is the
  -- counterpart of the coach's read).
  perform pg_temp.become('44444444-6300-0000-0000-000000000004');
  perform pg_temp.assert_eq('the student sees the coach opening their space',
    (select count(*) from public.coach_access_events
      where student_user_id = '44444444-6300-0000-0000-000000000004')::bigint, 1);
  reset role;
end;
$$;


-- ---------------------------------------------------------------------------
-- 11. The coach's read surface carries no verbatim.
--
-- A protocol_event with a student note and a photo path. The coach must see
-- that a fact exists, and nothing the student wrote or photographed.
-- ---------------------------------------------------------------------------
insert into public.protocol_events
  (user_id, occurred_at, local_date, slot_key, source, quantity, unit,
   student_note, content_locale, media_path, evidence_weight)
values
  ('44444444-6300-0000-0000-000000000004', now(), current_date, 'breakfast',
   'text', 1, 'serving',
   'I binged last night and I feel disgusting', 'en-US',
   'meal-photos/44444444/secret.jpg', 0.8);

do $$
declare v_cols text;
begin
  select array_agg(column_name order by column_name)::text into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'coach_student_events';

  if v_cols like '%student_note%' then
    raise exception 'FAIL coach_student_events exposes student_note';
  end if;
  if v_cols like '%media_path%' then
    raise exception 'FAIL coach_student_events exposes media_path';
  end if;
  if v_cols like '%source_message_id%' then
    raise exception 'FAIL coach_student_events exposes source_message_id';
  end if;
  raise notice 'PASS coach_student_events hides student_note / media_path / source_message_id';

  perform pg_temp.become('11111111-6300-0000-0000-000000000001');

  perform pg_temp.assert_eq('the coach sees the fact',
    (select count(*) from public.coach_student_events
      where user_id = '44444444-6300-0000-0000-000000000004')::bigint, 1);

  perform pg_temp.assert_text('...knows a photo exists, without its path',
    (select has_media::text from public.coach_student_events
      where user_id = '44444444-6300-0000-0000-000000000004'), 'true');

  -- protocol_events itself has no Tier A policy for the coach: the raw table,
  -- verbatim included, is unreachable even by a hand-written query.
  perform pg_temp.assert_eq('the raw facts table stays closed to the coach',
    (select count(*) from public.protocol_events
      where user_id = '44444444-6300-0000-0000-000000000004')::bigint, 0);

  reset role;
end;
$$;


rollback;
