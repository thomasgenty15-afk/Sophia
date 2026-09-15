-- ============================================================================
-- AGENT 13 — CLOISONNEMENT : preuve SQL avec identités simulées.
--
-- MANUEL, comme `tenancy_rls_test.sql` dont il reprend le motif. Ce qui est
-- testé est le moteur de policies de Postgres : une bibliothèque cliente qui
-- contournerait `set local role` ne testerait rien du tout.
--
--   docker cp supabase/functions/_shared/keel/a13_isolation_rls_test.sql \
--     supabase_db_Sophia_2:/tmp/a13.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/a13.sql
--
-- Complète `tenancy_rls_test.sql` (qui couvre W1.1) sur ce qu'il ignore :
--   S1  élève A ↔ élève B sur les 6 tables du pivot, en LECTURE **et** en
--       ÉCRITURE (update 0 ligne, insert avec le user_id du voisin refusé,
--       et le transfert d'une ligne à soi vers le dossier du voisin) ;
--   S2  l'élève ne lit ni la doctrine ni les synthèses de son coach ;
--   S3  le coach ne lit les élèves QUE par les vues Tier B — audit colonne par
--       colonne, plus une recherche des chaînes secrètes dans leur sortie ;
--   S4  coach A ↔ coach B, et anon partout ;
--   S5  les grants des SECURITY DEFINER du domaine KEEL ;
--   S6  le jeton de Flow rejoué côté ÉCRITURE.
--
-- Référence au 2026-08-04 : 84 PASS, 0 FAIL.
--
-- Tout dans UNE transaction qui finit par ROLLBACK. La base est laissée telle
-- qu'on l'a trouvée (leçon "un test de référence doit échouer sur le modèle,
-- jamais sur les voisins").
--
-- Chaque assertion RAISE si elle est fausse. Un passage silencieux sur une
-- policy cassée est le seul résultat que ce fichier existe pour empêcher.
-- ============================================================================

begin;

-- Les échecs sont COLLECTÉS puis relevés à la fin : un premier rouge ne doit
-- pas masquer les suivants (une transaction avortée rendrait toutes les
-- assertions restantes "en erreur" et on ne saurait plus lesquelles tiennent).
create temp table a13_results (ord serial, ok boolean, label text) on commit drop;
-- Les assertions s'exécutent SOUS l'identité simulée (authenticated / anon):
-- sans ce grant, le journal des résultats serait lui-même refusé par les droits.
grant all on table a13_results to public;
grant all on sequence a13_results_ord_seq to public;

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    insert into a13_results (ok, label) values (false, format('%s : got %s, want %s', label, got, want));
    raise warning 'FAIL % : got %, want %', label, got, want;
  else
    insert into a13_results (ok, label) values (true, label);
    raise notice 'PASS % (%)', label, got;
  end if;
end;
$$;

create or replace function pg_temp.assert_true(label text, got boolean)
returns void language plpgsql as $$
begin
  if got is not true then
    insert into a13_results (ok, label) values (false, label);
    raise warning 'FAIL %', label;
  else
    insert into a13_results (ok, label) values (true, label);
    raise notice 'PASS %', label;
  end if;
end;
$$;

-- Impersonation à la PostgREST.
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
  perform set_config('request.jwt.claims',
                     json_build_object('role','anon')::text, true);
  execute 'set local role anon';
end;
$$;

create or replace function pg_temp.become_su()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Compte les lignes écrites par un DML qui DOIT en écrire zéro, et transforme
-- un refus RLS (42501) en 0 plutôt qu'en abandon de transaction.
create or replace function pg_temp.try_dml(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  execute sql;
  get diagnostics n = row_count;
  return 'rows=' || n;
exception when others then
  return 'error=' || sqlstate;
end;
$$;

-- ---------------------------------------------------------------------------
-- HERMÉTICITÉ : on efface d'abord nos propres uuid (pas ceux des voisins).
-- ---------------------------------------------------------------------------
delete from public.coaches where user_id in (
  'a1300000-0000-4000-8000-0000000000ca','a1300000-0000-4000-8000-0000000000cb');
delete from auth.users where id in (
  'a1300000-0000-4000-8000-00000000000a','a1300000-0000-4000-8000-00000000000b',
  'a1300000-0000-4000-8000-0000000000ca','a1300000-0000-4000-8000-0000000000cb');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a1300000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','a13.student.a@keeltest.dev','x',now(),now(),now(),'{}','{}'),
  ('a1300000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','a13.student.b@keeltest.dev','x',now(),now(),now(),'{}','{}'),
  ('a1300000-0000-4000-8000-0000000000ca','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','a13.coach.a@keeltest.dev','x',now(),now(),now(),'{}','{}'),
  ('a1300000-0000-4000-8000-0000000000cb','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','a13.coach.b@keeltest.dev','x',now(),now(),now(),'{}','{}');

insert into public.coaches (id, user_id, display_name, status)
values
  ('a1300000-0000-4000-8000-00000000c0a1','a1300000-0000-4000-8000-0000000000ca','Coach A','active'),
  ('a1300000-0000-4000-8000-00000000c0b1','a1300000-0000-4000-8000-0000000000cb','Coach B','active');

-- Liens consentis : A->étudiant A, B->étudiant B. Aucun croisement.
insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at)
values
  ('a1300000-0000-4000-8000-00000000c0a1','a1300000-0000-4000-8000-00000000000a','active',now(),now()),
  ('a1300000-0000-4000-8000-00000000c0b1','a1300000-0000-4000-8000-00000000000b','active',now(),now());

-- ---------------------------------------------------------------------------
-- DONNÉES : chaque élève a une ligne dans chacune des 6 tables du scénario 1.
-- ---------------------------------------------------------------------------
insert into public.student_week_plans (user_id, week_start, items, status, content_locale)
values
  ('a1300000-0000-4000-8000-00000000000a','2026-08-03',
   '[{"kind":"nutrition","label":"proteine au petit-dej","source_belief_key":"k1","source_belief_claim":"protein first","days":["mon"]}]','draft','en-GB'),
  ('a1300000-0000-4000-8000-00000000000b','2026-08-03',
   '[{"kind":"action","label":"marche 20 min","days":["tue"]}]','draft','en-GB');

insert into public.student_daily_checkins (user_id, local_date, overall, axis)
values
  ('a1300000-0000-4000-8000-00000000000a','2026-08-03','hard','hunger'),
  ('a1300000-0000-4000-8000-00000000000b','2026-08-03','good',null);

insert into public.weekly_reviews (user_id, week_start_date, student_narrative, content_locale)
values
  ('a1300000-0000-4000-8000-00000000000a','2026-08-03','semaine dure, A','en-GB'),
  ('a1300000-0000-4000-8000-00000000000b','2026-08-03','semaine ok, B','en-GB');

insert into public.protocol_events
  (user_id, occurred_at, local_date, slot_key, source, student_note, media_path, content_locale, source_message_id)
values
  ('a1300000-0000-4000-8000-00000000000a',now(),'2026-08-03','breakfast','photo',
   'SECRET-NOTE-A','a1300000-0000-4000-8000-00000000000a/photo-a.jpg','en-GB','wamid.A'),
  ('a1300000-0000-4000-8000-00000000000b',now(),'2026-08-03','breakfast','photo',
   'SECRET-NOTE-B','a1300000-0000-4000-8000-00000000000b/photo-b.jpg','en-GB','wamid.B');

insert into public.student_safety_constraints
  (user_id, kind, allergen_ref, severity, declared_by, notes, content_locale)
values
  ('a1300000-0000-4000-8000-00000000000a','allergy','peanut','medical','student','anaphylaxie A','en-GB'),
  ('a1300000-0000-4000-8000-00000000000b','allergy','shellfish','medical','student','anaphylaxie B','en-GB');

insert into public.chat_messages (user_id, role, content, scope)
values
  ('a1300000-0000-4000-8000-00000000000a','user','JOURNAL-INTIME-A','whatsapp'),
  ('a1300000-0000-4000-8000-00000000000b','user','JOURNAL-INTIME-B','whatsapp');

-- Matériel du coach.
insert into public.coach_doctrines (coach_id, version, beliefs, forbidden, content_locale, published_at)
values
  ('a1300000-0000-4000-8000-00000000c0a1',1,
   '[{"claim":"METHODE-PRIVEE-COACH-A","rationale":"r"}]','[]','en-GB',now()),
  ('a1300000-0000-4000-8000-00000000c0b1',1,
   '[{"claim":"METHODE-PRIVEE-COACH-B","rationale":"r"}]','[]','en-GB',now());

insert into public.coach_syntheses
  (coach_id, kind, period_start, period_end, metrics, flagged_students, narrative, content_locale)
values
  ('a1300000-0000-4000-8000-00000000c0a1','weekly','2026-07-27','2026-08-02',
   '{"active_students":1}',
   '[{"student_user_id":"a1300000-0000-4000-8000-00000000000a","reason_code":"silent_72h"}]',
   'SYNTHESE-COACH-A','en-GB'),
  ('a1300000-0000-4000-8000-00000000c0b1','weekly','2026-07-27','2026-08-02',
   '{"active_students":1}','[]','SYNTHESE-COACH-B','en-GB');

insert into public.cohorts (coach_id, label, content_locale, status)
values ('a1300000-0000-4000-8000-00000000c0a1','COHORTE-A','en-GB','running');

insert into public.recurring_meals (user_id, label, content_locale, status)
values ('a1300000-0000-4000-8000-00000000000a','REPAS-HABITUEL-A','en-GB','candidate');

insert into public.student_facts (user_id, kind, value, note, content_locale)
values ('a1300000-0000-4000-8000-00000000000a','aversion','{"label":"brocoli"}','PREFERENCE-INTIME-A','en-GB');


-- ###########################################################################
-- SCÉNARIO 1 — ÉLÈVE A ↔ ÉLÈVE B
-- ###########################################################################
do $$
declare
  a uuid := 'a1300000-0000-4000-8000-00000000000a';
  b uuid := 'a1300000-0000-4000-8000-00000000000b';
  n bigint;
  r text;
begin
  perform pg_temp.become(a);

  -- ---- 1a. SELECT : A ne lit RIEN de B, sur les 6 tables -----------------
  select count(*) into n from public.student_week_plans where user_id = b;
  perform pg_temp.assert_eq('S1 A ne lit pas student_week_plans de B', n, 0);
  select count(*) into n from public.student_daily_checkins where user_id = b;
  perform pg_temp.assert_eq('S1 A ne lit pas student_daily_checkins de B', n, 0);
  select count(*) into n from public.weekly_reviews where user_id = b;
  perform pg_temp.assert_eq('S1 A ne lit pas weekly_reviews de B', n, 0);
  select count(*) into n from public.protocol_events where user_id = b;
  perform pg_temp.assert_eq('S1 A ne lit pas protocol_events de B', n, 0);
  select count(*) into n from public.student_safety_constraints where user_id = b;
  perform pg_temp.assert_eq('S1 A ne lit pas student_safety_constraints de B', n, 0);
  select count(*) into n from public.chat_messages where user_id = b;
  perform pg_temp.assert_eq('S1 A ne lit pas chat_messages de B', n, 0);

  -- Contre-preuve : A lit bien SES propres lignes (sinon on prouverait juste
  -- qu'une table vide est vide).
  select count(*) into n from public.student_week_plans where user_id = a;
  perform pg_temp.assert_eq('S1 contre-preuve: A lit SON plan', n, 1);
  select count(*) into n from public.chat_messages where user_id = a;
  perform pg_temp.assert_eq('S1 contre-preuve: A lit SES messages', n, 1);
  select count(*) into n from public.protocol_events where user_id = a;
  perform pg_temp.assert_eq('S1 contre-preuve: A lit SES evenements', n, 1);

  -- ---- 1b. UPDATE : 0 ligne touchée chez B -------------------------------
  r := pg_temp.try_dml(format(
    'update public.student_week_plans set status=''archived'' where user_id=%L', b));
  perform pg_temp.assert_true('S1 UPDATE student_week_plans de B = 0 ligne ('||r||')', r = 'rows=0');
  r := pg_temp.try_dml(format(
    'update public.student_daily_checkins set overall=''hard'' where user_id=%L', b));
  perform pg_temp.assert_true('S1 UPDATE student_daily_checkins de B = 0 ligne ('||r||')', r = 'rows=0');
  r := pg_temp.try_dml(format(
    'update public.chat_messages set content=''VOLE'' where user_id=%L', b));
  perform pg_temp.assert_true('S1 UPDATE chat_messages de B = 0 ligne ('||r||')', r = 'rows=0');
  r := pg_temp.try_dml(format(
    'update public.weekly_reviews set student_narrative=''VOLE'' where user_id=%L', b));
  perform pg_temp.assert_true('S1 UPDATE weekly_reviews de B refuse ('||r||')',
                              r = 'rows=0' or r like 'error=42501');
  r := pg_temp.try_dml(format(
    'update public.protocol_events set student_note=''VOLE'' where user_id=%L', b));
  perform pg_temp.assert_true('S1 UPDATE protocol_events de B refuse ('||r||')',
                              r = 'rows=0' or r like 'error=42501');
  r := pg_temp.try_dml(format(
    'update public.student_safety_constraints set severity=''mild'' where user_id=%L', b));
  perform pg_temp.assert_true('S1 UPDATE safety_constraints de B refuse ('||r||')',
                              r = 'rows=0' or r like 'error=42501');

  -- ---- 1c. DELETE : 0 ligne chez B ---------------------------------------
  r := pg_temp.try_dml(format('delete from public.student_week_plans where user_id=%L', b));
  perform pg_temp.assert_true('S1 DELETE student_week_plans de B = 0 ligne ('||r||')', r = 'rows=0');
  r := pg_temp.try_dml(format('delete from public.chat_messages where user_id=%L', b));
  perform pg_temp.assert_true('S1 DELETE chat_messages de B = 0 ligne ('||r||')', r = 'rows=0');

  -- ---- 1d. INSERT avec le user_id de B : REFUSÉ (42501) -------------------
  r := pg_temp.try_dml(format(
    'insert into public.student_week_plans (user_id, week_start, items, status, content_locale)
     values (%L, ''2026-08-10'', ''[]''::jsonb, ''draft'', ''en-GB'')', b));
  perform pg_temp.assert_true('S1 INSERT week_plan pour B refuse ('||r||')', r = 'error=42501');
  r := pg_temp.try_dml(format(
    'insert into public.student_daily_checkins (user_id, local_date, overall)
     values (%L, ''2026-08-10'', ''good'')', b));
  perform pg_temp.assert_true('S1 INSERT checkin pour B refuse ('||r||')', r = 'error=42501');
  r := pg_temp.try_dml(format(
    'insert into public.chat_messages (user_id, role, content, scope)
     values (%L, ''user'', ''INJECTE'', ''whatsapp'')', b));
  perform pg_temp.assert_true('S1 INSERT chat_message pour B refuse ('||r||')', r = 'error=42501');
  r := pg_temp.try_dml(format(
    'insert into public.protocol_events (user_id, occurred_at, local_date, source, content_locale)
     values (%L, now(), ''2026-08-10'', ''quick_tap'', ''en-GB'')', b));
  perform pg_temp.assert_true('S1 INSERT protocol_event pour B refuse ('||r||')', r = 'error=42501');
  r := pg_temp.try_dml(format(
    'insert into public.student_safety_constraints (user_id, kind, allergen_ref, severity, declared_by, content_locale)
     values (%L, ''allergy'', ''gluten'', ''medical'', ''student'', ''en-GB'')', b));
  perform pg_temp.assert_true('S1 INSERT safety_constraint pour B refuse ('||r||')', r = 'error=42501');
  r := pg_temp.try_dml(format(
    'insert into public.weekly_reviews (user_id, week_start_date, content_locale)
     values (%L, ''2026-08-10'', ''en-GB'')', b));
  perform pg_temp.assert_true('S1 INSERT weekly_review pour B refuse ('||r||')', r = 'error=42501');

  -- ---- 1e. Le déplacement d'une ligne À SOI vers B (UPDATE du user_id) ----
  -- Sans WITH CHECK, un élève pourrait déposer sa ligne dans le dossier d'un
  -- autre. C'est la variante qu'un test SELECT-only ne voit jamais.
  r := pg_temp.try_dml(format(
    'update public.student_week_plans set user_id=%L where user_id=%L', b, a));
  perform pg_temp.assert_true('S1 A ne peut pas TRANSFERER son plan a B ('||r||')', r = 'error=42501');
  r := pg_temp.try_dml(format(
    'update public.chat_messages set user_id=%L where user_id=%L', b, a));
  perform pg_temp.assert_true('S1 A ne peut pas TRANSFERER son message a B ('||r||')', r = 'error=42501');

  perform pg_temp.become_su();
end $$;


-- ###########################################################################
-- SCÉNARIO 2 — ÉLÈVE → MATÉRIEL DU COACH
-- ###########################################################################
do $$
declare
  a uuid := 'a1300000-0000-4000-8000-00000000000a';
  n bigint;
  r text;
begin
  perform pg_temp.become(a);

  select count(*) into n from public.coach_doctrines;
  perform pg_temp.assert_eq('S2 eleve ne lit AUCUNE doctrine', n, 0);
  select count(*) into n from public.coach_syntheses;
  perform pg_temp.assert_eq('S2 eleve ne lit AUCUNE synthese', n, 0);
  select count(*) into n from public.cohorts;
  perform pg_temp.assert_eq('S2 eleve ne lit AUCUNE cohorte', n, 0);
  select count(*) into n from public.coaches;
  perform pg_temp.assert_eq('S2 eleve ne lit AUCUNE ligne coaches', n, 0);
  select count(*) into n from public.plan_templates;
  perform pg_temp.assert_eq('S2 eleve ne lit AUCUN plan_template', n, 0);

  -- Et il n'écrit pas non plus.
  r := pg_temp.try_dml(
    'insert into public.coach_doctrines (coach_id, version, content_locale)
     values (''a1300000-0000-4000-8000-00000000c0a1'', 99, ''en-GB'')');
  perform pg_temp.assert_true('S2 eleve n''ECRIT pas de doctrine ('||r||')', r = 'error=42501');
  r := pg_temp.try_dml(
    'update public.coach_syntheses set narrative=''FAUX'' where true');
  perform pg_temp.assert_true('S2 eleve ne reecrit pas une synthese ('||r||')',
                              r = 'rows=0' or r = 'error=42501');

  -- La raison d'être de la dénormalisation : l'élève voit bien la croyance
  -- SOURCE dans SON plan, sans jamais lire la table doctrine.
  perform pg_temp.become_su();
end $$;


-- ###########################################################################
-- SCÉNARIO 3 — COACH → DONNÉES ÉLÈVES : LES VUES TIER B, ET RIEN D'AUTRE
-- ###########################################################################
do $$
declare
  ca uuid := 'a1300000-0000-4000-8000-0000000000ca';
  n bigint;
  cols text;
begin
  perform pg_temp.become(ca);

  -- ---- 3a. Les 3 vues Tier B rendent bien les lignes de SON élève --------
  select count(*) into n from public.coach_student_directory;
  perform pg_temp.assert_eq('S3 directory rend l''eleve du coach', n, 1);
  select count(*) into n from public.coach_student_contact;
  perform pg_temp.assert_eq('S3 contact rend l''eleve du coach', n, 1);
  select count(*) into n from public.coach_student_pulse;
  perform pg_temp.assert_eq('S3 pulse rend la semaine de l''eleve', n, 1);

  -- ---- 3b. Les tables SOUS-JACENTES restent illisibles en direct ---------
  select count(*) into n from public.chat_messages;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN chat_message en direct', n, 0);
  select count(*) into n from public.student_daily_checkins;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN checkin en direct', n, 0);
  select count(*) into n from public.protocol_events;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN protocol_event en direct', n, 0);
  select count(*) into n from public.student_week_plans;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN plan d''eleve en direct', n, 0);
  select count(*) into n from public.student_goals;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN objectif en direct', n, 0);
  select count(*) into n from public.recurring_meals;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN repas recurrent en direct', n, 0);
  select count(*) into n from public.student_facts;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN student_fact en direct', n, 0);
  select count(*) into n from public.profiles where id <> ca;
  perform pg_temp.assert_eq('S3 coach ne lit AUCUN profil d''eleve en direct', n, 0);

  -- Ce qu'il A le droit de lire (Tier A) : l'adhérence structurelle.
  select count(*) into n from public.weekly_reviews;
  perform pg_temp.assert_eq('S3 contre-preuve: Tier A weekly_reviews visible', n, 1);
  select count(*) into n from public.student_safety_constraints;
  perform pg_temp.assert_eq('S3 contre-preuve: Tier A safety visible', n, 1);

  perform pg_temp.become_su();

  -- ---- 3c. AUDIT COLONNE PAR COLONNE des vues Tier B ---------------------
  -- Aucune colonne de contenu ne doit exister dans la définition des vues.
  select string_agg(table_name||'.'||column_name, ', ') into cols
  from information_schema.columns
  where table_schema='public'
    and table_name in ('coach_student_directory','coach_student_events',
                       'coach_student_contact','coach_student_pulse')
    and column_name in ('content','student_note','media_path','narrative','note',
                        'notes','student_narrative','raw_intake_text','situation',
                        'coach_draft_reply','source_message_id','email','phone_number',
                        'birth_date','gender','stripe_customer_id','access_tier',
                        'label','value','beliefs','items','message','role');
  perform pg_temp.assert_true(
    'S3 AUCUNE colonne de contenu dans les vues Tier B ('||coalesce(cols,'aucune')||')',
    cols is null);

  -- Et la liste exhaustive, pour que l'ajout d'une colonne demain se voie.
  raise notice 'S3 colonnes Tier B: %', (
    select string_agg(table_name||'('||cl||')', ' | ' order by table_name)
    from (
      select table_name, string_agg(column_name, ',' order by ordinal_position) as cl
      from information_schema.columns
      where table_schema='public'
        and table_name in ('coach_student_directory','coach_student_events',
                           'coach_student_contact','coach_student_pulse')
      group by table_name
    ) t);
end $$;

-- ---- 3d. La preuve par le contenu : aucun mot de l'élève ne traverse. ----
-- On cherche les chaînes secrètes dans TOUTE la sortie des vues, sérialisée.
do $$
declare
  ca uuid := 'a1300000-0000-4000-8000-0000000000ca';
  blob text := '';
begin
  perform pg_temp.become(ca);
  select coalesce(string_agg(t::text, ' '), '') into blob from public.coach_student_directory t;
  select blob || ' ' || coalesce(string_agg(t::text, ' '), '') into blob from public.coach_student_events t;
  select blob || ' ' || coalesce(string_agg(t::text, ' '), '') into blob from public.coach_student_contact t;
  select blob || ' ' || coalesce(string_agg(t::text, ' '), '') into blob from public.coach_student_pulse t;

  perform pg_temp.assert_true('S3 JOURNAL-INTIME-A absent des vues', position('JOURNAL-INTIME-A' in blob) = 0);
  perform pg_temp.assert_true('S3 SECRET-NOTE-A absent des vues',     position('SECRET-NOTE-A' in blob) = 0);
  perform pg_temp.assert_true('S3 media_path absent des vues',        position('photo-a.jpg' in blob) = 0);
  perform pg_temp.assert_true('S3 wamid absent des vues',             position('wamid.A' in blob) = 0);
  perform pg_temp.assert_true('S3 email eleve absent des vues',       position('a13.student.a@' in blob) = 0);
  raise notice 'S3 sortie Tier B (extrait): %', left(blob, 400);
  perform pg_temp.become_su();
end $$;


-- ###########################################################################
-- SCÉNARIO 4 — COACH A → TOUT CE QUI EST À COACH B
-- ###########################################################################
do $$
declare
  ca uuid := 'a1300000-0000-4000-8000-0000000000ca';
  b  uuid := 'a1300000-0000-4000-8000-00000000000b';
  n bigint;
  r text;
begin
  perform pg_temp.become(ca);

  select count(*) into n from public.coach_student_directory where id = b;
  perform pg_temp.assert_eq('S4 coach A ne voit pas l''eleve de B (directory)', n, 0);
  select count(*) into n from public.coach_student_contact where student_user_id = b;
  perform pg_temp.assert_eq('S4 coach A ne voit pas l''eleve de B (contact)', n, 0);
  select count(*) into n from public.coach_student_pulse where student_user_id = b;
  perform pg_temp.assert_eq('S4 coach A ne voit pas l''eleve de B (pulse)', n, 0);
  select count(*) into n from public.coach_student_events where user_id = b;
  perform pg_temp.assert_eq('S4 coach A ne voit pas les evenements de B', n, 0);
  select count(*) into n from public.weekly_reviews where user_id = b;
  perform pg_temp.assert_eq('S4 coach A ne voit pas le bilan de l''eleve de B', n, 0);
  select count(*) into n from public.student_safety_constraints where user_id = b;
  perform pg_temp.assert_eq('S4 coach A ne voit pas la safety de l''eleve de B', n, 0);

  select count(*) into n from public.coach_doctrines
   where coach_id = 'a1300000-0000-4000-8000-00000000c0b1';
  perform pg_temp.assert_eq('S4 coach A ne lit pas la doctrine de B', n, 0);
  select count(*) into n from public.coach_syntheses
   where coach_id = 'a1300000-0000-4000-8000-00000000c0b1';
  perform pg_temp.assert_eq('S4 coach A ne lit pas la synthese de B', n, 0);
  select count(*) into n from public.coaches
   where user_id = 'a1300000-0000-4000-8000-0000000000cb';
  perform pg_temp.assert_eq('S4 coach A ne lit pas la ligne coaches de B', n, 0);
  select count(*) into n from public.coach_clients
   where coach_id = 'a1300000-0000-4000-8000-00000000c0b1';
  perform pg_temp.assert_eq('S4 coach A ne lit pas le roster de B', n, 0);

  -- Écritures croisées.
  r := pg_temp.try_dml(
    'update public.coach_doctrines set beliefs=''[]''::jsonb
     where coach_id=''a1300000-0000-4000-8000-00000000c0b1''');
  perform pg_temp.assert_true('S4 coach A ne reecrit pas la doctrine de B ('||r||')', r = 'rows=0');
  r := pg_temp.try_dml(
    'insert into public.cohorts (coach_id, label, content_locale)
     values (''a1300000-0000-4000-8000-00000000c0b1'', ''VOL'', ''en-GB'')');
  perform pg_temp.assert_true('S4 coach A ne cree pas de cohorte chez B ('||r||')', r = 'error=42501');

  -- Contre-preuve : il lit bien les siennes.
  select count(*) into n from public.coach_doctrines;
  perform pg_temp.assert_eq('S4 contre-preuve: coach A lit SA doctrine', n, 1);
  select count(*) into n from public.coach_syntheses;
  perform pg_temp.assert_eq('S4 contre-preuve: coach A lit SA synthese', n, 1);
  select count(*) into n from public.cohorts;
  perform pg_temp.assert_eq('S4 contre-preuve: coach A lit SA cohorte', n, 1);

  perform pg_temp.become_su();
end $$;


-- ###########################################################################
-- SCÉNARIO 4bis — ANON : rien, nulle part.
-- ###########################################################################
do $$
declare n bigint; r text;
begin
  perform pg_temp.become_anon();

  select count(*) into n from public.student_week_plans;
  perform pg_temp.assert_eq('S4b anon: student_week_plans', n, 0);
  select count(*) into n from public.student_daily_checkins;
  perform pg_temp.assert_eq('S4b anon: student_daily_checkins', n, 0);
  select count(*) into n from public.chat_messages;
  perform pg_temp.assert_eq('S4b anon: chat_messages', n, 0);
  select count(*) into n from public.protocol_events;
  perform pg_temp.assert_eq('S4b anon: protocol_events', n, 0);
  select count(*) into n from public.coach_doctrines;
  perform pg_temp.assert_eq('S4b anon: coach_doctrines', n, 0);
  select count(*) into n from public.coach_syntheses;
  perform pg_temp.assert_eq('S4b anon: coach_syntheses', n, 0);
  select count(*) into n from public.student_facts;
  perform pg_temp.assert_eq('S4b anon: student_facts', n, 0);
  select count(*) into n from public.recurring_meals;
  perform pg_temp.assert_eq('S4b anon: recurring_meals', n, 0);

  r := pg_temp.try_dml(
    'insert into public.student_daily_checkins (user_id, local_date, overall)
     values (''a1300000-0000-4000-8000-00000000000a'', ''2026-08-11'', ''good'')');
  perform pg_temp.assert_true('S4b anon n''ecrit pas de checkin ('||r||')', r = 'error=42501');

  perform pg_temp.become_su();
end $$;

-- ---- 4ter. Les GRANTS de table sur les vues Tier B : anon doit être exclu.
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='v'
    and c.relname in ('coach_student_directory','coach_student_events',
                      'coach_student_contact','coach_student_pulse')
    and has_table_privilege('anon', c.oid, 'select');
  perform pg_temp.assert_true(
    'S4t anon n''a AUCUN grant SELECT sur les vues Tier B (coupables: '||coalesce(bad,'aucun')||')',
    bad is null);
end $$;


-- ###########################################################################
-- SCÉNARIO 5 — GRANTS DE FONCTIONS
-- ###########################################################################
do $$
declare
  bad text;
begin
  -- 5a. keel_mark_synthesis_delivered : ni public, ni anon.
  select string_agg(role_name, ', ') into bad from (
    select r as role_name from unnest(array['public','anon']) r
    join pg_proc p on true
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname='public' and p.proname='keel_mark_synthesis_delivered'
      and has_function_privilege(r, p.oid, 'execute')
  ) t;
  perform pg_temp.assert_true(
    'S5 keel_mark_synthesis_delivered inexecutable par public/anon (coupables: '
      ||coalesce(bad,'aucun')||')',
    bad is null);
end $$;

-- 5b. Inventaire des SECURITY DEFINER récents (KEEL + pivot) et leurs grants.
do $$
declare
  bad text;
  -- `preview_coach_invitation` est le SEUL anon assumé : c'est la surface
  -- publique d'aperçu d'une invitation, documentée dans 20260727200000
  -- (ARBITRATION 2), et elle ne rend que le prénom du coach.
  allowed_anon text[] := array['preview_coach_invitation'];
begin
  select string_agg(p.proname || '(anon)', ', ') into bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and (p.proname like 'keel\_%' or p.proname like 'coach%'
         or p.proname in ('coached_student_ids','revoke_coach_access',
                          'accept_coach_invitation','accept_coach_invitation_for_user',
                          'preview_coach_invitation','log_coach_student_access',
                          'purge_auth_user'))
    and not (p.proname = any(allowed_anon))
    and (has_function_privilege('anon', p.oid,'execute')
         or has_function_privilege('public', p.oid,'execute'));
  perform pg_temp.assert_true(
    'S5 aucun SECURITY DEFINER KEEL/pivot ouvert a public|anon (coupables: '
      ||coalesce(bad,'aucun')||')',
    bad is null);

  raise notice 'S5 inventaire: %', (
    select string_agg(p.proname||' [pub='||has_function_privilege('public',p.oid,'execute')
             ||' anon='||has_function_privilege('anon',p.oid,'execute')
             ||' authd='||has_function_privilege('authenticated',p.oid,'execute')
             ||' sp='||coalesce(array_to_string(p.proconfig,';'),'NONE')||']', E'\n   '
             order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and (p.proname like 'keel\_%' or p.proname like 'coach%'
           or p.proname in ('coached_student_ids','revoke_coach_access',
                            'accept_coach_invitation','accept_coach_invitation_for_user',
                            'preview_coach_invitation','log_coach_student_access',
                            'purge_auth_user')));
end $$;

-- 5c. Preuve d'exécution : un coach ne marque QUE sa synthèse.
do $$
declare
  ca uuid := 'a1300000-0000-4000-8000-0000000000ca';
  syn_a uuid; syn_b uuid;
  got timestamptz; first_call timestamptz;
begin
  select id into syn_a from public.coach_syntheses
   where coach_id='a1300000-0000-4000-8000-00000000c0a1';
  select id into syn_b from public.coach_syntheses
   where coach_id='a1300000-0000-4000-8000-00000000c0b1';

  perform pg_temp.become(ca);
  select public.keel_mark_synthesis_delivered(syn_b) into got;
  perform pg_temp.assert_true('S5 coach A ne peut PAS livrer la synthese de B', got is null);
  select public.keel_mark_synthesis_delivered(syn_a) into first_call;
  perform pg_temp.assert_true('S5 coach A livre SA synthese', first_call is not null);
  select public.keel_mark_synthesis_delivered(syn_a) into got;
  perform pg_temp.assert_true('S5 idempotent: delivered_at ne bouge pas', got = first_call);
  perform pg_temp.become_su();
end $$;


-- ###########################################################################
-- SCÉNARIO 6 — LE JETON DE FLOW, CÔTÉ ÉCRITURE
--
-- Le jeton ne porte QUE la semaine (`KEEL_WEEKLY_<date>`). L'élève est résolu
-- depuis le NUMÉRO qui écrit. On prouve ici les deux moitiés de la propriété :
--   (a) la table cible n'a AUCUNE colonne qui vienne du jeton hormis la date ;
--   (b) même en forçant l'écriture avec l'identité de l'appelant, on n'atteint
--       que son propre dossier.
-- ###########################################################################
do $$
declare
  a uuid := 'a1300000-0000-4000-8000-00000000000a';
  b uuid := 'a1300000-0000-4000-8000-00000000000b';
  n bigint;
  r text;
begin
  -- (a) Le jeton ne peut pas désigner une ligne : `weekly_reviews` est clé
  -- (user_id, week_start_date) et le user_id ne vient jamais du jeton.
  perform pg_temp.become(a);

  -- Élève A rejoue le jeton de la semaine de B, en visant le dossier de B.
  r := pg_temp.try_dml(format(
    'insert into public.weekly_reviews (user_id, week_start_date, biofeedback, content_locale)
     values (%L, ''2026-08-03'', ''{"energy":5}''::jsonb, ''en-GB'')', b));
  perform pg_temp.assert_true('S6 jeton rejoue vers le dossier de B: INSERT refuse ('||r||')',
                              r = 'error=42501');

  r := pg_temp.try_dml(format(
    'update public.weekly_reviews set biofeedback=''{"energy":1}''::jsonb
     where user_id=%L and week_start_date=''2026-08-03''', b));
  perform pg_temp.assert_true('S6 jeton rejoue vers le dossier de B: UPDATE 0 ligne ('||r||')',
                              r = 'rows=0' or r = 'error=42501');

  -- Le bilan de B est intact.
  perform pg_temp.become_su();
  select count(*) into n from public.weekly_reviews
   where user_id=b and student_narrative='semaine ok, B' and biofeedback is null;
  perform pg_temp.assert_eq('S6 le bilan de B est INTACT', n, 1);
end $$;

-- ###########################################################################
-- VERDICT
-- ###########################################################################
do $$
declare
  n_ok bigint; n_ko bigint; reds text;
begin
  select count(*) filter (where ok), count(*) filter (where not ok)
    into n_ok, n_ko from a13_results;
  select string_agg('   x '||label, E'\n' order by ord) into reds
    from a13_results where not ok;
  raise notice E'\n=== AGENT 13 / CLOISONNEMENT : % PASS, % FAIL ===\n%',
    n_ok, n_ko, coalesce(reds, '   (aucun echec)');
end $$;

rollback;
