-- ===========================================================================
-- QA AGENT 11 — fixtures for `keel-coach-synthesis` -> `coach_syntheses`
--                -> `/coach/weekly`
-- ===========================================================================
-- Idempotent. Run with:
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-11-fixtures.sql
--
-- SIMULATED CLOCK (harness rule: simulated >= real, never in the past):
--   now      = 2026-08-03T21:00:00Z  (Monday)
--   as_of    = 2026-08-03            -> last COMPLETE week = 2026-07-27 .. 2026-08-02
-- Every fact below sits inside that window; every contact anchor is an exact
-- offset from `now`, so the 48h / 120h boundaries can be checked to the hour.
--
-- SIX COACHES, each one a question:
--   ALPHA   7 students, 2 cohorts        -> the real Monday read
--   BRAVO   1 student                    -> tenancy (he must never see ALPHA)
--   CHARLIE 4 students at 47/49/119/121h -> the contact boundaries, to the hour
--   DELTA   2 students, zero data        -> the honest empty synthesis
--   ECHO    0 students                   -> no synthesis at all + empty screen
--   LEGACY  2 students WITH evaluations   -> the adherence branch (1:1 mode,
--           which the pivot unplugged for cohorts but did not delete)
--
-- The ALPHA cohort is deliberately PIVOT-REALISTIC: no `plan_commitments`, no
-- `commitment_evaluations`, because migration 20260803200000 unscheduled the
-- evaluator for the 1:N model. That is the population the Monday job actually
-- runs on.
-- ===========================================================================

begin;

-- --- 0. wipe any previous run of this fixture ------------------------------
delete from auth.users where email like 'b11.%@keeltest.dev';

-- --- 1. users --------------------------------------------------------------
-- Token columns set to '' and not NULL: GoTrue scans them into Go strings and
-- a NULL breaks the password grant (the real shape of "local auth admin API is
-- broken" in this repo). Password for every persona: 1234567.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change, phone_change_token,
  reauthentication_token, created_at, updated_at
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', '', '', '', '', now(), now()
from (values
  -- coaches
  ('b1000000-0000-4000-8000-000000000001'::uuid, 'b11.coach.alpha@keeltest.dev'),
  ('b1000000-0000-4000-8000-000000000002'::uuid, 'b11.coach.bravo@keeltest.dev'),
  ('b1000000-0000-4000-8000-000000000003'::uuid, 'b11.coach.charlie@keeltest.dev'),
  ('b1000000-0000-4000-8000-000000000004'::uuid, 'b11.coach.delta@keeltest.dev'),
  ('b1000000-0000-4000-8000-000000000005'::uuid, 'b11.coach.echo@keeltest.dev'),
  ('b1000000-0000-4000-8000-000000000006'::uuid, 'b11.coach.legacy@keeltest.dev'),
  -- ALPHA cohort
  ('b1570000-0000-4000-8000-000000000001'::uuid, 'b11.ada@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000002'::uuid, 'b11.bilal@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000003'::uuid, 'b11.chen@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000004'::uuid, 'b11.dara@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000005'::uuid, 'b11.emeka@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000006'::uuid, 'b11.farah@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000007'::uuid, 'b11.gabi@keeltest.dev'),
  -- BRAVO
  ('b1570000-0000-4000-8000-000000000011'::uuid, 'b11.bravo.student@keeltest.dev'),
  -- CHARLIE (contact boundaries)
  ('b1570000-0000-4000-8000-000000000021'::uuid, 'b11.h47@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000022'::uuid, 'b11.h49@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000023'::uuid, 'b11.h119@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000024'::uuid, 'b11.h121@keeltest.dev'),
  -- DELTA (zero data)
  ('b1570000-0000-4000-8000-000000000031'::uuid, 'b11.delta.one@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000032'::uuid, 'b11.delta.two@keeltest.dev'),
  -- LEGACY (with prescriptions + evaluations)
  ('b1570000-0000-4000-8000-000000000041'::uuid, 'b11.legacy.hi@keeltest.dev'),
  ('b1570000-0000-4000-8000-000000000042'::uuid, 'b11.legacy.lo@keeltest.dev')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'b11.%@keeltest.dev';

-- --- 2. profiles -----------------------------------------------------------
insert into public.profiles (id, email, keel_role, locale, timezone, whatsapp_opted_in,
                             full_name, country)
select u.id, u.email,
       case when u.email like '%coach%' then 'coach' else 'student' end,
       'en-GB', 'Europe/London', true,
       initcap(split_part(split_part(u.email, '@', 1), '.', 2)),
       'GB'
from auth.users u
where u.email like 'b11.%@keeltest.dev'
on conflict (id) do update
  set keel_role = excluded.keel_role,
      locale = excluded.locale,
      timezone = excluded.timezone,
      full_name = excluded.full_name;

-- Readable names (the synthesis names people; "A student" is the fallback we
-- never want to be reading in a report).
update public.profiles set full_name = 'Ada Lovelace'  where id = 'b1570000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Bilal Haddad'  where id = 'b1570000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Chen Wei'      where id = 'b1570000-0000-4000-8000-000000000003';
update public.profiles set full_name = 'Dara Quinn'    where id = 'b1570000-0000-4000-8000-000000000004';
update public.profiles set full_name = 'Emeka Obi'     where id = 'b1570000-0000-4000-8000-000000000005';
update public.profiles set full_name = 'Farah Nasser'  where id = 'b1570000-0000-4000-8000-000000000006';
update public.profiles set full_name = 'Gabi Rossi'    where id = 'b1570000-0000-4000-8000-000000000007';

-- The opted-out student: still a seat, still in the cohort, no WhatsApp.
update public.profiles
   set whatsapp_opted_in = false,
       whatsapp_opted_out_at = timestamptz '2026-08-03 21:00:00+00' - interval '10 days',
       whatsapp_optout_reason = 'student_request'
 where id = 'b1570000-0000-4000-8000-000000000007';

-- --- 3. coaches ------------------------------------------------------------
-- trial_seat_limit raised: `_trg_coach_clients_enforce_trial_cap()` caps a
-- trial coach at 3 live seats and ALPHA needs seven.
insert into public.coaches (id, user_id, display_name, status, trial_seat_limit)
values
  ('b1c0ac00-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000001','Coach Alpha','active',50),
  ('b1c0ac00-0000-4000-8000-00000000000b','b1000000-0000-4000-8000-000000000002','Coach Bravo','active',50),
  ('b1c0ac00-0000-4000-8000-00000000000c','b1000000-0000-4000-8000-000000000003','Coach Charlie','active',50),
  ('b1c0ac00-0000-4000-8000-00000000000d','b1000000-0000-4000-8000-000000000004','Coach Delta','active',50),
  ('b1c0ac00-0000-4000-8000-00000000000e','b1000000-0000-4000-8000-000000000005','Coach Echo','active',50),
  ('b1c0ac00-0000-4000-8000-00000000000f','b1000000-0000-4000-8000-000000000006','Coach Legacy','active',50);

-- --- 4. cohorts (two under ALPHA — scenario 6) -----------------------------
insert into public.cohorts (id, coach_id, label, content_locale, status, starts_on, duration_weeks)
values
  ('b1c00000-0000-4000-8000-0000000000a1','b1c0ac00-0000-4000-8000-00000000000a',
   'Alpha - June intake','en-GB','running', date '2026-06-01', 12),
  ('b1c00000-0000-4000-8000-0000000000a2','b1c0ac00-0000-4000-8000-00000000000a',
   'Alpha - July intake','en-GB','running', date '2026-07-06', 12);

-- --- 5. seats --------------------------------------------------------------
insert into public.coach_clients (coach_id, student_user_id, cohort_id, status, consent_granted_at, seat_state)
values
  -- ALPHA / cohort 1
  ('b1c0ac00-0000-4000-8000-00000000000a','b1570000-0000-4000-8000-000000000001','b1c00000-0000-4000-8000-0000000000a1','active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000a','b1570000-0000-4000-8000-000000000002','b1c00000-0000-4000-8000-0000000000a1','active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000a','b1570000-0000-4000-8000-000000000003','b1c00000-0000-4000-8000-0000000000a1','active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000a','b1570000-0000-4000-8000-000000000004','b1c00000-0000-4000-8000-0000000000a1','active', now(),'billed'),
  -- ALPHA / cohort 2
  ('b1c0ac00-0000-4000-8000-00000000000a','b1570000-0000-4000-8000-000000000005','b1c00000-0000-4000-8000-0000000000a2','active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000a','b1570000-0000-4000-8000-000000000006','b1c00000-0000-4000-8000-0000000000a2','active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000a','b1570000-0000-4000-8000-000000000007','b1c00000-0000-4000-8000-0000000000a2','active', now(),'billed'),
  -- BRAVO
  ('b1c0ac00-0000-4000-8000-00000000000b','b1570000-0000-4000-8000-000000000011',null,'active', now(),'billed'),
  -- CHARLIE
  ('b1c0ac00-0000-4000-8000-00000000000c','b1570000-0000-4000-8000-000000000021',null,'active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000c','b1570000-0000-4000-8000-000000000022',null,'active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000c','b1570000-0000-4000-8000-000000000023',null,'active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000c','b1570000-0000-4000-8000-000000000024',null,'active', now(),'billed'),
  -- DELTA
  ('b1c0ac00-0000-4000-8000-00000000000d','b1570000-0000-4000-8000-000000000031',null,'active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000d','b1570000-0000-4000-8000-000000000032',null,'active', now(),'billed'),
  -- LEGACY
  ('b1c0ac00-0000-4000-8000-00000000000f','b1570000-0000-4000-8000-000000000041',null,'active', now(),'billed'),
  ('b1c0ac00-0000-4000-8000-00000000000f','b1570000-0000-4000-8000-000000000042',null,'active', now(),'billed');

-- --- 6. contact (chat_messages, role='user' = the INBOUND the job reads) ----
-- Offsets from the simulated now (2026-08-03T21:00:00Z). The 47/49 and
-- 119/121 pairs straddle the two thresholds by one hour on each side.
insert into public.chat_messages (user_id, role, content, created_at, scope)
values
  ('b1570000-0000-4000-8000-000000000001','user','morning!',  timestamptz '2026-08-03 21:00:00+00' - interval '5 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000002','user','ok',        timestamptz '2026-08-03 21:00:00+00' - interval '6 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000003','user','see you',   timestamptz '2026-08-03 21:00:00+00' - interval '144 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000004','user','thanks',    timestamptz '2026-08-03 21:00:00+00' - interval '8 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000005','user','photo sent',timestamptz '2026-08-03 21:00:00+00' - interval '9 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000006','user','hi',        timestamptz '2026-08-03 21:00:00+00' - interval '7 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000007','user','on the app',timestamptz '2026-08-03 21:00:00+00' - interval '30 hours','web'),
  ('b1570000-0000-4000-8000-000000000011','user','hello',     timestamptz '2026-08-03 21:00:00+00' - interval '3 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000021','user','47h',       timestamptz '2026-08-03 21:00:00+00' - interval '47 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000022','user','49h',       timestamptz '2026-08-03 21:00:00+00' - interval '49 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000023','user','119h',      timestamptz '2026-08-03 21:00:00+00' - interval '119 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000024','user','121h',      timestamptz '2026-08-03 21:00:00+00' - interval '121 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000041','user','done',      timestamptz '2026-08-03 21:00:00+00' - interval '4 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000042','user','hey',       timestamptz '2026-08-03 21:00:00+00' - interval '10 hours','whatsapp');
-- DELTA students say NOTHING, ever: lastInbound null -> "never replied".

-- Outbound noise: three nudges Sophia sent AFTER the student went quiet. The
-- job must not count them as contact (that is the whole point of role='user').
insert into public.chat_messages (user_id, role, content, created_at, scope)
values
  ('b1570000-0000-4000-8000-000000000003','assistant','still there?', timestamptz '2026-08-03 21:00:00+00' - interval '48 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000003','assistant','how did it go?',timestamptz '2026-08-03 21:00:00+00' - interval '24 hours','whatsapp'),
  ('b1570000-0000-4000-8000-000000000024','assistant','checking in',  timestamptz '2026-08-03 21:00:00+00' - interval '12 hours','whatsapp');

-- --- 7. the evening taps (livability) --------------------------------------
-- CHECK on the table: overall='good' REQUIRES axis null.
insert into public.student_daily_checkins (user_id, local_date, overall, axis, source)
values
  -- Ada: 5 good, 1 mixed, 1 hard  -> 7 taps, hard 1/7 -> sustainable
  ('b1570000-0000-4000-8000-000000000001', date '2026-07-27','good',  null,   'whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000001', date '2026-07-28','good',  null,   'whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000001', date '2026-07-29','good',  null,   'whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000001', date '2026-07-30','mixed', 'energy','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000001', date '2026-07-31','good',  null,   'whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000001', date '2026-08-01','hard',  'sleep', 'whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000001', date '2026-08-02','good',  null,   'whatsapp_button'),
  -- Bilal: 3 hard + 2 mixed + 1 good -> hard band, dominant axis hunger (4/6)
  ('b1570000-0000-4000-8000-000000000002', date '2026-07-28','hard',  'hunger','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000002', date '2026-07-29','hard',  'hunger','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000002', date '2026-07-30','mixed', 'hunger','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000002', date '2026-07-31','hard',  'hunger','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000002', date '2026-08-01','mixed', 'energy','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000002', date '2026-08-02','good',  null,    'whatsapp_button'),
  -- Dara: TWO taps only -> below LIVABILITY_MIN_TAPS -> unknown, never "holding up"
  ('b1570000-0000-4000-8000-000000000004', date '2026-07-29','good', null,'whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000004', date '2026-07-31','good', null,'whatsapp_button'),
  -- Farah: 2 good + 2 mixed -> (hard+mixed)/taps = 0.5, NOT > 0.5 -> sustainable
  ('b1570000-0000-4000-8000-000000000006', date '2026-07-27','mixed','hunger','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000006', date '2026-07-29','good', null,    'whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000006', date '2026-07-30','mixed','hunger','whatsapp_button'),
  ('b1570000-0000-4000-8000-000000000006', date '2026-08-01','good', null,    'whatsapp_button');
-- Chen, Emeka (photos only), Gabi (opted out): no taps at all.

-- --- 8. the logs (protocol_events -> coverage + portion bands) --------------
-- LOGGED_DAY_MIN_EVENTS = 2, so every logged day gets exactly 2 rows.
insert into public.protocol_events (user_id, occurred_at, local_date, source, content_locale, portion_band)
values
  -- Ada: 6 logged days (2026-07-27 .. 08-01) = 12 plates
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-27 12:00+00', date '2026-07-27','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-27 19:00+00', date '2026-07-27','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-28 12:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-28 19:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-29 12:00+00', date '2026-07-29','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-29 19:00+00', date '2026-07-29','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-30 12:00+00', date '2026-07-30','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-30 19:00+00', date '2026-07-30','photo','en-GB','unclear'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-31 12:00+00', date '2026-07-31','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-07-31 19:00+00', date '2026-07-31','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-08-01 12:00+00', date '2026-08-01','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000001', timestamptz '2026-08-01 19:00+00', date '2026-08-01','photo','en-GB','large'),
  -- Bilal: 5 logged days (07-27 .. 07-31) = 10 plates
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-27 12:00+00', date '2026-07-27','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-27 19:00+00', date '2026-07-27','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-28 12:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-28 19:00+00', date '2026-07-28','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-29 12:00+00', date '2026-07-29','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-29 19:00+00', date '2026-07-29','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-30 12:00+00', date '2026-07-30','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-30 19:00+00', date '2026-07-30','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-31 12:00+00', date '2026-07-31','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000002', timestamptz '2026-07-31 19:00+00', date '2026-07-31','photo','en-GB','small'),
  -- Dara: exactly 4 logged days = the coverage gate, met to the day
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-27 12:00+00', date '2026-07-27','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-27 19:00+00', date '2026-07-27','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-28 12:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-28 19:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-29 12:00+00', date '2026-07-29','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-29 19:00+00', date '2026-07-29','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-30 12:00+00', date '2026-07-30','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000004', timestamptz '2026-07-30 19:00+00', date '2026-07-30','photo','en-GB','moderate'),
  -- Emeka: PHOTOS, NO TAPS, NO PLAN LINES -> the `no_evaluable_plan` case.
  --        5 logged days: he did exactly what was asked of him.
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-27 12:00+00', date '2026-07-27','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-27 19:00+00', date '2026-07-27','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-28 12:00+00', date '2026-07-28','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-28 19:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-29 12:00+00', date '2026-07-29','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-29 19:00+00', date '2026-07-29','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-30 12:00+00', date '2026-07-30','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-30 19:00+00', date '2026-07-30','photo','en-GB','unclear'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-31 12:00+00', date '2026-07-31','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000005', timestamptz '2026-07-31 19:00+00', date '2026-07-31','photo','en-GB','moderate'),
  -- Farah: 4 logged days
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-27 12:00+00', date '2026-07-27','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-27 19:00+00', date '2026-07-27','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-28 12:00+00', date '2026-07-28','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-28 19:00+00', date '2026-07-28','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-29 12:00+00', date '2026-07-29','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-29 19:00+00', date '2026-07-29','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-30 12:00+00', date '2026-07-30','photo','en-GB','small'),
  ('b1570000-0000-4000-8000-000000000006', timestamptz '2026-07-30 19:00+00', date '2026-07-30','photo','en-GB','small'),
  -- Gabi (opted out): ONE event on one day -> 0 logged days (needs 2/day).
  ('b1570000-0000-4000-8000-000000000007', timestamptz '2026-07-28 12:00+00', date '2026-07-28','text','en-GB',null),
  -- LEGACY hi: 5 logged days / LEGACY lo: 4 logged days
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-27 12:00+00', date '2026-07-27','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-27 19:00+00', date '2026-07-27','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-28 12:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-28 19:00+00', date '2026-07-28','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-29 12:00+00', date '2026-07-29','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-29 19:00+00', date '2026-07-29','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-30 12:00+00', date '2026-07-30','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-30 19:00+00', date '2026-07-30','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-31 12:00+00', date '2026-07-31','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000041', timestamptz '2026-07-31 19:00+00', date '2026-07-31','photo','en-GB','moderate'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-27 12:00+00', date '2026-07-27','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-27 19:00+00', date '2026-07-27','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-28 12:00+00', date '2026-07-28','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-28 19:00+00', date '2026-07-28','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-29 12:00+00', date '2026-07-29','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-29 19:00+00', date '2026-07-29','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-30 12:00+00', date '2026-07-30','photo','en-GB','large'),
  ('b1570000-0000-4000-8000-000000000042', timestamptz '2026-07-30 19:00+00', date '2026-07-30','photo','en-GB','large');

-- --- 9. the week plans the students set THEMSELVES --------------------------
insert into public.student_week_plans (user_id, week_start, items, status, adopted_at, content_locale)
values
  ('b1570000-0000-4000-8000-000000000001', date '2026-07-27',
   '[{"kind":"nutrition","text":"protein at breakfast","source_belief_key":"protein_first"},{"kind":"nutrition","text":"veg at lunch","source_belief_key":"plants_daily"},{"kind":"nutrition","text":"no seconds","source_belief_key":"portion_awareness"},{"kind":"action","text":"walk after dinner"}]'::jsonb,
   'adopted', timestamptz '2026-07-27 08:00+00','en-GB'),
  ('b1570000-0000-4000-8000-000000000002', date '2026-07-27',
   '[{"kind":"nutrition","text":"eat before 9pm","source_belief_key":"evening_window"},{"kind":"nutrition","text":"breakfast every day","source_belief_key":"protein_first"}]'::jsonb,
   'adopted', timestamptz '2026-07-27 08:00+00','en-GB'),
  ('b1570000-0000-4000-8000-000000000004', date '2026-07-27',
   '[{"kind":"nutrition","text":"water with meals","source_belief_key":"hydration"},{"kind":"action","text":"cook twice"}]'::jsonb,
   'adopted', timestamptz '2026-07-27 08:00+00','en-GB'),
  ('b1570000-0000-4000-8000-000000000005', date '2026-07-27',
   '[{"kind":"nutrition","text":"photo every meal","source_belief_key":"log_what_you_eat"}]'::jsonb,
   'adopted', timestamptz '2026-07-27 08:00+00','en-GB'),
  -- Farah drafted one and never adopted it: `planned` must not count her.
  ('b1570000-0000-4000-8000-000000000006', date '2026-07-27',
   '[{"kind":"nutrition","text":"three meals","source_belief_key":"regular_meals"}]'::jsonb,
   'draft', null,'en-GB');

-- --- 10. the TCA floor: Farah is flagged restrictive for that very week -----
-- This is the row `keel-weekly-flow-v1` reads (`isRestrictionFlagged`).
insert into public.weekly_reviews (user_id, week_start_date, risk_band, content_locale,
                                   logging_coverage, evaluable_days)
values ('b1570000-0000-4000-8000-000000000006', date '2026-07-27','restriction_flag','en-GB', 0.57, 0);

-- --- 11. LEGACY: a real prescription + real evaluations ---------------------
-- The 1:1 chain the pivot unplugged for cohorts but kept in the code. It is
-- the only way to exercise the adherence branch of the narrative.
insert into public.plan_versions (id, coach_id, student_id, version, status, title,
  timezone, anchor_week_start, duration_weeks, content_locale, published_at)
values
  ('b1b10000-0000-4000-8000-000000000041','b1c0ac00-0000-4000-8000-00000000000f',
   'b1570000-0000-4000-8000-000000000041',1,'published','Legacy plan hi','Europe/London',
   date '2026-07-27',4,'en-GB', timestamptz '2026-07-26 10:00+00'),
  ('b1b10000-0000-4000-8000-000000000042','b1c0ac00-0000-4000-8000-00000000000f',
   'b1570000-0000-4000-8000-000000000042',1,'published','Legacy plan lo','Europe/London',
   date '2026-07-27',4,'en-GB', timestamptz '2026-07-26 10:00+00');

insert into public.plan_commitments (id, plan_version_id, user_id, coach_id, polarity,
  activity_class, anchor_kind, measure, target_op, evidence_kind, evaluation_grain,
  expected_occasions_per_day, priority, counts_toward_adherence, title, content_locale)
values
  ('b1c11000-0000-4000-8000-000000000041','b1b10000-0000-4000-8000-000000000041',
   'b1570000-0000-4000-8000-000000000041','b1c0ac00-0000-4000-8000-00000000000f',
   'do','nutrition','free','presence','any','self_report','day',1,'core',true,
   'Protein at every meal','en-GB'),
  ('b1c11000-0000-4000-8000-000000000042','b1b10000-0000-4000-8000-000000000042',
   'b1570000-0000-4000-8000-000000000042','b1c0ac00-0000-4000-8000-00000000000f',
   'do','nutrition','free','presence','any','self_report','day',1,'core',true,
   'Protein at every meal','en-GB');

insert into public.commitment_evaluations (user_id, commitment_id, plan_version_id,
  local_date, grain, status, evidence)
values
  -- hi: 5 days, all met -> 100%
  ('b1570000-0000-4000-8000-000000000041','b1c11000-0000-4000-8000-000000000041','b1b10000-0000-4000-8000-000000000041', date '2026-07-27','day','met','self_report'),
  ('b1570000-0000-4000-8000-000000000041','b1c11000-0000-4000-8000-000000000041','b1b10000-0000-4000-8000-000000000041', date '2026-07-28','day','met','self_report'),
  ('b1570000-0000-4000-8000-000000000041','b1c11000-0000-4000-8000-000000000041','b1b10000-0000-4000-8000-000000000041', date '2026-07-29','day','met','self_report'),
  ('b1570000-0000-4000-8000-000000000041','b1c11000-0000-4000-8000-000000000041','b1b10000-0000-4000-8000-000000000041', date '2026-07-30','day','met','self_report'),
  ('b1570000-0000-4000-8000-000000000041','b1c11000-0000-4000-8000-000000000041','b1b10000-0000-4000-8000-000000000041', date '2026-07-31','day','met','self_report'),
  -- lo: 2 met, 2 missed -> 50%
  ('b1570000-0000-4000-8000-000000000042','b1c11000-0000-4000-8000-000000000042','b1b10000-0000-4000-8000-000000000042', date '2026-07-27','day','met','self_report'),
  ('b1570000-0000-4000-8000-000000000042','b1c11000-0000-4000-8000-000000000042','b1b10000-0000-4000-8000-000000000042', date '2026-07-28','day','met','self_report'),
  ('b1570000-0000-4000-8000-000000000042','b1c11000-0000-4000-8000-000000000042','b1b10000-0000-4000-8000-000000000042', date '2026-07-29','day','missed','self_report'),
  ('b1570000-0000-4000-8000-000000000042','b1c11000-0000-4000-8000-000000000042','b1b10000-0000-4000-8000-000000000042', date '2026-07-30','day','missed','self_report');

-- --- 12. clean slate for the artefact under test ----------------------------
delete from public.coach_syntheses
 where coach_id in (select id from public.coaches
                     where user_id in (select id from auth.users
                                        where email like 'b11.%@keeltest.dev'));

commit;

-- ===========================================================================
-- What the fixture claims, so a reader can check the fixture itself
-- ===========================================================================
select p.full_name,
       (select count(*) from public.student_daily_checkins c where c.user_id = p.id
         and c.local_date between date '2026-07-27' and date '2026-08-02') as taps,
       (select count(*) from public.protocol_events e where e.user_id = p.id
         and e.local_date between date '2026-07-27' and date '2026-08-02') as events,
       (select count(*) from (
          select e.local_date from public.protocol_events e where e.user_id = p.id
           and e.local_date between date '2026-07-27' and date '2026-08-02'
          group by e.local_date having count(*) >= 2) d) as logged_days,
       round(extract(epoch from (timestamptz '2026-08-03 21:00:00+00' -
         (select max(m.created_at) from public.chat_messages m
           where m.user_id = p.id and m.role = 'user'))) / 3600.0, 1) as hours_since_inbound
  from public.profiles p
 where p.email like 'b11.%@keeltest.dev' and p.keel_role = 'student'
 order by p.email;
