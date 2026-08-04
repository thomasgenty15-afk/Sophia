-- ============================================================================
-- PIVOT NUTRITION — N0: le socle du plan élève.
--
-- MANUEL. Contre la base LOCALE, après `npx supabase db reset`.
--   docker cp supabase/functions/_shared/keel/student_week_plan_test.sql \
--     supabase_db_Sophia_2:/tmp/swp.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/swp.sql
--
-- Tout dans UNE transaction qui finit par ROLLBACK.
--
-- L'ASSERTION QUI PORTE LE PRODUIT (§3):
--   une ligne `nutrition` sans référence au programme du coach est REFUSÉE par
--   la base. C'est la règle « Sophia n'invente pas de contenu alimentaire »
--   rendue structurelle: elle tient pour l'edge function, pour une reprise
--   manuelle et pour un backfill, alors qu'un test ne protège que le chemin
--   qu'il exerce.
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

create or replace function pg_temp.assert_rejects(label text, stmt text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS % (rejected: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % : the write SUCCEEDED but should have been rejected', label;
end;
$$;

create or replace function pg_temp.become(who uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Voisinage: uuid préfixés `9a` (N0), hors des aimants à collision du dépôt.
delete from public.coach_clients where student_user_id in
  ('9a000000-0000-4000-8000-000000000011','9a000000-0000-4000-8000-000000000012');
delete from public.coaches where user_id = '9a000000-0000-4000-8000-000000000001';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('9a000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','n0.coach@example.com','x',now(),now(),now(),'{}','{}'),
  ('9a000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','n0.julie@example.com','x',now(),now(),now(),'{}','{}'),
  ('9a000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000000'::uuid,
   'authenticated','authenticated','n0.paul@example.com','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;

insert into public.coaches (id, user_id, display_name, status)
values ('9ac00000-0000-4000-8000-0000000000aa','9a000000-0000-4000-8000-000000000001','Marc','active')
on conflict (id) do nothing;

insert into public.coach_clients (coach_id, student_user_id, invited_email, status, consent_granted_at)
values ('9ac00000-0000-4000-8000-0000000000aa','9a000000-0000-4000-8000-000000000011',
        'n0.julie@example.com','active', now())
on conflict do nothing;

-- ===========================================================================
-- §1 — les 3 tables + la vue, RLS activée
-- ===========================================================================
select pg_temp.assert_eq('§1 les 3 tables existent',
  (select count(*) from information_schema.tables where table_schema='public'
   and table_name in ('student_goals','student_week_plans','student_daily_checkins')), 3);

select pg_temp.assert_eq('§1 RLS activée sur les 3',
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relrowsecurity
   and c.relname in ('student_goals','student_week_plans','student_daily_checkins')), 3);

select pg_temp.assert_eq('§1 la vue Tier B existe',
  (select count(*) from information_schema.views
   where table_schema='public' and table_name='coach_student_pulse'), 1);

-- ===========================================================================
-- §2 — LA RÈGLE D'AUTORITÉ (l'assertion centrale)
-- ===========================================================================
select pg_temp.assert_rejects('§2 ligne nutrition SANS source coach refusée', $q$
  insert into public.student_week_plans (user_id, week_start, content_locale, items)
  values ('9a000000-0000-4000-8000-000000000011','2026-08-03','fr-FR',
    '[{"kind":"nutrition","label":"3 dîners riches en protéines","days":["mon","wed","fri"]}]'::jsonb)
$q$);

select pg_temp.assert_rejects('§2 source_belief_key null refusée aussi', $q$
  insert into public.student_week_plans (user_id, week_start, content_locale, items)
  values ('9a000000-0000-4000-8000-000000000011','2026-08-03','fr-FR',
    '[{"kind":"nutrition","label":"x","source_belief_key":null}]'::jsonb)
$q$);

-- L'ANCIEN nom du champ ne trace plus rien, et il faut que ça se voie.
-- La migration C1 a déplacé l'ancre du PROGRAMME (source_commitment_key) vers
-- la DOCTRINE (source_belief_key). Ce fichier avait gardé l'ancien nom: la
-- ligne « tracée » ci-dessous était refusée par le nouveau CHECK, la
-- transaction s'abandonnait, et TOUTES les assertions suivantes (§2 kind, §2
-- adopted, §3, §4, §5 RLS) étaient silencieusement sautées. Un fichier de test
-- qui s'arrête à sa cinquième ligne en affichant des PASS est pire qu'absent.
select pg_temp.assert_rejects('§2 l''ANCIENNE clé programme ne trace plus rien', $q$
  insert into public.student_week_plans (user_id, week_start, content_locale, items)
  values ('9a000000-0000-4000-8000-000000000011','2026-08-03','fr-FR',
    '[{"kind":"nutrition","label":"x","source_commitment_key":"protein_dinner"}]'::jsonb)
$q$);

-- ... et la ligne TRACÉE passe.
insert into public.student_week_plans (user_id, week_start, content_locale, items, generated_from)
values ('9a000000-0000-4000-8000-000000000011','2026-08-03','fr-FR',
  '[{"kind":"nutrition","label":"3 dîners riches en protéines",
     "source_belief_key":"protein_dinner","days":["mon","wed","fri"]},
    {"kind":"action","label":"20 min de marche après le déjeuner","days":["mon","tue"]}]'::jsonb,
  '{"doctrine_version":1,"goal":"fat_loss"}'::jsonb);

select pg_temp.assert_eq('§2 ligne nutrition TRACÉE acceptée, + action sans source',
  (select jsonb_array_length(items) from public.student_week_plans
   where user_id='9a000000-0000-4000-8000-000000000011'), 2);

select pg_temp.assert_rejects('§2 un kind inconnu est refusé', $q$
  insert into public.student_week_plans (user_id, week_start, content_locale, items)
  values ('9a000000-0000-4000-8000-000000000012','2026-08-03','fr-FR',
    '[{"kind":"prescription","label":"x"}]'::jsonb)
$q$);

select pg_temp.assert_rejects('§2 adopted exige adopted_at', $q$
  update public.student_week_plans set status='adopted'
  where user_id='9a000000-0000-4000-8000-000000000011'
$q$);

-- ===========================================================================
-- §3 — le plan de l'élève N'ENTRE PAS dans l'évaluateur
-- ===========================================================================
-- Aucune FK de student_week_plans vers plan_commitments/plan_versions: c'est
-- ce qui garantit structurellement que l'évaluateur ne peut pas le voir.
select pg_temp.assert_eq('§3 aucune FK vers la couche prescription',
  (select count(*) from pg_constraint c
   join pg_class src on src.oid=c.conrelid
   join pg_class tgt on tgt.oid=c.confrelid
   where c.contype='f' and src.relname='student_week_plans'
     and tgt.relname in ('plan_commitments','plan_versions','commitment_evaluations')), 0);

-- ===========================================================================
-- §4 — le tap: cohérence de l'axe et idempotence
-- ===========================================================================
select pg_temp.assert_rejects('§4 un bon jour ne porte pas d''axe', $q$
  insert into public.student_daily_checkins (user_id, local_date, overall, axis)
  values ('9a000000-0000-4000-8000-000000000011','2026-08-03','good','hunger')
$q$);

insert into public.student_daily_checkins (user_id, local_date, overall)
values ('9a000000-0000-4000-8000-000000000011','2026-08-03','good');
insert into public.student_daily_checkins (user_id, local_date, overall, axis)
values ('9a000000-0000-4000-8000-000000000011','2026-08-04','hard','hunger');

select pg_temp.assert_rejects('§4 un seul tap par jour (idempotence du bouton)', $q$
  insert into public.student_daily_checkins (user_id, local_date, overall)
  values ('9a000000-0000-4000-8000-000000000011','2026-08-03','mixed')
$q$);

select pg_temp.assert_eq('§4 deux jours enregistrés',
  (select count(*) from public.student_daily_checkins
   where user_id='9a000000-0000-4000-8000-000000000011'), 2);

-- ===========================================================================
-- §5 — weekly_reviews écrivable SANS plan_version (le modèle 1:N)
-- ===========================================================================
insert into public.weekly_reviews (user_id, week_start_date, content_locale, biofeedback)
values ('9a000000-0000-4000-8000-000000000011','2026-08-03','fr-FR',
        '{"hunger":3,"energy":4,"sleep":2,"digestion":4,"satiety":3,"stress":3}'::jsonb);
select pg_temp.assert_eq('§5 point hebdo écrit sans plan_version_id',
  (select count(*) from public.weekly_reviews
   where user_id='9a000000-0000-4000-8000-000000000011' and plan_version_id is null), 1);

-- ===========================================================================
-- §6 — RLS: l'élève écrit SES lignes, et ne voit pas celles des autres
-- ===========================================================================
select pg_temp.become('9a000000-0000-4000-8000-000000000011');
select pg_temp.assert_eq('§6 élève lit SON plan',
  (select count(*) from public.student_week_plans), 1);
select pg_temp.assert_eq('§6 élève lit SES taps',
  (select count(*) from public.student_daily_checkins), 2);

select pg_temp.become('9a000000-0000-4000-8000-000000000012');
select pg_temp.assert_eq('§6 un autre élève ne voit rien',
  (select count(*) from public.student_week_plans), 0);
select pg_temp.assert_eq('§6 ni ses taps',
  (select count(*) from public.student_daily_checkins), 0);

-- ===========================================================================
-- §7 — le COACH voit l'agrégat, jamais le détail par jour (§1.5)
-- ===========================================================================
select pg_temp.become('9a000000-0000-4000-8000-000000000001');

select pg_temp.assert_eq('§7 le coach ne lit PAS les taps ligne à ligne',
  (select count(*) from public.student_daily_checkins), 0);

select pg_temp.assert_eq('§7 mais il voit la semaine agrégée',
  (select days_good + days_hard from public.coach_student_pulse
   where student_user_id='9a000000-0000-4000-8000-000000000011'), 2);

select pg_temp.assert_eq('§7 avec l''axe dominant des mauvais jours',
  (select count(*) from public.coach_student_pulse
   where student_user_id='9a000000-0000-4000-8000-000000000011'
     and dominant_axis='hunger'), 1);

select pg_temp.assert_eq('§7 le coach ne lit PAS le plan de son élève',
  (select count(*) from public.student_week_plans), 0);

rollback;
