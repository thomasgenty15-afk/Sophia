-- ===========================================================================
-- KEEL QA — RECETTE : 1 COACH + JUSQU'À 3 ÉLÈVES, PARAMÉTRÉE PAR TAG
-- ===========================================================================
-- Chaque agent de la campagne fabrique SA cohorte avec son propre tag, ce qui
-- garantit qu'il ne partage jamais un coach avec un autre agent (donc jamais le
-- plafond de 3 sièges d'un voisin).
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v tag=a3 -v nstudents=3 -v locale="'fr-FR'" -v tz="'Europe/Paris'" -v country="'FR'" \
--     < docs/keel/qa-fixtures/10-make-coach-cohort.sql
--
-- Paramètres (tous obligatoires) :
--   tag        identifiant court de l'agent, [a-z0-9]+  (ex: a3)
--   nstudents  1, 2 ou 3   — JAMAIS plus : `trial_seat_limit` = 3
--   locale     'fr-FR' ou 'en-GB'   (guillemets simples INCLUS, voir ci-dessus)
--   tz         'Europe/Paris', 'Europe/London', ...
--   country    'FR', 'GB', ...      (ISO-3166 alpha-2, majuscules)
--
-- Fabrique :
--   coach   qa0805.<tag>.coach@keeltest.dev   (actif, humain, SANS doctrine)
--   élèves  qa0805.<tag>.s1@keeltest.dev … s3 (actifs, consentement posé)
-- Mot de passe partout : 1234567
--
-- Pour publier une doctrine sur ce coach :
--   ... -v tag=a3 < docs/keel/qa-fixtures/20-publish-doctrine.sql
--
-- Pour supprimer la cohorte :
--   delete from auth.users where email like 'qa0805.<tag>.%@keeltest.dev';
--
-- Idempotent : relancer avec le même tag repart d'une cohorte propre.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

-- Neutralise le mail de bienvenue (EMAIL_DELIVERY_ENABLED=1 en local + vraie
-- clé Resend). Restauré plus bas, dans la MÊME transaction.
create temporary table _qa_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;
update public.app_config set value = '' where key = 'edge_functions_anon_key';

-- Garde-fou : le plafond d'essai est 3, on refuse d'écrire au-delà.
-- La valeur transite par une table temporaire : psql n'interpole PAS ses
-- variables à l'intérieur d'un bloc dollar-quoté.
create temporary table _qa_n on commit drop as select (:nstudents)::int as n;
do $$
begin
  if (select n from _qa_n) not between 1 and 3 then
    raise exception 'nstudents doit valoir 1, 2 ou 3 (plafond trial_seat_limit=3), reçu %',
      (select n from _qa_n);
  end if;
end $$;

-- ---------------------------------------------------------------- nettoyage
delete from auth.users where email like 'qa0805.' || :'tag' || '.%@keeltest.dev';

-- ---------------------------------------------------------------- identités
-- UUID déterministes dérivés du tag : deux agents ne peuvent pas collisionner,
-- et un même agent retrouve ses ids d'un run à l'autre.
create temporary table _qa_ids on commit drop as
select
  md5('qa0805:' || :'tag' || ':coach')::uuid   as coach_user_id,
  md5('qa0805:' || :'tag' || ':coachrow')::uuid as coach_id,
  md5('qa0805:' || :'tag' || ':s1')::uuid       as s1,
  md5('qa0805:' || :'tag' || ':s2')::uuid       as s2,
  md5('qa0805:' || :'tag' || ':s3')::uuid       as s3;

create temporary table _qa_people on commit drop as
select i.coach_user_id as id, 'qa0805.' || :'tag' || '.coach@keeltest.dev' as email,
       'Coach ' || upper(:'tag') as name, 'coach' as kind, 0 as rank from _qa_ids i
union all select i.s1, 'qa0805.' || :'tag' || '.s1@keeltest.dev', 'Student ' || upper(:'tag') || '-1', 'student', 1 from _qa_ids i
union all select i.s2, 'qa0805.' || :'tag' || '.s2@keeltest.dev', 'Student ' || upper(:'tag') || '-2', 'student', 2 from _qa_ids i
union all select i.s3, 'qa0805.' || :'tag' || '.s3@keeltest.dev', 'Student ' || upper(:'tag') || '-3', 'student', 3 from _qa_ids i;

delete from _qa_people where rank > :nstudents;

-- ---------------------------------------------------------------- comptes auth
-- Les colonnes de jeton sont '' et JAMAIS NULL : GoTrue les scanne dans des
-- `string` Go non-nullables, un NULL rend le compte impossible à connecter
-- (HTTP 500 « Database error querying schema »).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       p.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', p.name), now(), now(),
       '', '', '', '', '', '', '', ''
from _qa_people p;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), p.id, p.id::text, 'email',
       jsonb_build_object('sub', p.id::text, 'email', p.email, 'email_verified', true),
       now(), now()
from _qa_people p;

-- ---------------------------------------------------------------- coach
insert into public.coaches (id, user_id, display_name, status, credential_type, coach_kind, trial_seat_limit)
select i.coach_id, i.coach_user_id, 'Coach ' || upper(:'tag'), 'active', 'certified_coach', 'human', 3
from _qa_ids i;

update public.profiles p set
  keel_role='coach', full_name='Coach ' || upper(:'tag'),
  locale=:locale, timezone=:tz, country=:country, onboarding_completed=true
from _qa_ids i where p.id = i.coach_user_id;

-- ---------------------------------------------------------------- rattachements
-- LE CHEMIN CANONIQUE. `keel_attach_student_to_coach` pose status='active' ET
-- consent_granted_at=now() dans la même écriture : le CHECK
-- `coach_clients_active_requires_consent` ne peut pas être violé. Un INSERT
-- direct avec status='active' sans consentement, lui, échoue.
select public.keel_attach_student_to_coach(p.id, i.coach_id, p.email, :country)
from _qa_people p, _qa_ids i
where p.kind = 'student'
order by p.rank;

update public.profiles p set
  keel_role='student', full_name=q.name, locale=:locale, timezone=:tz,
  country=:country, onboarding_completed=true, account_status='active'
from _qa_people q where p.id = q.id and q.kind='student';

-- ---------------------------------------------------------------- objectifs
insert into public.student_goals (user_id, goal, situation, practical_constraints, content_locale)
select p.id,
       (array['fat_loss','muscle_gain','health'])[p.rank],
       'QA fixture cohort ' || :'tag',
       '{"eating_rhythm":["breakfast","lunch","dinner"],"cooks":true}'::jsonb,
       :locale
from _qa_people p where p.kind='student'
on conflict (user_id) do update set goal = excluded.goal;

-- ---------------------------------------------------------------- restauration
update public.app_config a set value = k.value from _qa_anon_key k
 where a.key = 'edge_functions_anon_key';

-- ---------------------------------------------------------------- contrôle
select p.email, p.id as user_id, pr.keel_role, pr.timezone, pr.country, pr.locale,
       cc.status, (cc.consent_granted_at is not null) as consent
from _qa_people p
join public.profiles pr on pr.id = p.id
left join public.coach_clients cc on cc.student_user_id = p.id and cc.status in ('invited','active')
order by p.rank;

commit;
