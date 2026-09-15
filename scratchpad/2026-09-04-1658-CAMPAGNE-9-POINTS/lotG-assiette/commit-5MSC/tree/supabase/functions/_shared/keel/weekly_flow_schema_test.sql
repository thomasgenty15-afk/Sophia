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
  -- ⚠️ CETTE LISTE AVAIT DÉRIVÉ. Elle nommait encore `whatsapp_opted_in`,
  -- `whatsapp_opted_out_at` et `phone_number` — les trois colonnes que le
  -- chantier de-whatsapp a SORTIES du SELECT — pendant que le code lisait
  -- `proactive_muted_at`. Le test restait vert en gardant une liste que plus
  -- personne ne lisait: exactement la panne qu'il existe pour attraper, un cran
  -- plus haut. Recopier la liste du code À CHAQUE FOIS qu'on y touche.
  select string_agg(c, ', ') into v_missing
  from unnest(array[
    'id', 'timezone', 'proactive_muted_at', 'locale'
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
    'id', 'timezone', 'proactive_muted_at', 'full_name', 'locale'
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

-- --------------------------------------------------------------------------
-- 3. LE BILAN HEBDOMADAIRE — `week_facts`, écrit par `week_review_io.ts`
--
-- Même jointure, même classe de panne, un lot plus tard: le module a des
-- centaines d'assertions Deno et pas une seule ne prouve qu'il peut ÉCRIRE.
-- On rejoue donc ici exactement sa séquence — SELECT, puis INSERT, puis
-- UPDATE-par-id — et on relit le jsonb pour vérifier qu'il traverse.
-- --------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(c, ', ') into v_missing
  from unnest(array['week_facts', 'week_facts_computed_at', 'biofeedback']) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'weekly_reviews' and column_name = c
  );
  perform pg_temp.assert(
    'week_review_io.ts n''ecrit que des colonnes existantes de weekly_reviews',
    v_missing is null,
    coalesce('colonnes absentes: ' || v_missing, '')
  );
end $$;

do $$
declare
  v_user uuid;
  v_week date := date '2031-02-03';
  v_id uuid;
  v_read jsonb;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'SKIP: aucun auth.users en base';
    return;
  end if;

  -- La séquence de `writeWeekFacts`, à la lettre.
  select id into v_id from public.weekly_reviews
  where user_id = v_user and week_start_date = v_week and plan_version_id is null;
  perform pg_temp.assert('aucune ligne prealable pour cette semaine de test', v_id is null);

  insert into public.weekly_reviews (
    user_id, week_start_date, plan_version_id, content_locale,
    week_facts, week_facts_computed_at
  ) values (
    v_user, v_week, null, 'en-GB',
    jsonb_build_object(
      'version', 'week_review_v1',
      'branch', 'mixed',
      'alignment', jsonb_build_array(
        jsonb_build_object('group', 'fatty_fish', 'status', 'absent', 'seen', 0)
      )
    ),
    now()
  ) returning id into v_id;

  -- Le lecteur du contexte de tour: `not("week_facts_computed_at", "is", null)`
  -- plus l'ordre décroissant sur la semaine. C'est CETTE requête qui sert la
  -- conversation toute la semaine suivante.
  select week_facts into v_read
  from public.weekly_reviews
  where user_id = v_user
    and plan_version_id is null
    and week_facts_computed_at is not null
  order by week_start_date desc
  limit 1;

  perform pg_temp.assert(
    'le jsonb gele est relu tel quel par le lecteur de contexte',
    v_read->>'version' = 'week_review_v1'
      and v_read->'alignment'->0->>'group' = 'fatty_fish',
    coalesce(v_read::text, '<null>')
  );

  -- Le second passage (l'élève rouvre le formulaire, le cron repasse): UPDATE
  -- par id, jamais un second INSERT.
  update public.weekly_reviews
  set week_facts = jsonb_set(v_read, '{branch}', '"on_track"'),
      week_facts_computed_at = now()
  where id = v_id;

  perform pg_temp.assert(
    'le recalcul MET A JOUR la ligne au lieu d''en creer une seconde',
    (select count(*) from public.weekly_reviews
     where user_id = v_user and week_start_date = v_week and plan_version_id is null) = 1
  );
end $$;

rollback;
