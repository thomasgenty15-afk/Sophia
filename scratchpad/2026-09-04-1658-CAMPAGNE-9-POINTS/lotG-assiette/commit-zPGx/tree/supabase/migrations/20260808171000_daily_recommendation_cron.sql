-- ===========================================================================
-- FF-028 — LE CRON DE LA RECOMMANDATION DU SOIR.
--
-- HORAIRE, à :05. La fenêtre (19h-20h) est en heure LOCALE de l'élève, donc un
-- job quotidien ne servirait correctement qu'un seul fuseau — c'est le bug
-- latent n°2 de BUILD_PLAN W1.3 (« planificateur cassé hors Europe »), qu'on ne
-- refait pas. À :05 pour ne tomber sur aucune minute déjà chargée (:00
-- provision, :10 tap du soir, :25 relance, :45 évaluation, :55 balayage).
--
-- ── POURQUOI 19h ET PAS 20h: C'EST CE QUI TIENT « UN SEUL MESSAGE PAR SOIR » ─
-- La fenêtre précède STRICTEMENT celle du tap du soir (20h-22h). Ce n'est donc
-- pas une convention entre deux crons: au tick de 19h le tap est hors fenêtre
-- et ne peut pas parler; aux ticks de 20h et 21h le tap lit
-- `wasRecommendationSentToday` et se retire. Les deux jobs peuvent tourner dans
-- n'importe quel ordre, y compris en parallèle: l'élève reçoit UN message.
--
-- Le job est sûr à rejouer: `student_daily_recommendations` porte
-- `unique (user_id, local_date)` et le décideur écarte `already_proposed_today`
-- et `awaiting_response`. Deux ticks ne produisent pas deux propositions.
--
-- ⚠️ CETTE MIGRATION N'A PAS ÉTÉ APPLIQUÉE EN LOCAL, ET C'EST DÉLIBÉRÉ.
-- Le runtime edge local ne SERT que les fonctions listées dans
-- `SUPABASE_INTERNAL_FUNCTIONS_CONFIG`, figée à la création du conteneur: tant
-- que `supabase stop && supabase start` n'a pas tourné, `keel-daily-
-- recommendation-v1` rend 404. Planifier le cron avant ça ferait taper un 404
-- toutes les heures dans un environnement partagé avec d'autres sessions. Elle
-- s'applique AVEC le déploiement de la fonction — voir le rapport FF-028.
--
-- Helper repris À L'IDENTIQUE de 20260803180000: les secrets se résolvent à
-- l'EXÉCUTION, jamais interpolés — sinon le job poste dans le vide et
-- `cron.job_run_details` affiche quand même `succeeded` (pg_net rend un id de
-- requête, pas un statut HTTP).
-- ===========================================================================

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
  'keel-daily-recommendation', '5 * * * *', 'keel-daily-recommendation-v1',
  '{}'::jsonb
);

-- Fail loud (R7): « le job existe » est la vérification qui avait laissé passer
-- le défaut W7.5. On assert aussi qu'il NOMME la bonne fonction, qu'il résout
-- son secret, ET qu'il tourne AVANT le tap du soir — cette dernière condition
-- est la garantie « un seul message par soir », et la perdre en changeant une
-- minute serait invisible autrement.
do $$
declare
  j record;
  pulse record;
begin
  select schedule, active, command into j
  from cron.job where jobname = 'keel-daily-recommendation';
  if j is null then
    raise exception 'ff028: cron keel-daily-recommendation introuvable';
  end if;
  if j.schedule is distinct from '5 * * * *' then
    raise exception 'ff028: planifié sur % au lieu de 5 * * * *', j.schedule;
  end if;
  if not j.active then raise exception 'ff028: cron inactif'; end if;
  if position('keel-daily-recommendation-v1' in j.command) = 0 then
    raise exception 'ff028: la commande ne nomme pas keel-daily-recommendation-v1';
  end if;
  if position('decrypted_secrets' in j.command) = 0 then
    raise exception 'ff028: la commande ne résout pas son secret à l''exécution';
  end if;

  select schedule into pulse from cron.job where jobname = 'keel-daily-pulse';
  if pulse is not null and pulse.schedule = j.schedule then
    raise exception
      'ff028: la recommandation et le tap du soir partagent la minute % — '
      'l''ordonnancement n''est plus déterministe', j.schedule;
  end if;

  raise notice 'ff028: cron keel-daily-recommendation planifié (%)', j.schedule;
end $$;
