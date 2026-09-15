-- ===========================================================================
-- FF-062 C1 + C2 — LE REPAS D'UN CRÉNEAU DÉCLARÉ, ET LE RAPPEL DE PESÉE.
--
-- Autorité: docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md
--
-- ── UN CRON POUR DEUX CANAUX, ET C'EST LA LEÇON DE §1 ─────────────────────
--
-- La fiche ouvre sur ce constat: « deux canaux se coordonnent par une
-- CONVENTION entre deux crons — la fenêtre 19h-20h contre 20h-22h — et cette
-- convention n'est écrite que dans le commentaire de l'un des deux. Un
-- troisième canal ajouté sans la connaître produit deux notifications le même
-- soir, et personne ne le verrait avant de le mesurer. »
--
-- Poser deux crons de plus aurait rejoué exactement ça. `keel-proactive-v1`
-- porte les deux fenêtres dans le même fichier, à quinze lignes l'une de
-- l'autre, et son compte-rendu les affiche côte à côte.
--
-- ── LA MINUTE, ET POURQUOI :30 ────────────────────────────────────────────
-- Relevé sur `cron.job` le 2026-09-02, pas de mémoire:
--   :05 keel-daily-recommendation (morte, FF-028 abandonnée) · :10 pouls ·
--   :15 divergence · :20 keel-apply-scheduled-client-ends · :25 relance ·
--   :40 point hebdo · et keel-coach-broadcast sur 5,15,25,35,45,55.
--
-- :30 et :50 sont les deux seules minutes libres de toute la série. On prend
-- :30. (:05 sera libérée par le retrait de la recommandation — on ne la reprend
-- pas: réutiliser la minute d'un job supprimé dans le même chantier rendrait
-- `cron.job` ambigu à lire pendant la transition.)
--
-- ⚠️ 🔴 ET LE CONTRÔLE DE COLLISION DE 20260901220000 EST TROP FAIBLE — noté
-- ici parce que c'est le prochain qui le lira. Il compare `schedule` À LA
-- CHAÎNE (`= '15 * * * *'`), donc il ne voit pas `keel-coach-broadcast`, dont
-- la planification est `5,15,25,35,45,55 * * * *`. La divergence PARTAGE donc
-- réellement :15 avec la diffusion de cohorte, et sa garde a dit le contraire.
-- Le dégât est borné (deux jobs indépendants, aucun ordre requis entre eux),
-- mais la GARDE, elle, était fausse. Celle du bas développe les listes de
-- minutes avant de comparer.
--
-- ── LES FENÊTRES VIVENT DANS LE CODE, PAS ICI ─────────────────────────────
-- C1 part aux heures de repas ÉCOULÉES (repli 10h/14h/21h, l'heure déclarée
-- l'emporte — `SLOT_PASSED_HOUR` et `rhythmClockFrom`), C2 entre 17h et 19h,
-- les deux en heure LOCALE de l'élève. Le cron est HORAIRE pour la même raison
-- que tous les autres: un job quotidien ne servirait correctement qu'un seul
-- fuseau (bug latent n°2, BUILD_PLAN W1.3).
--
-- ⚠️ CETTE MIGRATION S'APPLIQUE AVEC LE DÉPLOIEMENT DE LA FONCTION. Le runtime
-- edge local ne SERT que les fonctions listées dans
-- `SUPABASE_INTERNAL_FUNCTIONS_CONFIG`, figée à la création du conteneur: tant
-- que `supabase stop && supabase start` n'a pas tourné, `keel-proactive-v1`
-- rend 404, et planifier le cron avant ça ferait taper un 404 toutes les heures
-- dans un environnement partagé.
--
-- Helper repris À L'IDENTIQUE de 20260901220000: les secrets se résolvent à
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
  'keel-proactive', '30 * * * *', 'keel-proactive-v1',
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
  from cron.job where jobname = 'keel-proactive';
  if j is null then
    raise exception 'ff062: cron keel-proactive introuvable';
  end if;
  if j.schedule is distinct from '30 * * * *' then
    raise exception 'ff062: planifié sur % au lieu de 30 * * * *', j.schedule;
  end if;
  if not j.active then
    raise exception 'ff062: cron inactif';
  end if;
  if position('keel-proactive-v1' in j.command) = 0 then
    raise exception 'ff062: la commande ne nomme pas keel-proactive-v1';
  end if;
  if position('decrypted_secrets' in j.command) = 0 then
    raise exception 'ff062: la commande ne résout pas son secret à l''exécution';
  end if;

  -- LA MINUTE EST À NOUS SEULS, ET ON DÉVELOPPE LES LISTES.
  --
  -- ⚠️ UN `schedule = '30 * * * *'` NE SUFFIT PAS: `keel-coach-broadcast` est
  -- planifié `5,15,25,35,45,55 * * * *`, et une comparaison de chaîne ne le
  -- voit sur AUCUNE de ses six minutes. C'est le trou par lequel la garde de
  -- 20260901220000 a déclaré :15 libre alors qu'elle ne l'était pas.
  --
  -- On découpe donc le premier champ sur les virgules, et on compare des
  -- MINUTES. Les plannings non horaires (`0 6 * * 1`) sont écartés par le
  -- filtre sur les quatre champs suivants: ils ne tombent pas toutes les heures
  -- et ne peuvent donc pas se disputer un créneau horaire.
  select j2.jobname into clash
  from cron.job j2,
       lateral unnest(string_to_array(split_part(j2.schedule, ' ', 1), ',')) as m(minute)
  where j2.jobname <> 'keel-proactive'
    and j2.jobname like 'keel-%'
    and split_part(j2.schedule, ' ', 2) = '*'
    and split_part(j2.schedule, ' ', 3) = '*'
    and split_part(j2.schedule, ' ', 4) = '*'
    and split_part(j2.schedule, ' ', 5) = '*'
    and btrim(m.minute) = '30'
  limit 1;
  if clash is not null then
    raise exception 'ff062: la minute :30 est déjà prise par %', clash;
  end if;

  raise notice 'ff062: cron keel-proactive planifié (%) -> keel-proactive-v1', j.schedule;
end $$;
