-- ============================================================================
-- KEEL W10 — inherited entitlement + seat ledger, tested where they run.
--
-- MANUAL. Run against the LOCAL database, after `npx supabase db reset --local`:
--
--   docker cp supabase/tests/keel/billing_seats_test.sql \
--     supabase_db_Sophia_2:/tmp/billing.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/billing.sql
--
-- WHY HERE AND NOT IN DENO
-- Everything under test is a trigger, a CHECK or a SECURITY DEFINER function.
-- The B6 bug was NOT "the TypeScript computed the wrong tier" — it was "nothing
-- ever wrote the tier". A TypeScript test of the same logic would have been
-- green on the day of the bug, which is exactly what happened.
--
-- Everything runs inside one transaction ending with ROLLBACK.
--
-- WHAT IS ASSERTED
--   1. a student with no coach and no trial          -> 'none'   (unchanged)
--   2. link goes 'active' under a trialing coach     -> 'student' (THE B6 FIX)
--   3. the tier is written by the TRIGGER, not by a later read
--   4. coach trial elapses, no subscription          -> back to 'none'
--   5. coach subscribes                              -> 'student' again
--   6. coach suspended                               -> 'none' (roster-wide)
--   7. student revokes consent (link paused)         -> 'none'
--   8. own live subscription BEATS the inherited seat
--   9. the inherited seat BEATS an elapsed personal trial
--  10. a comped seat (seat_state='free') still grants access
--  11. subscriptions.tier='student' is REFUSED at the write (R7)
--  12. profiles.access_tier='coach' is ACCEPTED (vocabulary moved)
--  13. interaction counter: assistant messages do NOT count
--  14. interaction counter: half-open month bounds, no double count
--  15. seat ledger: 3 interactions = active seat, 2 = linked but not billed
--  16. seat ledger: a 'paused' link is listed but never an active seat
--  17. trial cap: the 4th live seat RAISES
--  18. trial cap: disappears the moment the coach pays
--  19. coach_billing_periods: active_seat_count > linked_seat_count is refused
--  20. coach_billing_periods: one row per (coach, month)
-- ============================================================================

begin;

create or replace function pg_temp.assert_txt(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, coalesce(got,'<null>'), coalesce(want,'<null>');
  end if;
  raise notice 'PASS % (%)', label, coalesce(got,'<null>');
end;
$$;

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, got, want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

create or replace function pg_temp.assert_bool(label text, got boolean, want boolean)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, coalesce(got::text,'<null>'), want::text;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

create or replace function pg_temp.assert_raises(label text, stmt text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS % (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % : statement succeeded, expected an exception', label;
end;
$$;

create or replace function pg_temp.tier_of(p uuid)
returns text language sql as $$
  select access_tier from public.profiles where id = p;
$$;


-- ---------------------------------------------------------------------------
-- Fixtures. auth.users rows are inserted directly (service context); the
-- profiles rows come from the product's own handle_new_user trigger if it
-- exists, otherwise we insert them.
-- ---------------------------------------------------------------------------
do $$
declare
  v_coach_user uuid := gen_random_uuid();
  v_s1 uuid := gen_random_uuid();
  v_s2 uuid := gen_random_uuid();
  v_s3 uuid := gen_random_uuid();
  v_s4 uuid := gen_random_uuid();
  v_coach uuid;
  v_link1 uuid;
  v_n integer;
  v_txt text;
  v_bool boolean;
  v_month date := date_trunc('month', (now() at time zone 'utc')::date)::date;
begin
  -- ids are stashed in a temp table so the later statements can find them.
  create temporary table pg_temp_ids(k text primary key, v uuid) on commit drop;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now()
  from (values
    (v_coach_user, 'w10coach@test.dev'),
    (v_s1, 'w10s1@test.dev'),
    (v_s2, 'w10s2@test.dev'),
    (v_s3, 'w10s3@test.dev'),
    (v_s4, 'w10s4@test.dev')
  ) as u(id, email);

  insert into public.profiles (id) values (v_coach_user), (v_s1), (v_s2), (v_s3), (v_s4)
  on conflict (id) do nothing;

  -- Every student starts with no trial at all: 'none' is the honest baseline.
  update public.profiles set trial_end = null, access_tier = 'none'
   where id in (v_coach_user, v_s1, v_s2, v_s3, v_s4);

  insert into pg_temp_ids values
    ('coach_user', v_coach_user), ('s1', v_s1), ('s2', v_s2), ('s3', v_s3), ('s4', v_s4);

  -- 1. baseline
  perform pg_temp.assert_txt('01 no coach, no trial -> none', pg_temp.tier_of(v_s1), 'none');

  -- A coach inside their default 14-day trial.
  insert into public.coaches (user_id, display_name, status)
  values (v_coach_user, 'W10 Coach', 'active')
  returning id into v_coach;
  insert into pg_temp_ids values ('coach', v_coach);

  perform pg_temp.assert_bool('00 fresh coach is solvent (trial)',
    public.keel_coach_is_solvent(v_coach), true);

  -- 2. THE B6 FIX: the link alone grants the entitlement.
  insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at)
  values (v_coach, v_s1, 'active', now(), now())
  returning id into v_link1;
  insert into pg_temp_ids values ('link1', v_link1);

  perform pg_temp.assert_txt('02 active link + trialing coach -> student',
    pg_temp.tier_of(v_s1), 'student');

  -- 3. written by the trigger: nothing called recompute_* between 2 and 3.
  perform pg_temp.assert_eq('03 trigger wrote it (not a read-time derivation)',
    (select count(*) from public.profiles where id = v_s1 and access_tier = 'student'), 1);

  -- 4. the coach's trial elapses.
  update public.coaches set trial_ends_at = now() - interval '1 day' where id = v_coach;
  perform pg_temp.assert_txt('04 coach trial elapsed -> none', pg_temp.tier_of(v_s1), 'none');

  -- 5. the coach pays.
  insert into public.subscriptions (user_id, stripe_subscription_id, stripe_price_id, tier,
                                    status, current_period_end, updated_at)
  values (v_coach_user, 'sub_w10', 'price_w10_coach_monthly', 'coach', 'active',
          now() + interval '30 days', now());
  perform pg_temp.assert_txt('05 coach subscribes -> student again',
    pg_temp.tier_of(v_s1), 'student');
  perform pg_temp.assert_txt('05b the coach themselves -> coach',
    pg_temp.tier_of(v_coach_user), 'coach');

  -- 6. suspension is roster-wide.
  update public.coaches set status = 'suspended' where id = v_coach;
  perform pg_temp.assert_txt('06 coach suspended -> none', pg_temp.tier_of(v_s1), 'none');
  update public.coaches set status = 'active' where id = v_coach;
  perform pg_temp.assert_txt('06b un-suspended -> student', pg_temp.tier_of(v_s1), 'student');

  -- 7. the student pulls consent (revoke_coach_access writes status='paused').
  update public.coach_clients set status = 'paused', consent_granted_at = null where id = v_link1;
  perform pg_temp.assert_txt('07 consent revoked -> none', pg_temp.tier_of(v_s1), 'none');
  update public.coach_clients set status = 'active', consent_granted_at = now() where id = v_link1;

  -- 8. own subscription beats the seat.
  insert into public.subscriptions (user_id, stripe_subscription_id, stripe_price_id, tier,
                                    status, current_period_end, updated_at)
  values (v_s1, 'sub_w10_own', 'price_legacy', 'architecte', 'active',
          now() + interval '30 days', now());
  perform pg_temp.assert_txt('08 own live subscription beats the seat',
    pg_temp.tier_of(v_s1), 'architecte');
  delete from public.subscriptions where user_id = v_s1;
  perform pg_temp.assert_txt('08b subscription gone -> back to student',
    pg_temp.tier_of(v_s1), 'student');

  -- 9. the seat beats an elapsed personal trial (and a running one).
  update public.profiles set trial_end = now() - interval '1 day' where id = v_s1;
  perform public.recompute_profile_access_tier(v_s1);
  perform pg_temp.assert_txt('09 elapsed personal trial -> still student',
    pg_temp.tier_of(v_s1), 'student');
  update public.profiles set trial_end = now() + interval '5 days' where id = v_s1;
  perform public.recompute_profile_access_tier(v_s1);
  perform pg_temp.assert_txt('09b running personal trial -> seat still wins',
    pg_temp.tier_of(v_s1), 'student');
  update public.profiles set trial_end = null where id = v_s1;
  perform public.recompute_profile_access_tier(v_s1);

  -- 10. a comped seat grants access exactly like a billed one.
  update public.coach_clients set seat_state = 'free' where id = v_link1;
  perform pg_temp.assert_txt('10 comped seat still grants access',
    pg_temp.tier_of(v_s1), 'student');
  update public.coach_clients set seat_state = 'billed' where id = v_link1;
end $$;


-- 11 / 12. The vocabulary itself.
select pg_temp.assert_raises(
  '11 subscriptions.tier=student is refused',
  $sql$update public.subscriptions set tier = 'student'
        where user_id = (select v from pg_temp_ids where k = 'coach_user')$sql$);

do $$
declare v_c uuid := (select v from pg_temp_ids where k = 'coach_user');
begin
  update public.profiles set access_tier = 'coach' where id = v_c;
  perform pg_temp.assert_txt('12 access_tier=coach accepted', pg_temp.tier_of(v_c), 'coach');
end $$;


-- 13 / 14. The interaction counter.
do $$
declare
  v_s1 uuid := (select v from pg_temp_ids where k = 's1');
  v_from timestamptz := date_trunc('month', now());
  v_to timestamptz := date_trunc('month', now()) + interval '1 month';
begin
  insert into public.chat_messages (user_id, role, content, created_at)
  values (v_s1, 'user', 'done', v_from + interval '2 days'),
         (v_s1, 'assistant', 'noted', v_from + interval '2 days'),
         (v_s1, 'assistant', 'noted', v_from + interval '3 days');

  perform pg_temp.assert_eq('13 assistant messages do not count',
    public.keel_student_interaction_count(v_s1, v_from, v_to), 1);

  -- The instant that belongs to NEXT month must not be counted in this one.
  insert into public.chat_messages (user_id, role, content, created_at)
  values (v_s1, 'user', 'next month', v_to);
  perform pg_temp.assert_eq('14 half-open bounds: [from, to)',
    public.keel_student_interaction_count(v_s1, v_from, v_to), 1);
  perform pg_temp.assert_eq('14b that message lands in the NEXT month',
    public.keel_student_interaction_count(v_s1, v_to, v_to + interval '1 month'), 1);
end $$;


-- 15 / 16. The seat ledger.
do $$
declare
  v_coach uuid := (select v from pg_temp_ids where k = 'coach');
  v_s1 uuid := (select v from pg_temp_ids where k = 's1');
  v_s2 uuid := (select v from pg_temp_ids where k = 's2');
  v_from timestamptz := date_trunc('month', now());
  v_month date := date_trunc('month', (now() at time zone 'utc')::date)::date;
begin
  -- s1 crosses the threshold (1 chat message already + 2 protocol events).
  insert into public.protocol_events (user_id, occurred_at, local_date, source, content_locale)
  values (v_s1, v_from + interval '4 days', (v_from + interval '4 days')::date, 'quick_tap', 'en-US'),
         (v_s1, v_from + interval '5 days', (v_from + interval '5 days')::date, 'quick_tap', 'en-US');

  -- s2 is linked and active but only interacts twice: linked, not billed.
  insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at)
  values (v_coach, v_s2, 'active', now(), now());
  insert into public.protocol_events (user_id, occurred_at, local_date, source, content_locale)
  values (v_s2, v_from + interval '4 days', (v_from + interval '4 days')::date, 'quick_tap', 'en-US'),
         (v_s2, v_from + interval '5 days', (v_from + interval '5 days')::date, 'quick_tap', 'en-US');

  perform pg_temp.assert_eq('15 s1 has 3 interactions',
    (select interaction_count from public.keel_coach_seat_ledger(v_coach, v_month)
      where student_user_id = v_s1), 3);
  perform pg_temp.assert_bool('15b s1 is a billable seat',
    (select is_active_seat from public.keel_coach_seat_ledger(v_coach, v_month)
      where student_user_id = v_s1), true);
  perform pg_temp.assert_bool('15c s2 (2 interactions) is NOT billable',
    (select is_active_seat from public.keel_coach_seat_ledger(v_coach, v_month)
      where student_user_id = v_s2), false);
  perform pg_temp.assert_eq('15d billable seats this month',
    (select count(*) from public.keel_coach_seat_ledger(v_coach, v_month) where is_active_seat), 1);

  -- 16. a paused link is visible but never billable.
  update public.coach_clients set status = 'paused', consent_granted_at = null
   where coach_id = v_coach and student_user_id = v_s2;
  perform pg_temp.assert_eq('16 paused link still listed',
    (select count(*) from public.keel_coach_seat_ledger(v_coach, v_month)
      where student_user_id = v_s2), 1);
  perform pg_temp.assert_bool('16b paused link is not a seat',
    (select is_active_seat from public.keel_coach_seat_ledger(v_coach, v_month)
      where student_user_id = v_s2), false);
end $$;


-- 17 / 18. The trial cap.
do $$
declare
  v_coach uuid := (select v from pg_temp_ids where k = 'coach');
  v_coach_user uuid := (select v from pg_temp_ids where k = 'coach_user');
  v_s3 uuid := (select v from pg_temp_ids where k = 's3');
  v_s4 uuid := (select v from pg_temp_ids where k = 's4');
begin
  -- Put the coach back on a live trial with no subscription.
  delete from public.subscriptions where user_id = v_coach_user;
  update public.coaches set trial_ends_at = now() + interval '7 days' where id = v_coach;
  -- Live links right now: s1 (active) + s2 (paused, not live). Re-activate s2
  -- so the roster holds 2 live links, then add a 3rd, then try a 4th.
  update public.coach_clients set status = 'active', consent_granted_at = now()
   where coach_id = v_coach and student_user_id = v_s3;  -- no-op, s3 is not linked yet
  insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at)
  values (v_coach, v_s3, 'active', now());
  insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at)
  values (v_coach, v_s4, 'active', now());
end $$;

select pg_temp.assert_raises(
  '17 the 4th live seat on trial raises',
  $sql$insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at)
       select (select v from pg_temp_ids where k = 'coach'), gen_random_uuid(), 'invited', null
       $sql$);

do $$
declare
  v_coach uuid := (select v from pg_temp_ids where k = 'coach');
  v_coach_user uuid := (select v from pg_temp_ids where k = 'coach_user');
  v_new uuid := gen_random_uuid();
  v_live integer;
begin
  select count(*) into v_live from public.coach_clients
   where coach_id = v_coach and status in ('invited','active');
  perform pg_temp.assert_eq('17b roster is capped at 3 live seats', v_live, 3);

  -- 18. paying lifts the cap in the same transaction, no schema change.
  insert into public.subscriptions (user_id, stripe_subscription_id, stripe_price_id, tier,
                                    status, current_period_end, updated_at)
  values (v_coach_user, 'sub_w10b', 'price_w10_coach_monthly', 'coach', 'active',
          now() + interval '30 days', now());

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_new, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'w10s5@test.dev', '', now(), now(), now());
  insert into public.profiles (id) values (v_new) on conflict (id) do nothing;

  insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at)
  values (v_coach, v_new, 'active', now());

  select count(*) into v_live from public.coach_clients
   where coach_id = v_coach and status in ('invited','active');
  perform pg_temp.assert_eq('18 paying coach: 4th seat accepted', v_live, 4);
  perform pg_temp.assert_txt('18b the 4th student inherits access',
    pg_temp.tier_of(v_new), 'student');
end $$;


-- ---------------------------------------------------------------------------
-- 21. THE COACH-FACING RPCs REFUSE A NON-COACH
--
-- This is the real authorization boundary for /coach/billing. The route guard
-- in React is navigation; these two functions are the wall. They take NO
-- coach_id parameter on purpose — there is nothing for a client to tamper with.
-- ---------------------------------------------------------------------------
select pg_temp.assert_raises(
  '21 keel_my_seat_ledger refuses a caller with no coaches row',
  $sql$select set_config('request.jwt.claims',
         json_build_object('sub', (select v from pg_temp_ids where k = 's1'))::text, true);
       select * from public.keel_my_seat_ledger()$sql$);

select pg_temp.assert_raises(
  '21b keel_my_billing_summary refuses a caller with no coaches row',
  $sql$select set_config('request.jwt.claims',
         json_build_object('sub', (select v from pg_temp_ids where k = 's1'))::text, true);
       select * from public.keel_my_billing_summary()$sql$);

select pg_temp.assert_raises(
  '21c both refuse an anonymous caller',
  $sql$select set_config('request.jwt.claims', null, true);
       select * from public.keel_my_billing_summary()$sql$);

do $$
declare
  v_coach_user uuid := (select v from pg_temp_ids where k = 'coach_user');
  v_rows integer;
  v_solvent boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_coach_user)::text, true);

  -- The roster at this point: s1, s3, s4 and the 4th student are 'active',
  -- s2 is 'paused'. All five are listed; the paused one is never a seat.
  select count(*) into v_rows from public.keel_my_seat_ledger();
  perform pg_temp.assert_eq('21d the coach reads their OWN ledger', v_rows, 5);

  select count(*) into v_rows from public.keel_my_seat_ledger()
   where link_status = 'active';
  perform pg_temp.assert_eq('21d2 four of them are live links', v_rows, 4);

  select is_solvent into v_solvent from public.keel_my_billing_summary();
  perform pg_temp.assert_bool('21e and their own solvency', v_solvent, true);

  perform set_config('request.jwt.claims', null, true);
end $$;


-- 19 / 20. The invoice line.
select pg_temp.assert_raises(
  '19 active_seat_count > linked_seat_count is refused',
  $sql$insert into public.coach_billing_periods
         (coach_id, period_month, active_seat_count, linked_seat_count, threshold_at_computation)
       values ((select v from pg_temp_ids where k = 'coach'),
               date_trunc('month', now())::date, 5, 2, 3)$sql$);

do $$
declare v_coach uuid := (select v from pg_temp_ids where k = 'coach');
begin
  insert into public.coach_billing_periods
    (coach_id, period_month, active_seat_count, linked_seat_count, threshold_at_computation)
  values (v_coach, date_trunc('month', now())::date, 1, 4, 3);
end $$;

select pg_temp.assert_raises(
  '20 one row per (coach, month)',
  $sql$insert into public.coach_billing_periods
         (coach_id, period_month, active_seat_count, linked_seat_count, threshold_at_computation)
       values ((select v from pg_temp_ids where k = 'coach'),
               date_trunc('month', now())::date, 2, 4, 3)$sql$);

select pg_temp.assert_raises(
  '20b period_month must be the first of the month',
  $sql$insert into public.coach_billing_periods
         (coach_id, period_month, active_seat_count, linked_seat_count, threshold_at_computation)
       values ((select v from pg_temp_ids where k = 'coach'),
               (date_trunc('month', now()) + interval '3 days')::date, 1, 4, 3)$sql$);

rollback;
