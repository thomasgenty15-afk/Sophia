-- ============================================================================
-- KEEL — correctifs des bloquants de la review adversariale (docs/keel/MEGA_REVIEW.md)
--
-- Trois défauts trouvés par la review et reproduits en HTTP réel via Kong.
-- Chacun est corrigé ici avec sa preuve dans le commentaire.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- B2 — Les vues Tier B étaient ÉCRIVABLES.
--
-- La migration de tenancy révoquait bien les droits sur les TABLES de base
-- (20260727120000:333-341) mais, sur les deux vues, ne révoquait que `anon`
-- (:507-510). Les vues sont `owned by postgres` (rolbypassrls) et
-- `security_invoker=off`, donc auto-updatables et SANS `WITH CHECK OPTION` :
--   relacl = {…, authenticated=arwdDxtm, …}
--
-- Reproduit via Kong avec un vrai JWT :
--   * JWT coach  : PATCH  /rest/v1/coach_student_events?user_id=eq.<élève>  -> 200, faits réécrits
--                  DELETE /rest/v1/coach_student_events?user_id=eq.<élève>  -> 204, table vidée
--   * JWT ÉLÈVE  : INSERT sur la vue -> 1 ligne, événement FORGÉ sur un AUTRE utilisateur
--     (son `coached_student_ids()` est pourtant vide)
--
-- Donc : le coach n'était pas structurellement read-only (CONTRACT), et la
-- forge de faits était ouverte any-authenticated -> any-user. Le test
-- `tenancy_rls_test.sql:290` affirmait « coach insert blocked » — vrai sur la
-- table, faux à travers la vue livrée par la même migration.
--
-- Correctif : SELECT seul. `authenticated` ne peut plus écrire à travers la vue.
-- ---------------------------------------------------------------------------
revoke all on public.coach_student_events    from authenticated;
revoke all on public.coach_student_directory from authenticated;
grant select on public.coach_student_events    to authenticated;
grant select on public.coach_student_directory to authenticated;

-- Ceinture : `anon` n'a jamais rien à faire ici (déjà révoqué, on le refait
-- pour que cette migration soit auto-suffisante si l'ordre change un jour).
revoke all on public.coach_student_events    from anon;
revoke all on public.coach_student_directory from anon;


-- ---------------------------------------------------------------------------
-- B3 — `invoke_internal_edge_function` était exécutable par `anon`.
--
-- Fonction SECURITY DEFINER héritée (20260706160000, pré-KEEL) dont l'ACL
-- portait `anon=X` sans aucun `revoke`, alors que le projet applique ce garde-
-- fou à 12+ autres fonctions SECURITY DEFINER. Elle injecte le secret interne
-- côté serveur : l'appeler suffisait à contourner `ensureInternalRequest` sur
-- ~28 fonctions. Vérifié : POST avec la seule clé publishable anon -> HTTP 204.
--
-- Conséquences concrètes mesurées : `{"mode":"sweep","ignore_timezone_gate":true}`
-- forçait la clôture de journée de TOUTE la flotte sans connaître un seul UUID ;
-- `whatsapp-send` permettait un message arbitraire à n'importe quel user_id ;
-- les `trigger-*-batch` permettaient de brûler du coût LLM.
--
-- Ce qui rend le correctif sûr : c'est une primitive MORTE. Vérifié —
--   select proname from pg_proc where prosrc ilike '%invoke_internal_edge_function%'
--     -> elle seule
--   select jobname from cron.job where command ilike '%invoke_internal_edge_function%'
--     -> 0 ligne
-- Les migrations KEEL ont supprimé ses derniers appelants. On révoque donc tout
-- accès applicatif sans rien casser ; `postgres`/`service_role` la gardent pour
-- un usage serveur futur.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'invoke_internal_edge_function'
  ) then
    execute 'revoke all on function public.invoke_internal_edge_function(text, jsonb) from public';
    execute 'revoke all on function public.invoke_internal_edge_function(text, jsonb) from anon';
    execute 'revoke all on function public.invoke_internal_edge_function(text, jsonb) from authenticated';
  end if;
exception when others then
  -- La signature peut différer selon l'historique local : on tente la forme
  -- générique plutôt que d'échouer la migration.
  raise notice 'invoke_internal_edge_function: revoke par signature impossible (%), tentative generique', sqlerrm;
end $$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'invoke_internal_edge_function'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- B1 — L'évaluateur n'était JAMAIS appelé.
--
-- `evaluate-adherence-v1` n'avait aucun appelant : ni cron, ni trigger, ni
-- client, ni brain (grep -> seulement des commentaires, config.toml et un
-- import de TYPE). Le balayage de fin de journée (`keel_sweep_day_evaluations`)
-- ne référence jamais `protocol_events` : il passe tout `unknown` en `missed`.
--
-- Conséquence : un élève qui tape « Log it » à 9 h voit sa ligne notée `missed`
-- à 23 h 55. Preuve indépendante dans la base e2e locale : les lignes `met`
-- portent un `resolved_at` à la MILLISECONDE (timestamp JS = le curl manuel de
-- vérification) et les `missed` à la MICROSECONDE (`now()` SQL = le sweep).
-- L'évaluateur n'a jamais tourné autrement qu'à la main.
--
-- Correctif : un cron horaire à :45, soit AVANT le sweep de :55 — l'ordre
-- compte, sinon le sweep verrouille en `missed` des lignes que l'évaluateur
-- aurait résolues. Le pattern app_config + vault est celui des migrations
-- existantes (20260615133000).
-- ---------------------------------------------------------------------------
-- La config (`app_config`, vault) est seedée APRÈS les migrations : elle doit
-- donc être résolue À L'EXÉCUTION du job, pas ici. C'est exactement ce que fait
-- le helper de 20260727175000 pour `keel-provision-day` / `keel-sweep-day` —
-- on le reprend à l'identique plutôt que d'en dupliquer une variante qui
-- divergerait.
create or replace function pg_temp.keel_schedule_internal_edge_job(
  p_jobname text,
  p_schedule text,
  p_function_name text,
  p_body jsonb
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
  '{"mode":"due"}'::jsonb
);

-- Fail loud (R7) : un job silencieusement non planifié, c'est une flotte dont
-- l'adhérence n'est jamais calculée — exactement le bloquant qu'on répare.
do $$
declare sched text;
begin
  select schedule into sched from cron.job where jobname = 'keel-evaluate-adherence';
  if sched is distinct from '45 * * * *' then
    raise exception 'keel-evaluate-adherence non planifie (schedule=%)', coalesce(sched, 'ABSENT');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- G1 (moitié serveur) — un tap sur une ligne `polarity='avoid'` inversait la note.
--
-- Le front n'a aucune branche de polarité (`CommitmentLine.tsx:33` :
-- `canLog = !line.isAutoSourced`), donc « Log it » s'affichait sur « pas
-- d'alcool en semaine ». Sonde exécutée sur une ligne réelle : sans tap ->
-- `met` ; avec tap -> `missed`, alors que le tap portait `quantity=0`.
-- Aggravations : la ligne est `evaluation_grain='week'`, donc UN tap faisait
-- basculer une ligne `core` de toute la semaine ; et `protocol_events` n'a pas
-- de policy DELETE, donc l'élève ne pouvait pas se rétracter.
--
-- Le correctif principal est côté front (retirer le bouton). Ici on ajoute le
-- filet serveur qui manquait : l'élève peut supprimer un fait qu'il a lui-même
-- produit par tap, le jour même. On n'ouvre PAS la suppression des faits de
-- chat/photo/coach (append-only reste la règle pour tout ce qui n'est pas une
-- erreur d'interface).
-- ---------------------------------------------------------------------------
drop policy if exists rls_protocol_events_delete_own_quick_tap on public.protocol_events;
create policy rls_protocol_events_delete_own_quick_tap
  on public.protocol_events
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and source = 'quick_tap'
    and occurred_at > now() - interval '36 hours'
  );
