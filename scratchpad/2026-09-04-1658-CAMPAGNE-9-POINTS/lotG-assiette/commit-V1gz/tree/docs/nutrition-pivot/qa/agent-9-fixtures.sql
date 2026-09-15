-- ===========================================================================
-- QA AGENT 9 — fixtures for `keel-reengage-v1` (relance d'inactivité)
-- ===========================================================================
-- Idempotent. Run with:
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-9-fixtures.sql
--
-- ISOLATION — les UUID commencent tous par `f9f9`, au-dessus de toutes les
-- personas existantes (max observé: a8a8…). Chaque appel du job passe donc
-- `after_user_id: 'f0000000-0000-0000-0000-000000000000'`, ce qui restreint le
-- balayage à ces lignes. Un run QA parallèle (agents 1/4/5/8) ne peut ni voir
-- mes épisodes ni m'en ouvrir. Le dépôt porte déjà un incident de run QA
-- concurrent qui purgeait la flotte entière; on ne le refait pas.
--
-- ANCRE TEMPORELLE: T0 = 2026-08-03T12:00:00Z. Tous les `now` des scénarios
-- sont exprimés relativement à cette ancre, jamais à `now()`.
-- ===========================================================================

begin;

-- --- 0. wipe any previous run of this fixture ------------------------------
delete from public.reengagement_episodes
 where user_id in (select id from auth.users where email like 'a9.%@keeltest.dev');
delete from auth.users where email like 'a9.%@keeltest.dev';

-- --- 1. users --------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
from (values
  ('f9f90000-0000-4000-8000-0000000000c1'::uuid, 'a9.coach@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000001'::uuid, 'a9.threshold@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000002'::uuid, 'a9.anchor@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000003'::uuid, 'a9.quiet@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000004'::uuid, 'a9.dedup@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000005'::uuid, 'a9.restricted@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000006'::uuid, 'a9.optout@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000007'::uuid, 'a9.secondepisode@keeltest.dev'),
  ('f9f90000-0000-4000-8000-000000000008'::uuid, 'a9.hardweek@keeltest.dev')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'a9.%@keeltest.dev';

-- --- 2. profiles -----------------------------------------------------------
-- Tous opt-in WhatsApp avec un numéro (le job ne lit pas le numéro, mais la
-- chaîne d'envoi le fera: un fixture sans numéro donnerait un faux vert au
-- moment où on branche l'outbound).
insert into public.profiles (
  id, email, keel_role, locale, timezone, whatsapp_opted_in, phone_number, full_name
)
values
  ('f9f90000-0000-4000-8000-0000000000c1', 'a9.coach@keeltest.dev',        'coach',   'en-GB', 'Europe/London', false, null,            'Nadia'),
  ('f9f90000-0000-4000-8000-000000000001', 'a9.threshold@keeltest.dev',    'student', 'en-GB', 'Europe/London', true,  '+447700900901', 'Iris'),
  ('f9f90000-0000-4000-8000-000000000002', 'a9.anchor@keeltest.dev',       'student', 'en-GB', 'Europe/London', true,  '+447700900902', 'Omar'),
  -- Asia/Tokyo: à T0 (12:00Z) il est 21:00 locales -> heure calme pile au seuil.
  ('f9f90000-0000-4000-8000-000000000003', 'a9.quiet@keeltest.dev',        'student', 'en-GB', 'Asia/Tokyo',    true,  '+447700900903', 'Yuki'),
  ('f9f90000-0000-4000-8000-000000000004', 'a9.dedup@keeltest.dev',        'student', 'en-GB', 'Europe/London', true,  '+447700900904', 'Sam'),
  ('f9f90000-0000-4000-8000-000000000005', 'a9.restricted@keeltest.dev',   'student', 'en-GB', 'Europe/London', true,  '+447700900905', 'Lena'),
  ('f9f90000-0000-4000-8000-000000000006', 'a9.optout@keeltest.dev',       'student', 'en-GB', 'Europe/London', true,  '+447700900906', 'Théo'),
  ('f9f90000-0000-4000-8000-000000000007', 'a9.secondepisode@keeltest.dev','student', 'en-GB', 'Europe/London', true,  '+447700900907', 'Nour'),
  ('f9f90000-0000-4000-8000-000000000008', 'a9.hardweek@keeltest.dev',     'student', 'en-GB', 'Europe/London', true,  '+447700900908', 'Rae')
on conflict (id) do update
  set keel_role = excluded.keel_role,
      locale = excluded.locale,
      timezone = excluded.timezone,
      whatsapp_opted_in = excluded.whatsapp_opted_in,
      whatsapp_opted_out_at = null,
      phone_number = excluded.phone_number,
      full_name = excluded.full_name;

-- Théo est opted-out (scénario 7).
update public.profiles
   set whatsapp_opted_out_at = timestamptz '2026-08-01T09:00:00Z',
       whatsapp_opted_in = false
 where id = 'f9f90000-0000-4000-8000-000000000006';

-- --- 3. coach + plans publiés ---------------------------------------------
insert into public.coaches (id, user_id, display_name, status, trial_seat_limit)
values ('f9f90000-0000-4000-8000-0000000000ca', 'f9f90000-0000-4000-8000-0000000000c1', 'Nadia A9', 'active', 20)
on conflict (id) do update set status = excluded.status;

-- Un plan publié par élève: sans lui le décideur écarte sur `no_active_plan`
-- AVANT d'atteindre le seuil, et tous les scénarios seraient vert par accident.
insert into public.plan_versions (
  coach_id, student_id, version, status, title, content_locale, timezone,
  anchor_week_start, duration_weeks, published_at, published_by
)
select
  'f9f90000-0000-4000-8000-0000000000ca',
  s.id, 1, 'published', 'A9 plan', 'en-GB', 'Europe/London',
  date '2026-07-27', 8, timestamptz '2026-07-27T09:00:00Z',
  'f9f90000-0000-4000-8000-0000000000c1'
from public.profiles s
where s.email like 'a9.%@keeltest.dev' and s.keel_role = 'student';

-- --- 4. historique de messages --------------------------------------------
-- L'ancre du compteur est le DERNIER ENTRANT (`role = 'user'`). Les sortants
-- sont semés exprès pour le scénario 2: s'ils réarmaient le compteur, Sophia se
-- relancerait elle-même à l'infini.
insert into public.chat_messages (user_id, role, content, created_at, scope)
values
  -- Iris: exactement 71h avant T0 (2026-08-03T12:00:00Z) -> sous le seuil.
  ('f9f90000-0000-4000-8000-000000000001', 'user',      'ok will do',                timestamptz '2026-07-31T13:00:00Z', 'whatsapp'),

  -- Omar: 100h de silence ENTRANT, mais deux sortants récents (dont 1h avant T0).
  ('f9f90000-0000-4000-8000-000000000002', 'user',      'thanks',                    timestamptz '2026-07-30T08:00:00Z', 'whatsapp'),
  ('f9f90000-0000-4000-8000-000000000002', 'assistant', 'Morning pulse',             timestamptz '2026-08-02T09:00:00Z', 'whatsapp'),
  ('f9f90000-0000-4000-8000-000000000002', 'assistant', 'Morning pulse',             timestamptz '2026-08-03T11:00:00Z', 'whatsapp'),

  ('f9f90000-0000-4000-8000-000000000003', 'user',      'noted',                     timestamptz '2026-07-30T08:00:00Z', 'whatsapp'),
  ('f9f90000-0000-4000-8000-000000000004', 'user',      'got it',                    timestamptz '2026-07-30T08:00:00Z', 'whatsapp'),
  ('f9f90000-0000-4000-8000-000000000005', 'user',      'ok',                        timestamptz '2026-07-30T08:00:00Z', 'whatsapp'),
  ('f9f90000-0000-4000-8000-000000000006', 'user',      'ok',                        timestamptz '2026-07-30T08:00:00Z', 'whatsapp'),
  ('f9f90000-0000-4000-8000-000000000007', 'user',      'sure',                      timestamptz '2026-07-30T08:00:00Z', 'whatsapp'),
  ('f9f90000-0000-4000-8000-000000000008', 'user',      'rough week honestly',       timestamptz '2026-07-30T08:00:00Z', 'whatsapp');

-- --- 4bis. engagements du plan + onboarding terminé -------------------------
-- Sans ces deux-là, le tour de RETOUR n'est pas testable: le handler
-- d'onboarding legacy du webhook capte l'élève (`whatsapp_state` →
-- `awaiting_plan_finalization`) et répond « pose un mini-plan » en français.
-- C'est un artefact de fixture, pas un défaut produit — un vrai élève KEEL
-- arrive par l'invitation du coach avec `onboarding_completed = true`.
insert into public.plan_commitments (
  plan_version_id, user_id, coach_id, polarity, activity_class, anchor_kind,
  slot_key, measure, target_op, evidence_kind, evaluation_grain, slot_kind,
  scheduled_days, expected_occasions_per_day, priority, autonomy, provenance,
  title, content_locale
)
select v.id, v.student_id, 'f9f90000-0000-4000-8000-0000000000ca',
       'do', 'nutrition', 'slot', s.slot, 'presence', 'any', 'self_report',
       'occasion', 'nominal', '{mon,tue,wed,thu,fri,sat,sun}'::text[], 1,
       'core', 'flexible', 'coach_educational',
       'Eat a protein-anchored ' || s.slot, 'en-GB'
from public.plan_versions v
join public.profiles p on p.id = v.student_id
cross join (values ('breakfast'), ('lunch'), ('dinner')) as s(slot)
where p.email like 'a9.%@keeltest.dev' and v.status = 'published';

update public.profiles
   set onboarding_completed = true, whatsapp_state = null
 where email like 'a9.%@keeltest.dev';

-- --- 4ter. semaine difficile DÉCLARÉE (ton `lighter`) ----------------------
-- `student_daily_checkins.overall = 'hard'` est une réponse de l'élève à « How
-- was today? ». Deux jours = une semaine difficile (un seul reste dans la
-- variance d'un rythme normal — même raisonnement que le seuil de 72h).
-- Sans ces deux lignes, `lighter` n'est pas observable et le ton reste `gentle`.
delete from public.student_daily_checkins
 where user_id = 'f9f90000-0000-4000-8000-000000000008';
insert into public.student_daily_checkins (user_id, local_date, overall, axis, source)
values ('f9f90000-0000-4000-8000-000000000008', date '2026-08-01', 'hard', 'energy', 'whatsapp_button'),
       ('f9f90000-0000-4000-8000-000000000008', date '2026-08-02', 'hard', 'sleep',  'whatsapp_button');

-- --- 5. restriction_flag (scénario 7) --------------------------------------
-- Même source que celle que lit `keel-weekly-flow-v1`: la dernière
-- `weekly_reviews.risk_band`. Si le job de relance ne la lit pas, la garde TCA
-- ne mord pas — c'est précisément ce que ce fixture rend observable.
insert into public.weekly_reviews (user_id, week_start_date, risk_band, content_locale)
values ('f9f90000-0000-4000-8000-000000000005', date '2026-07-27', 'restriction_flag', 'en-GB')
on conflict (user_id, week_start_date) where plan_version_id is null
do update set risk_band = excluded.risk_band;

commit;
