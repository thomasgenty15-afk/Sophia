-- ===========================================================================
-- QA AGENT 15 — fixtures for the student's ENTRY PATH
--   invitation -> account -> coach_clients -> WhatsApp number -> first message
-- ===========================================================================
-- Idempotent. Run with:
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-15-fixtures.sql
--
-- ISOLATION. Every row this file creates is namespaced `a15.*@example.com`
-- (users) / `a15…` (uuids). `@example.com` is the address family that
-- `isEphemeralTestEmail()` refuses to mail, so an invite issued against these
-- fixtures can never leave the machine even if EMAIL_DELIVERY_ENABLED flips.
--
-- WHAT IT DOES *NOT* SEED, ON PURPOSE:
--   * no coach_clients row — the whole point of scenario 1 is to watch that
--     row be born by `accept_coach_invitation_for_user`;
--   * no phone_number on the student — scenario 3 asks how one gets there.
-- ===========================================================================

begin;

-- --- 0. wipe any previous run ---------------------------------------------
delete from auth.users where email like 'a15.%@example.com';
delete from public.cohorts where id = 'a1500000-0000-4000-8000-0000000000c0';
delete from public.coaches where id = 'a1500000-0000-4000-8000-0000000000aa';

-- --- 1. users --------------------------------------------------------------
-- Token columns '' and not NULL: GoTrue scans them into Go strings and a NULL
-- breaks the password grant (see agent-5-fixtures.sql).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change, phone_change_token,
  reauthentication_token,
  created_at, updated_at
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', '', '', '', '',
  now(), now()
from (values
  -- the coach who invites
  ('a1500000-0000-4000-8000-000000000001'::uuid, 'a15.coach@example.com'),
  -- an ALREADY EXISTING account, for the "signed-in accept" branch
  ('a1500000-0000-4000-8000-000000000021'::uuid, 'a15.existing@example.com'),
  -- a second coach, for `already_coached`
  ('a1500000-0000-4000-8000-000000000002'::uuid, 'a15.coach2@example.com')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'a15.%@example.com';

-- --- 2. profiles -----------------------------------------------------------
-- handle_new_user() already inserted them; this only sets the KEEL columns.
update public.profiles
   set keel_role = 'coach', full_name = 'Nadia Okonkwo',
       locale = 'en-GB', timezone = 'Europe/London'
 where id in ('a1500000-0000-4000-8000-000000000001',
              'a1500000-0000-4000-8000-000000000002');

update public.profiles
   set full_name = 'Existing Person', locale = 'en-GB', timezone = 'Europe/London'
 where id = 'a1500000-0000-4000-8000-000000000021';

-- --- 3. coaches ------------------------------------------------------------
insert into public.coaches (id, user_id, display_name, status, trial_seat_limit)
values
  ('a1500000-0000-4000-8000-0000000000aa', 'a1500000-0000-4000-8000-000000000001',
   'Nadia Okonkwo', 'active', 20),
  ('a1500000-0000-4000-8000-0000000000ab', 'a1500000-0000-4000-8000-000000000002',
   'Second Coach', 'active', 20)
on conflict (id) do update set status = excluded.status;

-- --- 4. a cohort -----------------------------------------------------------
-- Scenario 1 claims the student is attached to a cohort. This is the cohort
-- they would be attached TO; whether anything attaches them is the question.
insert into public.cohorts (id, coach_id, label, content_locale, status, starts_on, duration_weeks)
values ('a1500000-0000-4000-8000-0000000000c0', 'a1500000-0000-4000-8000-0000000000aa',
        'Autumn intake', 'en-GB', 'running', current_date, 8)
on conflict (id) do nothing;

commit;

select 'coach' as what, id::text, status from public.coaches where id like 'a1500000%'
union all
select 'cohort', id::text, status from public.cohorts where id like 'a1500000%';
