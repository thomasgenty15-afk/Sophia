-- ============================================================================
-- PIVOT NUTRITION — P0.2: test des tables manquantes créées par
-- `20260803031000_pivot_nutrition_tables.sql`.
--
-- MANUAL. Se lance à la main contre la base LOCALE, après `npx supabase db reset`.
-- Script psql, pas un test deno: l'objet sous test est le moteur de contraintes
-- de Postgres (CHECK, index uniques partiels, policies RLS). Un client qui
-- contourne `set local role` ne testerait rien.
--
--   docker cp supabase/functions/_shared/keel/pivot_nutrition_tables_test.sql \
--     supabase_db_Sophia_2:/tmp/pivot_nutrition_tables_test.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -f /tmp/pivot_nutrition_tables_test.sql
--
-- Tout tourne dans UNE transaction qui finit par ROLLBACK: la base est laissée
-- exactement telle qu'on l'a trouvée. Rien ici n'est une fixture pour un autre
-- test.
--
-- CE QUI EST ASSERTÉ (chaque ligne est un invariant qui, s'il tombe, casse une
-- promesse produit nommée — pas une vérification cosmétique de schéma):
--
--   §1  Les 5 tables existent, RLS ACTIVÉE sur les 5.
--   §2  Les 5 crons B2C sont déprogrammés (le plus urgent envoie de vrais emails).
--   §3  student_facts REFUSE une contrainte dure (allergy/intolerance/medical/
--       religious/diet_constraint) -> une seule source de vérité pour ce qui
--       peut blesser (§7.3-6). C'est l'assertion la plus importante du fichier.
--   §4  student_safety_constraints accepte toujours cette même allergie -> le
--       chemin dur n'a pas été cassé en fermant le chemin souple.
--   §5  coach_doctrines: UNE seule version publiée par coach (index unique
--       partiel). Sinon "quelle doctrine s'applique au prochain message ?"
--       n'a pas de réponse déterministe.
--   §6  coach_doctrines: deux BROUILLONS coexistent (l'index ne doit pas
--       empêcher de préparer la v2 pendant que la v1 tourne).
--   §7  recurring_meals: 'active' EXIGE confirmed_at -> le système ne peut pas
--       se confirmer lui-même un "ton petit-déj habituel ?" jamais validé.
--   §8  coach_syntheses: idempotence (coach, kind, période) -> un cron qui
--       repasse ne crée pas une 2e synthèse (classe "doublon = race").
--   §9  RLS: le coach A ne lit PAS la doctrine ni la cohorte du coach B.
--   §10 RLS: le coach ne lit PAS les recurring_meals/student_facts de SON
--       élève (§1.5 "l'adhérence, jamais le journal intime"): la valeur
--       remonte par l'agrégat coach_syntheses, pas ligne à ligne.
--   §11 RLS: l'élève lit SES faits, et pas ceux d'un autre élève.
--   §12 updated_at bouge tout seul sur UPDATE (les 4 triggers).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helpers (disparaissent avec le rollback).
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

create or replace function pg_temp.assert_true(label text, got boolean)
returns void language plpgsql as $$
begin
  if got is not true then
    raise exception 'FAIL % : got %, want true', label, coalesce(got::text, 'null');
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Un helper qui exige qu'une écriture ÉCHOUE. Le piège classique: écrire un
-- test qui passe parce que l'insertion a réussi pour une autre raison. Ici on
-- capture l'erreur et on vérifie qu'il y en a bien eu une.
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
                     json_build_object('sub', who, 'role', 'authenticated')::text,
                     true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.become_service()
returns void language plpgsql as $$
begin
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Herméticité vis-à-vis des voisins (leçon du fichier tenancy_rls_test.sql:
-- un test de référence doit échouer sur le modèle, jamais sur le voisinage).
-- Les uuid choisis sont préfixés `f1` pour ne PAS collisionner avec ceux de
-- tenancy_rls_test.sql (`aaaaaaaa-…`), qui sont l'aimant à collision du dépôt.
-- ---------------------------------------------------------------------------
delete from public.coach_clients where student_user_id in (
  'f1000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000004');
delete from public.coaches where user_id in (
  'f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('f1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','pivot.coach.a@example.com','x', now(), now(), now(), '{}', '{}'),
  ('f1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','pivot.coach.b@example.com','x', now(), now(), now(), '{}', '{}'),
  ('f1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','pivot.student.a@example.com','x', now(), now(), now(), '{}', '{}'),
  ('f1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','pivot.student.b@example.com','x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.coaches (id, user_id, display_name, status) values
  ('f1a00000-0000-0000-0000-0000000000aa','f1000000-0000-0000-0000-000000000001','Pivot Coach A','active'),
  ('f1b00000-0000-0000-0000-0000000000bb','f1000000-0000-0000-0000-000000000002','Pivot Coach B','active')
on conflict (id) do nothing;

-- Élève A rattaché au coach A, consentement donné (seat facturable).
insert into public.coach_clients
  (coach_id, student_user_id, invited_email, status, consent_granted_at)
values
  ('f1a00000-0000-0000-0000-0000000000aa','f1000000-0000-0000-0000-000000000003',
   'pivot.student.a@example.com','active', now())
on conflict do nothing;

-- ===========================================================================
-- §1 — Les 5 tables existent et RLS est ACTIVÉE sur les 5
-- ===========================================================================
select pg_temp.assert_eq('§1 les 5 tables du pivot existent',
  (select count(*) from information_schema.tables
   where table_schema = 'public'
     and table_name in ('cohorts','coach_doctrines','coach_syntheses',
                        'recurring_meals','student_facts')), 5);

select pg_temp.assert_eq('§1 RLS activée sur les 5',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('cohorts','coach_doctrines','coach_syntheses',
                       'recurring_meals','student_facts')
     and c.relrowsecurity), 5);

select pg_temp.assert_eq('§1 coach_clients.cohort_id ajoutée',
  (select count(*) from information_schema.columns
   where table_name = 'coach_clients' and column_name = 'cohort_id'), 1);

-- ===========================================================================
-- §2 — Les 5 crons B2C sont déprogrammés
-- ===========================================================================
select pg_temp.assert_eq('§2 crons B2C déprogrammés',
  (select count(*) from cron.job where jobname in (
    'trigger-retention-emails','process-whatsapp-optin-recovery',
    'reseed-recurring-reminders','trigger-watcher-batch','keel-arm-cards')), 0);

-- Et le contre-test qui prouve qu'on n'a pas tout cassé: les jobs moteur
-- restent planifiés. Un "0 partout" passerait le test ci-dessus pour la pire
-- des raisons.
select pg_temp.assert_eq('§2 les crons moteur sont INTACTS',
  (select count(*) from cron.job where jobname in (
    'process-whatsapp-outbound-retries','process-llm-retry-jobs',
    'keel-provision-day','trigger-memorizer-daily','purge-deleted-accounts',
    'process-checkins')), 6);

-- ===========================================================================
-- §3 — student_facts REFUSE toute contrainte dure  (L'ASSERTION CENTRALE)
-- ===========================================================================
select pg_temp.assert_rejects('§3 student_facts refuse kind=allergy', $q$
  insert into public.student_facts (user_id, kind, value, content_locale)
  values ('f1000000-0000-0000-0000-000000000003','allergy',
          '{"label":"peanut"}'::jsonb,'en')
$q$);

select pg_temp.assert_rejects('§3 student_facts refuse kind=intolerance', $q$
  insert into public.student_facts (user_id, kind, value, content_locale)
  values ('f1000000-0000-0000-0000-000000000003','intolerance',
          '{"label":"lactose"}'::jsonb,'en')
$q$);

select pg_temp.assert_rejects('§3 student_facts refuse kind=diet_constraint', $q$
  insert into public.student_facts (user_id, kind, value, content_locale)
  values ('f1000000-0000-0000-0000-000000000003','diet_constraint',
          '{"label":"halal"}'::jsonb,'en')
$q$);

-- ... mais accepte bien la couche souple.
insert into public.student_facts (user_id, kind, value, note, content_locale)
values ('f1000000-0000-0000-0000-000000000003','aversion',
        '{"label":"brocoli","food_group_ref":"cruciferous_veg"}'::jsonb,
        'dit "je deteste ca depuis gamin"','fr-FR');
select pg_temp.assert_eq('§3 student_facts accepte la couche souple',
  (select count(*) from public.student_facts
   where user_id = 'f1000000-0000-0000-0000-000000000003' and kind = 'aversion'), 1);

-- Gouvernance §3.4: une correction INVALIDE, elle n'écrase pas.
select pg_temp.assert_rejects('§3 invalidated exige invalidated_at', $q$
  update public.student_facts set status = 'invalidated'
  where user_id = 'f1000000-0000-0000-0000-000000000003' and kind = 'aversion'
$q$);

-- ===========================================================================
-- §4 — Le chemin DUR n'a pas été cassé en fermant le chemin souple
-- ===========================================================================
insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, severity, declared_by, content_locale)
values ('f1000000-0000-0000-0000-000000000003','allergy','peanut','medical','student','en');
select pg_temp.assert_eq('§4 l''allergie va bien dans student_safety_constraints',
  (select count(*) from public.student_safety_constraints
   where user_id = 'f1000000-0000-0000-0000-000000000003'
     and allergen_ref = 'peanut' and severity = 'medical'), 1);

-- ===========================================================================
-- §5/§6 — coach_doctrines: une seule PUBLIÉE, plusieurs BROUILLONS
-- ===========================================================================
insert into public.coach_doctrines
  (coach_id, version, content_locale, forbidden, published_at)
values ('f1a00000-0000-0000-0000-0000000000aa', 1, 'en',
        '[{"token":"six_small_meals","surface_forms":["6 petits repas","six small meals"]}]'::jsonb,
        now());

select pg_temp.assert_rejects('§5 une SEULE doctrine publiée par coach', $q$
  insert into public.coach_doctrines (coach_id, version, content_locale, published_at)
  values ('f1a00000-0000-0000-0000-0000000000aa', 2, 'en', now())
$q$);

insert into public.coach_doctrines (coach_id, version, content_locale) values
  ('f1a00000-0000-0000-0000-0000000000aa', 2, 'en'),
  ('f1a00000-0000-0000-0000-0000000000aa', 3, 'en');
select pg_temp.assert_eq('§6 deux brouillons coexistent avec la publiée',
  (select count(*) from public.coach_doctrines
   where coach_id = 'f1a00000-0000-0000-0000-0000000000aa' and published_at is null), 2);

select pg_temp.assert_rejects('§6 (coach, version) reste unique', $q$
  insert into public.coach_doctrines (coach_id, version, content_locale)
  values ('f1a00000-0000-0000-0000-0000000000aa', 2, 'en')
$q$);

-- ===========================================================================
-- §7 — recurring_meals: 'active' EXIGE une confirmation datée
-- ===========================================================================
select pg_temp.assert_rejects('§7 recurring_meals active sans confirmed_at', $q$
  insert into public.recurring_meals (user_id, label, content_locale, status)
  values ('f1000000-0000-0000-0000-000000000003','petit-dej habituel','fr-FR','active')
$q$);

insert into public.recurring_meals
  (user_id, label, content_locale, status, slot_key, canonical_items, confirmed_at)
values ('f1000000-0000-0000-0000-000000000003','petit-dej habituel','fr-FR','active',
        'breakfast','[{"name":"skyr"},{"name":"myrtilles","food_group_ref":"berries"}]'::jsonb,
        now());
select pg_temp.assert_eq('§7 recurring_meals active AVEC confirmed_at',
  (select count(*) from public.recurring_meals
   where user_id = 'f1000000-0000-0000-0000-000000000003' and status = 'active'), 1);

-- Le candidat par défaut n'a pas besoin de confirmation (c'est le point:
-- la consolidation nocturne PROPOSE, elle ne confirme pas).
insert into public.recurring_meals (user_id, label, content_locale, slot_key)
values ('f1000000-0000-0000-0000-000000000003','dejeuner cantine','fr-FR','lunch');
select pg_temp.assert_eq('§7 candidate par défaut, sans confirmation',
  (select count(*) from public.recurring_meals
   where user_id = 'f1000000-0000-0000-0000-000000000003' and status = 'candidate'), 1);

-- ===========================================================================
-- §8 — coach_syntheses: idempotence de la période
-- ===========================================================================
insert into public.cohorts (id, coach_id, label, content_locale, status, starts_on, duration_weeks)
values ('f1c00000-0000-0000-0000-0000000000cc','f1a00000-0000-0000-0000-0000000000aa',
        'Challenge 8 semaines - septembre','fr-FR','running', current_date, 8);

insert into public.coach_syntheses
  (coach_id, cohort_id, kind, period_start, period_end, content_locale, metrics)
values ('f1a00000-0000-0000-0000-0000000000aa','f1c00000-0000-0000-0000-0000000000cc',
        'weekly', current_date - 7, current_date - 1, 'fr-FR',
        '{"active_students":1,"sliding":0,"silent":0}'::jsonb);

select pg_temp.assert_rejects('§8 pas deux synthèses pour la même période', $q$
  insert into public.coach_syntheses
    (coach_id, kind, period_start, period_end, content_locale)
  values ('f1a00000-0000-0000-0000-0000000000aa','weekly',
          current_date - 7, current_date - 1, 'fr-FR')
$q$);

select pg_temp.assert_rejects('§8 période inversée refusée', $q$
  insert into public.coach_syntheses
    (coach_id, kind, period_start, period_end, content_locale)
  values ('f1a00000-0000-0000-0000-0000000000aa','weekly',
          current_date, current_date - 7, 'fr-FR')
$q$);

-- Execution truth: généré ≠ livré.
select pg_temp.assert_eq('§8 une synthèse générée n''est pas "livrée"',
  (select count(*) from public.coach_syntheses
   where coach_id = 'f1a00000-0000-0000-0000-0000000000aa' and delivered_at is null), 1);

-- ===========================================================================
-- §9 — RLS: cloisonnement entre coachs
-- ===========================================================================
select pg_temp.become('f1000000-0000-0000-0000-000000000001');  -- coach A

select pg_temp.assert_eq('§9 coach A lit SA doctrine',
  (select count(*) from public.coach_doctrines), 3);
select pg_temp.assert_eq('§9 coach A lit SA cohorte',
  (select count(*) from public.cohorts), 1);
select pg_temp.assert_eq('§9 coach A lit SA synthèse',
  (select count(*) from public.coach_syntheses), 1);

select pg_temp.become('f1000000-0000-0000-0000-000000000002');  -- coach B

select pg_temp.assert_eq('§9 coach B ne lit PAS la doctrine de A',
  (select count(*) from public.coach_doctrines), 0);
select pg_temp.assert_eq('§9 coach B ne lit PAS la cohorte de A',
  (select count(*) from public.cohorts), 0);
select pg_temp.assert_eq('§9 coach B ne lit PAS la synthèse de A',
  (select count(*) from public.coach_syntheses), 0);

-- Le coach ne peut pas écrire sa propre synthèse (sinon il maquille un
-- rapport de complétion vendu à la cohorte suivante).
select pg_temp.become('f1000000-0000-0000-0000-000000000001');
select pg_temp.assert_rejects('§9 le coach ne PEUT PAS écrire une synthèse', $q$
  insert into public.coach_syntheses
    (coach_id, kind, period_start, period_end, content_locale)
  values ('f1a00000-0000-0000-0000-0000000000aa','weekly',
          current_date - 21, current_date - 15, 'fr-FR')
$q$);

-- ===========================================================================
-- §10 — RLS: "l'adhérence, jamais le journal intime" (§1.5)
-- Le coach A est bien le coach de l'élève A (lien 'active', consenti) — et il
-- ne voit malgré tout NI ses repas récurrents NI ses préférences.
-- ===========================================================================
select pg_temp.assert_eq('§10 le lien coach->élève est bien actif',
  (select count(*) from public.coach_clients
   where student_user_id = 'f1000000-0000-0000-0000-000000000003'
     and status = 'active'), 1);

select pg_temp.assert_eq('§10 le coach ne lit PAS recurring_meals de son élève',
  (select count(*) from public.recurring_meals), 0);
select pg_temp.assert_eq('§10 le coach ne lit PAS student_facts de son élève',
  (select count(*) from public.student_facts), 0);

-- ===========================================================================
-- §11 — RLS: l'élève lit les SIENS, et rien d'autre
-- ===========================================================================
select pg_temp.become('f1000000-0000-0000-0000-000000000003');  -- élève A
select pg_temp.assert_eq('§11 élève A lit SES repas récurrents',
  (select count(*) from public.recurring_meals), 2);
select pg_temp.assert_eq('§11 élève A lit SES faits',
  (select count(*) from public.student_facts), 1);

select pg_temp.become('f1000000-0000-0000-0000-000000000004');  -- élève B
select pg_temp.assert_eq('§11 élève B ne lit PAS les repas de A',
  (select count(*) from public.recurring_meals), 0);
select pg_temp.assert_eq('§11 élève B ne lit PAS les faits de A',
  (select count(*) from public.student_facts), 0);

-- ===========================================================================
-- §12 — updated_at bouge tout seul (les 4 triggers)
-- ===========================================================================
select pg_temp.become_service();

update public.cohorts set updated_at = timestamptz '2000-01-01'
  where id = 'f1c00000-0000-0000-0000-0000000000cc';
update public.cohorts set label = 'Challenge 8 semaines - octobre'
  where id = 'f1c00000-0000-0000-0000-0000000000cc';
select pg_temp.assert_true('§12 cohorts.updated_at rafraîchi par trigger',
  (select updated_at > timestamptz '2020-01-01' from public.cohorts
   where id = 'f1c00000-0000-0000-0000-0000000000cc'));

update public.student_facts set updated_at = timestamptz '2000-01-01'
  where user_id = 'f1000000-0000-0000-0000-000000000003';
update public.student_facts set note = 'corrigé'
  where user_id = 'f1000000-0000-0000-0000-000000000003';
select pg_temp.assert_true('§12 student_facts.updated_at rafraîchi par trigger',
  (select bool_and(updated_at > timestamptz '2020-01-01') from public.student_facts
   where user_id = 'f1000000-0000-0000-0000-000000000003'));

select pg_temp.assert_eq('§12 les 4 triggers updated_at existent',
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and c.relname in ('cohorts','coach_doctrines','recurring_meals','student_facts')
     and t.tgname like '%_set_updated_at'), 4);

rollback;

-- Si vous lisez cette ligne sans exception au-dessus: tout est PASS.
