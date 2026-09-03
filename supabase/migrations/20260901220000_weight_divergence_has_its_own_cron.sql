-- ===========================================================================
-- FF-056 — LA DIVERGENCE CONSTATÉE PREND SON PROPRE CRON.
--
-- Autorité: docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md
-- (canal C6, règle R9) · FF-056 · FF-028 (abandonnée le 2026-09-01).
--
-- ── 🔴 CE N'EST PAS UN DÉMÉNAGEMENT. C'EST UNE MISE EN SERVICE. ────────────
--
-- La divergence était greffée dans la boucle de `keel-daily-recommendation-v1`,
-- et son bloc était placé APRÈS le `try/catch` de la recommandation. Ce `try`
-- sortait par `continue` dans ses quatre cas non-nominaux (`outside_window`,
-- `skipped`, `silent`, `not_delivered`) — donc le bloc de divergence était
-- SAUTÉ pour tout élève qui ne recevait pas de recommandation, c'est-à-dire
-- pour le cas nominal (« part des soirs sans recommandation: attendu
-- majoritaire », dit la fiche FF-028 elle-même).
--
-- Le défaut était invisible: le compte-rendu ne portait que `divergence_asked`,
-- dont la valeur nominale est zéro. `keel-weight-divergence-v1` rend désormais
-- `examined` À CÔTÉ de `asked` — le premier vaut zéro seulement si le pas cesse
-- d'être atteint, et c'est ce qui rendra la panne lisible la prochaine fois.
--
-- ── POURQUOI UN SECOND CRON, ALORS QUE LA GREFFE AVAIT SON MOTIF ───────────
-- Le motif écrit en 20260808171000 était bon: « un second cron aurait doublé le
-- coût du balayage et rendu l'arbitrage du budget T4 dépendant de l'ordre
-- d'exécution de deux jobs indépendants: non déterministe ». Deux choses l'ont
-- périmé le 2026-09-01: FF-028 est abandonnée (le balayage hôte disparaît, il
-- n'y a plus rien sur quoi se greffer), et l'arbitrage du budget passe
-- désormais par un ordonnanceur (FF-062), pas par l'ordre de deux crons.
--
-- ── LA MINUTE, ET POURQUOI :15 ────────────────────────────────────────────
-- Occupées: :00 provision · :05 recommandation (bientôt libre) · :10 tap du
-- soir · :25 relance · :40 point hebdo · :45 évaluation · :55 balayage.
-- :15 est libre, et il est APRÈS :10 — sans conséquence, les deux fenêtres
-- locales ne se recouvrent pas (19h-20h contre 20h-22h).
--
-- ⚠️ ON NE REPREND PAS :05. La minute de la recommandation sera libérée par son
-- retrait, mais réutiliser la minute d'un job qu'on supprime dans le même
-- chantier rendrait un `cron.job` ambigu à lire pendant la transition.
--
-- ── LA FENÊTRE RESTE CELLE DU MOTEUR, ET ELLE N'EST PAS ICI ───────────────
-- `runWeightDivergenceStep` porte sa propre fenêtre 19h-20h en heure LOCALE.
-- Ce cron est HORAIRE pour la même raison que tous les autres: un job quotidien
-- ne servirait correctement qu'un seul fuseau (bug latent n°2, BUILD_PLAN
-- W1.3). Le plafond mensuel, lui, vit dans `evaluateCooldown` (42/84 jours).
--
-- ⚠️ CETTE MIGRATION S'APPLIQUE AVEC LE DÉPLOIEMENT DE LA FONCTION, comme
-- 20260808171000 avant elle. Le runtime edge local ne SERT que les fonctions
-- listées dans `SUPABASE_INTERNAL_FUNCTIONS_CONFIG`, figée à la création du
-- conteneur: tant que `supabase stop && supabase start` n'a pas tourné,
-- `keel-weight-divergence-v1` rend 404, et planifier le cron avant ça ferait
-- taper un 404 toutes les heures dans un environnement partagé.
--
-- Helper repris À L'IDENTIQUE de 20260803180000 et 20260808171000: les secrets
-- se résolvent à l'EXÉCUTION, jamais interpolés — sinon le job poste dans le
-- vide et `cron.job_run_details` affiche quand même `succeeded` (pg_net rend un
-- id de requête, pas un statut HTTP).
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
  'keel-weight-divergence', '15 * * * *', 'keel-weight-divergence-v1',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- LA PREUVE — fail loud (R7)
-- ---------------------------------------------------------------------------
-- « Le job existe » est la vérification qui avait laissé passer le défaut W7.5.
-- On assert donc aussi qu'il NOMME la bonne fonction, qu'il résout son secret à
-- l'exécution, et qu'il ne partage sa minute avec aucun autre job keel.

do $$
declare
  j record;
  clash text;
begin
  select schedule, active, command into j
  from cron.job where jobname = 'keel-weight-divergence';
  if j is null then
    raise exception 'ff056: cron keel-weight-divergence introuvable';
  end if;
  if j.schedule is distinct from '15 * * * *' then
    raise exception 'ff056: planifié sur % au lieu de 15 * * * *', j.schedule;
  end if;
  if not j.active then
    raise exception 'ff056: cron inactif';
  end if;
  if position('keel-weight-divergence-v1' in j.command) = 0 then
    raise exception 'ff056: la commande ne nomme pas keel-weight-divergence-v1';
  end if;
  if position('decrypted_secrets' in j.command) = 0 then
    raise exception 'ff056: la commande ne résout pas son secret à l''exécution';
  end if;

  -- LA MINUTE EST À NOUS SEULS. Deux jobs sur la même minute rendent
  -- l'ordonnancement non déterministe, et c'est exactement ce que le chantier
  -- FF-062 existe pour supprimer.
  select jobname into clash
  from cron.job
  where jobname <> 'keel-weight-divergence'
    and jobname like 'keel-%'
    and schedule = '15 * * * *'
  limit 1;
  if clash is not null then
    raise exception 'ff056: la minute :15 est déjà prise par %', clash;
  end if;

  raise notice 'ff056: cron keel-weight-divergence planifié (%) -> keel-weight-divergence-v1', j.schedule;
end $$;
