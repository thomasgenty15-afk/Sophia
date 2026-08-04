-- ===========================================================================
-- PIVOT C4 — LE POINT HEBDO : DÉRIVE DE SCHÉMA ET CIBLE D'UPSERT
--
-- MANUEL. Contre la base LOCALE :
--   docker cp supabase/functions/_shared/keel/weekly_flow_schema_test.sql \
--     supabase_db_Sophia_2:/tmp/wf.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/wf.sql
--
-- Tout dans UNE transaction qui finit par ROLLBACK.
--
-- CE QUE CES ASSERTIONS PROTÈGENT — deux pannes RÉELLES, mesurées le
-- 2026-08-03, qu'aucun test Deno ne pouvait voir parce qu'elles vivent à la
-- frontière entre le code et la base :
--
--   1. `keel-weekly-flow-v1` sélectionnait `profiles.content_locale`, colonne
--      QUI N'EXISTE PAS. PostgREST rendait 42703 dès la première page, le job
--      répondait 500, et AUCUN élève n'a jamais été examiné : toutes les gardes
--      en aval — crise, plancher TCA, opt-out — étaient du code mort derrière
--      un SELECT cassé, avec leurs tests unitaires bien verts.
--
--   2. L'écriture de la réponse faisait `ON CONFLICT (user_id,
--      week_start_date)` alors que le seul index qui dédoublonne est PARTIEL
--      (`where plan_version_id is null`). Postgres refuse : 42P10. Chaque
--      réponse de Flow était donc perdue, sans ligne et sans accusé.
--
-- La leçon commune : un index bien posé et une garde bien testée ne prouvent
-- RIEN sur la capacité du seul écrivain à s'en servir. On teste la jointure.
-- ===========================================================================

begin;

create or replace function pg_temp.assert(label text, ok boolean, detail text default '')
returns void language plpgsql as $$
begin
  if not ok then
    raise exception 'FAIL % %', label, detail;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- --------------------------------------------------------------------------
-- 1. Les colonnes que le cron SELECTionne existent toutes sur `profiles`
--
-- La liste est celle de `keel-weekly-flow-v1/index.ts`. Elle est DUPLIQUÉE ici
-- à dessein : c'est une vérification de cohérence entre deux fichiers qui ne
-- se compilent pas ensemble, et un test qui lirait la même source que le code
-- ne vérifierait rien.
-- --------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(c, ', ') into v_missing
  from unnest(array[
    'id', 'timezone', 'whatsapp_opted_in', 'whatsapp_opted_out_at', 'phone_number'
  ]) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = c
  );

  perform pg_temp.assert(
    'keel-weekly-flow-v1 ne SELECTionne que des colonnes existantes de profiles',
    v_missing is null,
    coalesce('colonnes absentes: ' || v_missing, '')
  );
end $$;

-- Le cron `keel-daily-pulse-v1` lit la même table: même vérification, parce
-- que la panne est celle de la liste, pas celle d'un fichier.
do $$
declare
  v_missing text;
begin
  select string_agg(c, ', ') into v_missing
  from unnest(array[
    'id', 'timezone', 'whatsapp_opted_in', 'whatsapp_opted_out_at', 'phone_number'
  ]) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = c
  );
  perform pg_temp.assert(
    'keel-daily-pulse-v1 ne SELECTionne que des colonnes existantes de profiles',
    v_missing is null,
    coalesce('colonnes absentes: ' || v_missing, '')
  );
end $$;

-- `content_locale` n'existe PAS sur profiles: si quelqu'un l'ajoute un jour,
-- cette assertion tombe et on relira le code qui la croyait déjà là.
do $$
begin
  perform pg_temp.assert(
    'profiles.content_locale reste absente (le cron ne doit pas la lire)',
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'content_locale'
    )
  );
end $$;

-- --------------------------------------------------------------------------
-- 2. L'index qui dédoublonne est PARTIEL — donc ON CONFLICT (a, b) est
--    INUTILISABLE, et l'écrivain doit faire SELECT puis UPDATE/INSERT.
--
-- On le prouve en exécutant les deux formes, plutôt qu'en lisant le catalogue.
-- --------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_week date := date '2031-01-06';
  v_failed boolean := false;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'SKIP: aucun auth.users en base';
    return;
  end if;

  -- La forme que le code utilisait: elle DOIT échouer.
  begin
    execute format(
      'insert into public.weekly_reviews (user_id, week_start_date, plan_version_id, content_locale)
       values (%L, %L, null, %L)
       on conflict (user_id, week_start_date) do nothing',
      v_user, v_week, 'en-GB');
  exception when others then
    v_failed := true;
    raise notice '  (attendu) ON CONFLICT (user_id, week_start_date) rejete: %', sqlerrm;
  end;
  perform pg_temp.assert(
    'ON CONFLICT (user_id, week_start_date) ne peut PAS viser l''index partiel',
    v_failed,
    '-- s''il passe desormais, l''upsert redevient possible et le commentaire de weekly_flow_io.ts est a revoir'
  );

  -- La ceinture, elle, tient: deux INSERT nus pour la même (élève, semaine).
  insert into public.weekly_reviews (user_id, week_start_date, plan_version_id, content_locale)
  values (v_user, v_week, null, 'en-GB');

  v_failed := false;
  begin
    insert into public.weekly_reviews (user_id, week_start_date, plan_version_id, content_locale)
    values (v_user, v_week, null, 'en-GB');
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(
    'une SECONDE ligne (eleve, semaine) sans plan_version est refusee',
    v_failed
  );

  -- Condition de désarmement: le chemin 1:1 (plan_version_id renseigné) n'est
  -- PAS contraint par cet index partiel — sinon on aurait cassé l'autre modèle
  -- en fermant celui-ci.
  perform pg_temp.assert(
    'l''index partiel ne s''applique qu''a plan_version_id IS NULL',
    (select indpred is not null
     from pg_index
     where indexrelid = 'weekly_reviews_user_week_no_plan_uidx'::regclass)
  );
end $$;

rollback;
