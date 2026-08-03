-- PIVOT NUTRITION — planification des deux jobs neufs.
--
--   `keel-coach-synthesis`  lundi 06:00 UTC  -> coach-synthesis-v1
--   `keel-reengage`         toutes les heures -> keel-reengage-v1
--
-- Le helper est repris À L'IDENTIQUE de `20260728090000` (lui-même repris de
-- `20260727175000`) plutôt que réécrit: l'URL, la clé anon et
-- `INTERNAL_FUNCTION_SECRET` sont seedés APRÈS les migrations et doivent donc
-- être résolus À L'EXÉCUTION. Un job qui les interpole ici part avec des
-- chaînes vides et poste dans le vide — silencieusement, parce que pg_net rend
-- un identifiant de requête et pas un statut HTTP, donc `cron.job_run_details`
-- affiche `succeeded` sur un échec total. C'est le défaut exact que la
-- migration W7.5 documente; on ne le refait pas.
--
-- ── POURQUOI CES HORAIRES ────────────────────────────────────────────────
--
-- `keel-coach-synthesis` — LUNDI 06:00 UTC.
--   La synthèse porte sur la semaine qui vient de se clore (lundi→dimanche).
--   06:00 UTC place l'envoi au petit matin européen et dans la nuit US, donc
--   avant que le coach n'ouvre quoi que ce soit: la valeur est POUSSÉE (§1.4),
--   elle doit être là quand il regarde son téléphone, pas se déclencher pendant
--   qu'il travaille.
--   Après `keel-week-rollover-v1` (10 0 * * *) et après le balayage de fin de
--   journée du dimanche (`keel-sweep-day`, 55 * * * *): la semaine doit être
--   ÉVALUÉE avant d'être racontée, sinon la synthèse rapporte des `unknown`
--   que le balayage aurait résolus.
--   Idempotent (upsert sur la période): un rejeu le mardi met à jour la même
--   ligne.
--
-- `keel-reengage` — TOUTES LES HEURES, à :25.
--   Un balayage horaire est le minimum pour un produit multi-fuseaux: la
--   décision dépend de l'heure LOCALE de l'élève (heures calmes 21h-08h), donc
--   un job quotidien ne pourrait servir qu'un seul fuseau correctement. À :25
--   pour ne pas tomber sur les minutes déjà chargées (:00 provision, :45
--   évaluation, :55 balayage).
--   Le job est sûr à rejouer: `openReengagementEpisode` matérialise l'épisode,
--   et l'épisode ouvert fait passer tous les ticks suivants en
--   `already_nudged_this_episode`. C'est l'état en base qui borne la relance à
--   une par silence, pas la fréquence du cron.

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
  'keel-coach-synthesis',
  '0 6 * * 1',
  'coach-synthesis-v1',
  '{}'::jsonb
);

select pg_temp.keel_schedule_internal_edge_job(
  'keel-reengage',
  '25 * * * *',
  'keel-reengage-v1',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Fail loud (R7). « Le job existe » est exactement la vérification qui a laissé
-- passer le défaut W7.5: le job existait, était actif, et postait un corps que
-- la fonction ne comprenait pas. On assert donc aussi que la commande NOMME la
-- bonne fonction et qu'elle résout ses secrets à l'exécution.
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
  expected record;
begin
  for expected in
    select * from (values
      ('keel-coach-synthesis', '0 6 * * 1', 'coach-synthesis-v1'),
      ('keel-reengage',        '25 * * * *', 'keel-reengage-v1')
    ) as t(jobname, schedule, fn)
  loop
    select schedule, active, command into j
    from cron.job where jobname = expected.jobname;

    if j is null then
      raise exception 'pivot: cron job % introuvable après planification', expected.jobname;
    end if;
    if j.schedule is distinct from expected.schedule then
      raise exception 'pivot: % planifié sur % au lieu de %',
        expected.jobname, j.schedule, expected.schedule;
    end if;
    if not j.active then
      raise exception 'pivot: % est inactif', expected.jobname;
    end if;
    if position(expected.fn in j.command) = 0 then
      raise exception 'pivot: la commande de % ne nomme pas %',
        expected.jobname, expected.fn;
    end if;
    if position('decrypted_secrets' in j.command) = 0 then
      raise exception 'pivot: la commande de % n''résout pas son secret à l''exécution',
        expected.jobname;
    end if;
    raise notice 'pivot: cron % planifié (%) -> %', expected.jobname, j.schedule, expected.fn;
  end loop;
end $$;
