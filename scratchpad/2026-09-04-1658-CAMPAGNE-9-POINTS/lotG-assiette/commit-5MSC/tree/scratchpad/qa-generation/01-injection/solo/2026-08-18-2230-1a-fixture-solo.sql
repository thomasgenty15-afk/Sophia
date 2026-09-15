-- ===========================================================================
-- QA 01-injection / lane SOLO — fixture de COMPTE seulement (agent 1A)
-- ===========================================================================
-- Fabrique UN élève solo neuf, rattaché au coach MARC (doctrine PUBLIÉE par
-- `docs/keel/qa-fixtures/00-base.sql`), et RIEN d'autre :
--   * aucune ligne `student_goals`  -> `/app/setup` est la page d'atterrissage
--   * aucun `practical_constraints` -> aucun `retained_*` (piège P3 désarmé)
--   * aucune mesure de corps        -> le corps viendra de l'écran
-- Tout le reste est saisi PAR LES ÉCRANS, c'est le sujet du lot.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < scratchpad/qa-generation/01-injection/solo/2026-08-18-2230-1a-fixture-solo.sql
--
-- Mot de passe : 1234567
--
-- ⚠️ ENVOI DE MAIL NEUTRALISÉ le temps de la transaction (même geste que
--    00-base.sql) : le trigger d'onboarding poste vers `send-welcome-email`
--    qui tourne en local avec une VRAIE clé Resend.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _qa1a_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;

update public.app_config set value = '' where key = 'edge_functions_anon_key';

delete from auth.users where email = 'qa1a.solo@keeltest.dev';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
) values (
  '1a000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'qa1a.solo@keeltest.dev', extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Iris"}'::jsonb,
  now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (
  gen_random_uuid(), '1a000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000001', 'email',
  jsonb_build_object('sub', '1a000000-0000-4000-8000-000000000001', 'email',
                     'qa1a.solo@keeltest.dev', 'email_verified', true),
  now(), now()
);

-- Rattachement au coach MARC (`08050000-…-c1`) : 2 élèves actifs, plafond 3.
select public.keel_attach_student_to_coach(
  '1a000000-0000-4000-8000-000000000001',
  '08050000-0000-4000-8000-0000000000c1',
  'qa1a.solo@keeltest.dev', 'GB');

-- APRÈS l'attach (il n'écrit `locale`/`country` que s'ils sont nuls).
update public.profiles set
  keel_role = 'student', full_name = 'Iris', locale = 'en-GB',
  timezone = 'Europe/London', country = 'GB',
  onboarding_completed = true, account_status = 'active'
where id = '1a000000-0000-4000-8000-000000000001';

-- Aucune ligne student_goals : c'est voulu.
delete from public.student_goals where user_id = '1a000000-0000-4000-8000-000000000001';

update public.app_config set value = (select value from _qa1a_anon_key)
where key = 'edge_functions_anon_key';

commit;

select p.id, p.full_name, p.locale, p.timezone, p.country, p.keel_role,
       (select count(*) from public.student_goals g where g.user_id = p.id) as goals,
       (select count(*) from public.coach_clients c
         where c.student_user_id = p.id and c.status = 'active') as coachs
from public.profiles p where p.id = '1a000000-0000-4000-8000-000000000001';
