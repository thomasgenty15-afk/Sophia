-- ============================================================================
-- KEEL W7.5 — `keel-evaluate-adherence` : replanification avec un corps que la
-- fonction SAIT LIRE.
--
-- CE QUI ÉTAIT CASSÉ (20260727210000, ligne « B1 »)
-- ------------------------------------------------
-- Le job était planifié à `45 * * * *` avec le corps `{"mode":"due"}`.
-- `evaluate-adherence-v1` exigeait `body.user_id` et ne lisait JAMAIS
-- `body.mode` : chaque tick rendait `400 {"error":"user_id is required"}`.
-- pg_net renvoie un identifiant de requête, pas un statut HTTP, donc
-- `cron.job_run_details` affichait `succeeded` — l'échec était SILENCIEUX.
--
-- Conséquence mesurée : aucune adhérence n'était calculée en flotte, et le
-- balayage de fin de journée (`keel_sweep_day_evaluations`, `55 * * * *`)
-- passait tout `unknown` en `missed`. Un élève parfaitement observant était
-- noté en échec TOUS LES JOURS. C'est exactement le défaut que ce cron devait
-- empêcher : le bloquant B1 n'avait pas été fermé, il avait été déplacé d'un
-- cron absent vers un cron inerte.
--
-- CE QUE FAIT CETTE MIGRATION
-- ---------------------------
-- 1. Replanifie le job avec `{"mode":"fleet"}` — le mode que la fonction lit
--    désormais (supabase/functions/evaluate-adherence-v1/fleet.ts). L'ancien
--    `20260727210000` n'est PAS modifié : il reste l'historique du défaut, et
--    `"due"` est accepté comme alias par la fonction, donc un environnement où
--    seule l'ancienne migration a tourné n'est plus en 400 non plus.
-- 2. Garde l'horaire `45 * * * *`. L'ordre :45 (évaluation) avant :55
--    (balayage) tient dans CHAQUE fuseau, pas seulement en UTC : le balayage ne
--    part que lorsque l'heure locale de l'élève vaut 23, donc l'évaluation du
--    même tick UTC voit une heure locale entre 22:50 et 23:49 — la MÊME date
--    locale, quel que soit le décalage (y compris les décalages à :30 et :45 et
--    les changements d'heure). Prouvé sur 38 fuseaux x 24 ticks x 2 saisons par
--    `evaluate-adherence-v1/fleet_test.ts` ("ORDERING").
--
-- LE PIÈGE QU'ON NE REFAIT PAS
-- ----------------------------
-- `app_config` et le vault sont seedés APRÈS les migrations. L'URL, la clé anon
-- et `INTERNAL_FUNCTION_SECRET` doivent donc être résolus À L'EXÉCUTION du job,
-- jamais interpolés ici — sinon le job part avec des chaînes vides et poste
-- dans le vide (silencieusement, encore). On reprend à l'identique le helper de
-- 20260727175000 plutôt que d'en écrire une variante qui divergerait.
-- ============================================================================

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

create or replace function pg_temp.keel_schedule_internal_edge_job(
  p_jobname text,
  p_schedule text,
  p_function_name text,
  p_body jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = p_jobname;
  perform cron.schedule(
    p_jobname,
    p_schedule,
    format(
      $command$
      with cfg as (
        select
          coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
          coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
          coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
      )
      select
        net.http_post(
          url := rtrim((select base_url from cfg), '/') || '/functions/v1/' || %L,
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'apikey', (select anon_key from cfg),
            'authorization', 'Bearer ' || (select anon_key from cfg),
            'x-internal-secret', (select internal_secret from cfg)
          ),
          body := %L::jsonb
        ) as request_id
      from cfg
      where (select base_url from cfg) <> ''
        and (select anon_key from cfg) <> ''
        and (select internal_secret from cfg) <> '';
      $command$,
      p_function_name,
      p_body::text
    )
  );
end;
$$;

select pg_temp.keel_schedule_internal_edge_job(
  'keel-evaluate-adherence',
  '45 * * * *',
  'evaluate-adherence-v1',
  '{"mode":"fleet"}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Fail loud (R7). Trois assertions, parce que « le job existe » est justement
-- la vérification qui a laissé passer le défaut : le job EXISTAIT, il était
-- actif, et il postait un corps que la fonction ne comprenait pas.
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
begin
  select schedule, active, command into j
  from cron.job where jobname = 'keel-evaluate-adherence';

  if not found then
    raise exception
      'W7.5: keel-evaluate-adherence non planifie — aucune adherence ne sera calculee en flotte';
  end if;

  if j.schedule is distinct from '45 * * * *' then
    raise exception
      'W7.5: keel-evaluate-adherence doit tomber a la minute 45 (avant le balayage de :55), got %',
      j.schedule;
  end if;

  if not coalesce(j.active, false) then
    raise exception 'W7.5: keel-evaluate-adherence est planifie mais INACTIF';
  end if;

  -- Le corps, pas seulement l'horaire : c'est LE défaut qu'on répare.
  -- (`jsonb::text` normalise en `{"mode": "fleet"}`, avec l'espace : on teste
  -- la clé et la valeur, pas la mise en forme.)
  if j.command not like '%"mode"%' or j.command not like '%fleet%' then
    raise exception
      'W7.5: keel-evaluate-adherence poste un corps que la fonction ne lit pas: %',
      j.command;
  end if;

  -- Et la résolution à l'exécution, pas à la migration.
  if position('app_config' in j.command) = 0
     or position('decrypted_secrets' in j.command) = 0 then
    raise exception
      'W7.5: keel-evaluate-adherence n''est pas cable sur app_config/vault (resolution figee a la migration ?)';
  end if;
end $$;
