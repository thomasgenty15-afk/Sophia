-- ===========================================================================
-- FF-063 LOT 4 — LES E-MAILS DE CYCLE DE VIE PRENNENT LEUR CRON.
--
-- Autorité produit: docs/fonctionnalites/acquisition-et-acces/README.md ·
-- docs/keel/LEGAL.md §6 · CLAUDE.md « le modèle produit ».
-- Amont: 20260910120000 (l'interrupteur, le jeton, la présence, l'essai à 7 j).
--
-- ── CE QUE CE JOB REMPLACE, ET CE QU'IL NE REPREND PAS ───────────────────
-- `trigger-retention-emails` tournait tous les jours à 09:00 et envoyait de
-- VRAIS e-mails de rétention au nom du coach de vie. Son cron a été déprogrammé
-- le 2026-08-03 (20260803030000). On ne le replanifie pas: ses quatre textes
-- vendent un produit qui n'existe plus, et sa lecture d'essai (`profiles.
-- trial_end`, quatorze jours) ne dit plus la même chose que la page de vente.
-- Il est retiré au lot 8, quand son remplaçant porte la fin d'essai.
--
-- ── POURQUOI HORAIRE, ALORS QU'UN E-MAIL EST QUOTIDIEN ──────────────────
-- L'heure d'envoi est LOCALE (`LIFECYCLE_SEND_HOUR = 10`). Un job quotidien ne
-- servirait correctement qu'un seul fuseau — c'est le bug latent n°2 du
-- BUILD_PLAN, et tous les jobs proactifs du dépôt sont horaires pour cette
-- raison. Le test d'heure est le PREMIER de la boucle: il écarte environ
-- vingt-trois personnes sur vingt-quatre avant la moindre requête de plus.
--
-- ── LA MINUTE, ET POURQUOI :50 ──────────────────────────────────────────
-- Relevé sur `cron.job` le 2026-09-09. Occupées à l'heure: :00 checkins v2 ·
-- :07 purge des compteurs · :11 balayage des brouillons · :15 divergence ·
-- :20 fins de contrat · :25 relance · :30 proactif · :40 point hebdo (inactif)
-- · 5,15,25,35,45,55 diffusion coach. :50 est libre, et il est APRÈS :30 —
-- sans conséquence, les deux jobs ne partagent aucune ressource, mais le
-- proactif in-app est ce que la garde `proactive_spoke_today` interroge, et le
-- lire APRÈS qu'il a écrit vaut mieux que l'inverse.
--
-- ⚠️ CETTE MIGRATION S'APPLIQUE AVEC LE DÉPLOIEMENT DE LA FONCTION. Le runtime
-- edge local ne SERT que les fonctions listées dans
-- `SUPABASE_INTERNAL_FUNCTIONS_CONFIG`, figée à la création du conteneur: tant
-- que `supabase stop && supabase start` n'a pas tourné,
-- `keel-lifecycle-email-v1` rend 404, et planifier le cron avant ça ferait
-- taper un 404 toutes les heures dans un environnement partagé.
--
-- Helper repris À L'IDENTIQUE de 20260902100000: les secrets se résolvent à
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
  'keel-lifecycle-email', '50 * * * *', 'keel-lifecycle-email-v1',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- LA PREUVE — fail loud (R7)
-- ---------------------------------------------------------------------------
-- « Le job existe » est la vérification qui a déjà laissé passer W7.5. On
-- assert donc aussi qu'il NOMME la bonne fonction, qu'il résout son secret à
-- l'exécution, et que sa minute n'est partagée avec aucun autre job keel.
do $$
declare
  j record;
  clash text;
begin
  select schedule, active, command into j
  from cron.job where jobname = 'keel-lifecycle-email';
  if j is null then
    raise exception 'ff063: cron keel-lifecycle-email introuvable';
  end if;
  if j.schedule is distinct from '50 * * * *' then
    raise exception 'ff063: planifié sur % au lieu de 50 * * * *', j.schedule;
  end if;
  if not j.active then
    raise exception 'ff063: cron inactif';
  end if;
  if position('keel-lifecycle-email-v1' in j.command) = 0 then
    raise exception 'ff063: la commande ne nomme pas keel-lifecycle-email-v1';
  end if;
  if position('decrypted_secrets' in j.command) = 0 then
    raise exception 'ff063: la commande ne résout pas son secret à l''exécution';
  end if;

  -- LA MINUTE EST À NOUS SEULS.
  --
  -- ⚠️ ON DÉVELOPPE LES LISTES DE MINUTES. La version qui comparait
  -- `schedule = '50 * * * *'` à la chaîne ratait `keel-coach-broadcast`, dont
  -- le planning est `5,15,25,35,45,55 * * * *` — défaut nommé dans le pavé de
  -- 20260902100000.
  select j2.jobname into clash
  from cron.job j2,
       lateral unnest(string_to_array(split_part(j2.schedule, ' ', 1), ',')) as m(minute)
  where j2.jobname <> 'keel-lifecycle-email'
    and j2.jobname like 'keel-%'
    and split_part(j2.schedule, ' ', 2) = '*' and split_part(j2.schedule, ' ', 3) = '*'
    and split_part(j2.schedule, ' ', 4) = '*' and split_part(j2.schedule, ' ', 5) = '*'
    and btrim(m.minute) = '50'
  limit 1;
  if clash is not null then
    raise exception 'ff063: la minute :50 est déjà prise par %', clash;
  end if;

  raise notice 'ff063: cron keel-lifecycle-email planifié (%) -> keel-lifecycle-email-v1', j.schedule;
end $$;
