-- ============================================================================
-- INSCRIPTION LIBRE — PASSE ADVERSARIALE (§5.2 de PROMPT-FREE-SIGNUP.md)
--
-- MANUEL, sur la base LOCALE, tout en ROLLBACK :
--
--   docker cp supabase/tests/keel/free_signup_adversarial_test.sql \
--     supabase_db_Sophia_2:/tmp/adv.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/adv.sql
--
-- Le gantelet principal (free_signup_test.sql) prouve que le chemin NORMAL
-- marche. Celui-ci attaque les états dégradés, et chaque bloc porte SA condition
-- de désarmement — une ceinture dont on n'a pas montré qu'elle se relâche est une
-- ceinture dont on ne sait pas ce qu'elle bloque vraiment.
--
--   ADV-1  coach maison sans doctrine publiée      -> porte fermée, ZÉRO compte
--          orphelin, et republier la rouvre
--   ADV-2  doctrine PUBLIÉE mais VIDE              -> porte fermée quand même
--          (le piège: published_at non nul ferait dire « disponible » à une
--          garde naïve, et generate-week-plan-v1 rendrait 409 sur beliefs vide)
--   ADV-3  deux onglets s'inscrivent en même temps -> UN lien, UN protocole
--   ADV-4  élève supprimé puis réinscrit           -> repart proprement
--   ADV-5  lien maison en pause                    -> repris, jamais dupliqué,
--          et `started_at` PRÉSERVÉ (c'est le plancher d'historique)
--   ADV-6  profil legacy fr-FR devenant élève      -> passé à la langue produit
--   ADV-7  coach maison suspendu                   -> porte fermée, insolvable
-- ============================================================================

begin;
create or replace function pg_temp.assert_txt(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL % : got %, want %', label, coalesce(got,'<null>'), coalesce(want,'<null>'); end if;
  raise notice 'PASS % (%)', label, coalesce(got,'<null>');
end; $$;
create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL % : got %, want %', label, got, want; end if;
  raise notice 'PASS % (%)', label, got;
end; $$;
create or replace function pg_temp.assert_true(label text, got boolean)
returns void language plpgsql as $$
begin
  if got is not true then raise exception 'FAIL %: expected true', label; end if;
  raise notice 'PASS %', label;
end; $$;
create or replace function pg_temp.mkuser(uid uuid, mail text)
returns void language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (uid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    mail,'x',now(),now(),now(),'{}','{}') on conflict (id) do nothing;
end; $$;

-- ADV-1. LE COACH MAISON N'A PAS DE PROGRAMME PUBLIÉ.
-- La porte doit se FERMER, pas créer des comptes qui rencontreront un 409.
do $$
declare v_house uuid := (select id from public.coaches where coach_kind='house');
begin
  update public.coach_doctrines set published_at = null where coach_id = v_house;
  perform pg_temp.assert_true('ADV-1a unpublished doctrine closes the free door',
    public.keel_free_signup_available() = false);

  perform pg_temp.mkuser('9a000000-0000-4000-8000-000000000001','adv1@example.com');
  perform set_config('request.jwt.claims', json_build_object('sub','9a000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.assert_txt('ADV-1b and the RPC refuses too',
    (public.keel_join_house_coach('GB'))->>'reason', 'house_coach_unavailable');
  reset role;
  perform set_config('request.jwt.claims','',true);
  perform pg_temp.assert_eq('ADV-1c no link, no orphan account state',
    (select count(*) from public.coach_clients where student_user_id='9a000000-0000-4000-8000-000000000001'), 0);

  -- LA CONDITION DE DÉSARMEMENT: republier rouvre la porte.
  update public.coach_doctrines set published_at = now() where coach_id = v_house;
  perform pg_temp.assert_true('ADV-1d republishing reopens it', public.keel_free_signup_available());
end; $$;

-- ADV-2. DOCTRINE PUBLIÉE MAIS VIDE — le piège: `published_at` est non nul,
-- donc une garde naïve dirait « disponible », et generate-week-plan-v1 rendrait
-- 409 coach_has_no_doctrine sur `beliefs` vide.
do $$
declare v_house uuid := (select id from public.coaches where coach_kind='house'); v_saved jsonb;
begin
  select beliefs into v_saved from public.coach_doctrines where coach_id=v_house;
  update public.coach_doctrines set beliefs='[]'::jsonb where coach_id=v_house;
  perform pg_temp.assert_true('ADV-2 a PUBLISHED but EMPTY doctrine still closes the door',
    public.keel_free_signup_available() = false);
  update public.coach_doctrines set beliefs=v_saved where coach_id=v_house;
end; $$;

-- ADV-3. DEUX INSCRIPTIONS SIMULTANÉES du même compte (deux onglets).
do $$
declare v_house uuid := (select id from public.coaches where coach_kind='house'); a jsonb; b jsonb;
begin
  perform pg_temp.mkuser('9a000000-0000-4000-8000-000000000003','adv3@example.com');
  perform set_config('request.jwt.claims', json_build_object('sub','9a000000-0000-4000-8000-000000000003','role','authenticated')::text, true);
  execute 'set local role authenticated';
  a := public.keel_join_house_coach('US');
  b := public.keel_join_house_coach('US');
  reset role; perform set_config('request.jwt.claims','',true);
  perform pg_temp.assert_true('ADV-3a both calls succeed', (a->>'joined')::boolean and (b->>'joined')::boolean);
  perform pg_temp.assert_eq('ADV-3b but exactly ONE link exists',
    (select count(*) from public.coach_clients where student_user_id='9a000000-0000-4000-8000-000000000003'), 1);
  perform pg_temp.assert_eq('ADV-3c and ONE published plan',
    (select count(*) from public.plan_versions where student_id='9a000000-0000-4000-8000-000000000003' and status='published'), 1);
end; $$;

-- ADV-4. ÉLÈVE SUPPRIMÉ PUIS RÉINSCRIT (même adresse, nouveau compte auth).
do $$
declare v_house uuid := (select id from public.coaches where coach_kind='house'); v_res jsonb;
begin
  delete from auth.users where id='9a000000-0000-4000-8000-000000000003';
  perform pg_temp.assert_eq('ADV-4a deleting the account cascades the link away',
    (select count(*) from public.coach_clients where student_user_id='9a000000-0000-4000-8000-000000000003'), 0);
  -- Réinscription: NOUVEL uuid, même adresse.
  perform pg_temp.mkuser('9a000000-0000-4000-8000-000000000004','adv3@example.com');
  perform set_config('request.jwt.claims', json_build_object('sub','9a000000-0000-4000-8000-000000000004','role','authenticated')::text, true);
  execute 'set local role authenticated';
  v_res := public.keel_join_house_coach('US');
  reset role; perform set_config('request.jwt.claims','',true);
  perform pg_temp.assert_true('ADV-4b re-signup after deletion works', (v_res->>'joined')::boolean);
end; $$;

-- ADV-5. LE LIEN MAISON EST EN PAUSE: on le REPREND, sans dupliquer.
do $$
declare v_house uuid := (select id from public.coaches where coach_kind='house'); v_res jsonb; v_started timestamptz;
begin
  update public.coach_clients set status='paused' where student_user_id='9a000000-0000-4000-8000-000000000004';
  select started_at into v_started from public.coach_clients where student_user_id='9a000000-0000-4000-8000-000000000004';
  perform set_config('request.jwt.claims', json_build_object('sub','9a000000-0000-4000-8000-000000000004','role','authenticated')::text, true);
  execute 'set local role authenticated';
  v_res := public.keel_join_house_coach('US');
  reset role; perform set_config('request.jwt.claims','',true);
  perform pg_temp.assert_true('ADV-5a a paused house link is resumed', (v_res->>'joined')::boolean);
  perform pg_temp.assert_eq('ADV-5b not duplicated',
    (select count(*) from public.coach_clients where student_user_id='9a000000-0000-4000-8000-000000000004'), 1);
  perform pg_temp.assert_true('ADV-5c started_at is PRESERVED (history floor)',
    (select started_at from public.coach_clients where student_user_id='9a000000-0000-4000-8000-000000000004') = v_started);
end; $$;

-- ADV-6. LOCALE FR LEGACY: un compte dont le profil est resté fr-FR devient
-- élève -> la langue du produit doit être posée, sinon toute ceinture gatée sur
-- isFrenchLocale s'arme sur lui.
do $$
declare v_house uuid := (select id from public.coaches where coach_kind='house'); v_res jsonb;
begin
  perform pg_temp.mkuser('9a000000-0000-4000-8000-000000000006','advfr@example.com');
  update public.profiles set locale='fr-FR', keel_role=null where id='9a000000-0000-4000-8000-000000000006';
  perform set_config('request.jwt.claims', json_build_object('sub','9a000000-0000-4000-8000-000000000006','role','authenticated')::text, true);
  execute 'set local role authenticated';
  v_res := public.keel_join_house_coach('FR');
  reset role; perform set_config('request.jwt.claims','',true);
  perform pg_temp.assert_txt('ADV-6a a legacy fr-FR profile is moved to the product locale',
    (select locale from public.profiles where id='9a000000-0000-4000-8000-000000000006'), 'en-US');
  perform pg_temp.assert_txt('ADV-6b and FR is a legitimate declared country',
    (select country from public.profiles where id='9a000000-0000-4000-8000-000000000006'), 'FR');
end; $$;

-- ADV-7. LA MAISON EST SUSPENDUE: la porte se ferme, et les accès tombent.
do $$
declare v_house uuid := (select id from public.coaches where coach_kind='house');
begin
  update public.coaches set status='suspended' where id=v_house;
  perform pg_temp.assert_true('ADV-7a a suspended house coach closes the door',
    public.keel_free_signup_available() = false);
  perform pg_temp.assert_true('ADV-7b and is NOT solvent (status is checked first)',
    public.keel_coach_is_solvent(v_house) = false);
  update public.coaches set status='active' where id=v_house;
end; $$;

rollback;
