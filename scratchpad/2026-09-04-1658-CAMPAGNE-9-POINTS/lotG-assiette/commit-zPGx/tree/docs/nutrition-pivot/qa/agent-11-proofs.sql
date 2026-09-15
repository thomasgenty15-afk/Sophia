-- ===========================================================================
-- QA AGENT 11 — the proof sequence (scenarios 6, 8, 9)
-- ===========================================================================
-- Run AFTER agent-11-fixtures.sql and after the Monday job has written the
-- syntheses:
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-11-proofs.sql
--
-- Everything runs inside a transaction that ROLLS BACK: the proofs must not
-- leave a delivered_at behind for the browser run.
-- ===========================================================================

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

create or replace function pg_temp.assert_true(label text, got boolean)
returns void language plpgsql as $$
begin
  if got is not true then
    raise exception 'FAIL % : got %, want true', label, coalesce(got::text,'null');
  end if;
  raise notice 'PASS %', label;
end;
$$;

create or replace function pg_temp.assert_rejects(label text, stmt text)
returns void language plpgsql as $$
begin
  begin execute stmt;
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
                     json_build_object('sub', who, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.become_service()
returns void language plpgsql as $$
begin
  execute 'set local role postgres';
  perform set_config('request.jwt.claims','', true);
end;
$$;

-- ===========================================================================
-- §6 — COHORTES : deux cohortes chez le même coach
-- ===========================================================================
select pg_temp.assert_eq('§6 ALPHA a bien deux cohortes',
  (select count(*) from public.cohorts where coach_id='b1c0ac00-0000-4000-8000-00000000000a'), 2);

select pg_temp.assert_eq('§6 4 élèves en cohorte 1',
  (select count(*) from public.coach_clients
    where cohort_id='b1c00000-0000-4000-8000-0000000000a1' and status='active'), 4);
select pg_temp.assert_eq('§6 3 élèves en cohorte 2',
  (select count(*) from public.coach_clients
    where cohort_id='b1c00000-0000-4000-8000-0000000000a2' and status='active'), 3);

-- Ce que le job a réellement écrit : UNE ligne, cohort_id NULL, 7 élèves.
select pg_temp.assert_eq('§6 le job écrit UNE seule synthèse pour les 2 cohortes',
  (select count(*) from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000a'), 1);
select pg_temp.assert_eq('§6 cohort_id reste NULL (pas de scoping)',
  (select count(*) from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000a' and cohort_id is null), 1);
select pg_temp.assert_eq('§6 les 7 élèves des 2 cohortes sont mélangés dans une seule ligne',
  (select (metrics->>'student_count')::bigint from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000a'), 7);

-- Et la raison STRUCTURELLE : la clé d'unicité ignore cohort_id, donc deux
-- synthèses scopées de la même semaine sont impossibles à écrire.
select pg_temp.assert_rejects('§6 impossible d''écrire une 2e synthèse scopée cohorte', $q$
  insert into public.coach_syntheses (coach_id, cohort_id, kind, period_start, period_end, content_locale)
  values ('b1c0ac00-0000-4000-8000-00000000000a','b1c00000-0000-4000-8000-0000000000a2',
          'weekly', date '2026-07-27', date '2026-08-02','en')
$q$);

-- ===========================================================================
-- §8 — LIVRAISON : delivered_at posé UNE fois, jamais déplacé
-- ===========================================================================
select pg_temp.assert_eq('§8 la synthèse est générée, PAS livrée',
  (select count(*) from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000a' and delivered_at is null), 1);

select pg_temp.become('b1000000-0000-4000-8000-000000000001');  -- Coach Alpha

-- 1ère ouverture
create temp table t_delivery as
select public.keel_mark_synthesis_delivered(
  (select id from public.coach_syntheses where coach_id='b1c0ac00-0000-4000-8000-00000000000a'),
  'in_app') as first_open;

select pg_temp.assert_true('§8 1ère ouverture pose delivered_at',
  (select first_open is not null from t_delivery));

-- 3 réouvertures
create temp table t_reopen as
select public.keel_mark_synthesis_delivered(
  (select id from public.coach_syntheses where coach_id='b1c0ac00-0000-4000-8000-00000000000a'),'in_app') as a,
       public.keel_mark_synthesis_delivered(
  (select id from public.coach_syntheses where coach_id='b1c0ac00-0000-4000-8000-00000000000a'),'in_app') as b,
       public.keel_mark_synthesis_delivered(
  (select id from public.coach_syntheses where coach_id='b1c0ac00-0000-4000-8000-00000000000a'),'in_app') as c;

select pg_temp.assert_true('§8 3 réouvertures ne déplacent PAS la date',
  (select r.a = d.first_open and r.b = d.first_open and r.c = d.first_open
     from t_reopen r, t_delivery d));

select pg_temp.assert_eq('§8 le canal reste in_app',
  (select count(*) from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000a' and delivery_channel='in_app'), 1);

-- Un autre canal passé plus tard n'écrase pas le premier (coalesce).
select public.keel_mark_synthesis_delivered(
  (select id from public.coach_syntheses where coach_id='b1c0ac00-0000-4000-8000-00000000000a'),'email');
select pg_temp.assert_eq('§8 un 2e canal n''écrase pas le premier',
  (select count(*) from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000a' and delivery_channel='in_app'), 1);

-- ===========================================================================
-- §9 — CLOISONNEMENT : coach BRAVO face à la synthèse d'ALPHA
-- ===========================================================================
select pg_temp.become('b1000000-0000-4000-8000-000000000002');  -- Coach Bravo

select pg_temp.assert_eq('§9 BRAVO lit SA synthèse, et une seule',
  (select count(*) from public.coach_syntheses), 1);
select pg_temp.assert_eq('§9 BRAVO ne lit PAS la synthèse d''ALPHA',
  (select count(*) from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000a'), 0);

-- La RPC renvoie NULL sur une synthèse qui n'est pas la sienne (et ne dit pas
-- si la ligne existe: le dire révélerait l'existence d'un autre coach).
select pg_temp.assert_true('§9 la RPC renvoie NULL pour BRAVO sur la ligne d''ALPHA',
  (select public.keel_mark_synthesis_delivered(
     (select id from public.coach_syntheses where coach_id='b1c0ac00-0000-4000-8000-00000000000a')
   ) is null));

-- UPDATE direct du narrative: 0 ligne touchée (aucune policy UPDATE).
do $$
declare n int;
begin
  update public.coach_syntheses set narrative = 'PWNED'
   where coach_id = 'b1c0ac00-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL §9 BRAVO a modifié % ligne(s) de la synthèse d''ALPHA', n;
  end if;
  raise notice 'PASS §9 UPDATE direct du narrative par BRAVO: 0 ligne';
end $$;

-- Le coach ne peut pas non plus réécrire SA PROPRE synthèse (un rapport
-- réécrivable n'est plus un rapport).
do $$
declare n int;
begin
  update public.coach_syntheses set narrative = 'looks great'
   where coach_id = 'b1c0ac00-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL §9 BRAVO a réécrit SA PROPRE synthèse (% ligne)', n;
  end if;
  raise notice 'PASS §9 BRAVO ne peut pas réécrire sa propre synthèse';
end $$;

select pg_temp.assert_rejects('§9 BRAVO ne peut pas s''écrire une synthèse', $q$
  insert into public.coach_syntheses (coach_id, kind, period_start, period_end, content_locale)
  values ('b1c0ac00-0000-4000-8000-00000000000b','weekly', date '2026-07-20', date '2026-07-26','en')
$q$);

-- Contre-test de la RPC: ALPHA, lui, la marque bien (sinon le NULL de BRAVO
-- passerait pour la preuve d'une fonction cassée).
select pg_temp.become('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true('§9 contre-test: ALPHA marque bien SA synthèse',
  (select public.keel_mark_synthesis_delivered(
     (select id from public.coach_syntheses where coach_id='b1c0ac00-0000-4000-8000-00000000000a')
   ) is not null));

select pg_temp.become_service();

-- ===========================================================================
-- §10bis — le coach SANS élève a quand même une synthèse écrite
-- (l'en-tête de coach-synthesis-v1 dit l'inverse)
-- ===========================================================================
select pg_temp.assert_eq('§10bis ECHO n''a aucun élève',
  (select count(*) from public.coach_clients
    where coach_id='b1c0ac00-0000-4000-8000-00000000000e' and status='active'), 0);
select pg_temp.assert_eq('§10bis ...et pourtant une synthèse a été écrite pour lui',
  (select count(*) from public.coach_syntheses
    where coach_id='b1c0ac00-0000-4000-8000-00000000000e'), 1);

rollback;

-- Si vous lisez cette ligne sans exception au-dessus: tout est PASS.
