-- PIVOT NUTRITION — N2 : le cron du tap du soir.
--
-- HORAIRE, à :10. La fenêtre (20h-22h) est en heure LOCALE de l'élève, donc un
-- job quotidien ne servirait correctement qu'un seul fuseau — c'est le bug
-- latent n°2 de BUILD_PLAN W1.3 (« planificateur cassé hors Europe »), qu'on
-- ne refait pas. À :10 pour ne pas tomber sur les minutes déjà chargées
-- (:00 provision, :25 relance, :45 évaluation, :55 balayage).
--
-- Le job est sûr à rejouer : `student_daily_checkins` porte
-- `unique (user_id, local_date)` et le décideur écarte `already_answered_today`.
-- Deux ticks dans la même fenêtre ne produisent pas deux questions.
--
-- Helper repris À L'IDENTIQUE de 20260728090000 : les secrets se résolvent à
-- l'EXÉCUTION, jamais interpolés — sinon le job poste dans le vide et
-- `cron.job_run_details` affiche quand même `succeeded` (pg_net rend un id de
-- requête, pas un statut HTTP).

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

create or replace function pg_temp.keel_schedule_internal_edge_job(
  p_jobname text, p_schedule text, p_function_name text, p_body jsonb default '{}'::jsonb
) returns void language plpgsql as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = p_jobname;
  perform cron.schedule(p_jobname, p_schedule, format($command$
      with cfg as (
        select
          coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
          coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
          coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
      )
      select net.http_post(
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
      where (select base_url from cfg) <> '' and (select anon_key from cfg) <> ''
        and (select internal_secret from cfg) <> '';
      $command$, p_function_name, p_body::text));
end;
$$;

select pg_temp.keel_schedule_internal_edge_job(
  'keel-daily-pulse', '10 * * * *', 'keel-daily-pulse-v1', '{}'::jsonb
);

-- Fail loud (R7): « le job existe » est la vérification qui avait laissé
-- passer le défaut W7.5. On assert aussi qu'il NOMME la bonne fonction et
-- qu'il résout son secret.
do $$
declare j record;
begin
  select schedule, active, command into j from cron.job where jobname = 'keel-daily-pulse';
  if j is null then
    raise exception 'pivot: cron keel-daily-pulse introuvable';
  end if;
  if j.schedule is distinct from '10 * * * *' then
    raise exception 'pivot: keel-daily-pulse planifié sur % au lieu de 10 * * * *', j.schedule;
  end if;
  if not j.active then raise exception 'pivot: keel-daily-pulse inactif'; end if;
  if position('keel-daily-pulse-v1' in j.command) = 0 then
    raise exception 'pivot: la commande ne nomme pas keel-daily-pulse-v1';
  end if;
  if position('decrypted_secrets' in j.command) = 0 then
    raise exception 'pivot: la commande ne résout pas son secret à l''exécution';
  end if;
  raise notice 'pivot: cron keel-daily-pulse planifié (%) -> keel-daily-pulse-v1', j.schedule;
end $$;
