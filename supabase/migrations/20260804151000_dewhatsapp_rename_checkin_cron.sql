-- DE-WHATSAPP — P8 : le cron suit la fonction renommée.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `schedule-whatsapp-v2-checkins` → `schedule-checkins-v2`.
--
-- La fonction ne parle plus à WhatsApp depuis P2 : elle PLANIFIE des check-ins,
-- c'est tout ce qu'elle a jamais fait, et la livraison est ailleurs. Le nom
-- désignait le transport d'hier.
--
-- ── L'ORDRE DE DÉPLOIEMENT EST UN PIÈGE, ET IL EST DIT DANS STATUS ──────────
-- Un renommage d'edge function n'est pas atomique côté distant : entre le
-- `functions deploy` de la neuve et cette migration, le cron pointe encore sur
-- l'ancienne (qui existe toujours tant qu'on ne l'a pas supprimée). L'ordre sûr
-- est donc : déployer `schedule-checkins-v2`, PUIS pousser cette migration,
-- PUIS supprimer l'ancienne fonction. Jamais l'inverse — sinon le cron tape un
-- 404 toutes les heures en silence.
--
-- Le corps du job est REPRIS TEL QUEL depuis `cron.job`, seul le nom de la
-- fonction appelée change : réécrire à la main un `net.http_post` avec sa
-- lecture de `vault.decrypted_secrets`, c'est risquer de perdre l'en-tête
-- interne — la panne exacte que `internal_send.ts` documentait (403 silencieux
-- comptés comme des envois réussis).

do $$
declare
  v_schedule text;
  v_command  text;
begin
  if to_regclass('cron.job') is null then
    raise notice 'dewhatsapp: pg_cron absent, rien a repointer';
    return;
  end if;

  select schedule, command into v_schedule, v_command
    from cron.job where jobname = 'schedule-whatsapp-v2-checkins' limit 1;

  if v_command is null then
    -- Déjà repointé, ou jamais programmé sur cette base. Les deux sont normaux.
    raise notice 'dewhatsapp: cron schedule-whatsapp-v2-checkins absent, rien a faire';
    return;
  end if;

  perform cron.unschedule('schedule-whatsapp-v2-checkins');
  perform cron.schedule(
    'schedule-checkins-v2',
    v_schedule,
    replace(v_command, 'schedule-whatsapp-v2-checkins', 'schedule-checkins-v2')
  );
  raise notice 'dewhatsapp: cron repointe -> schedule-checkins-v2 (%)', v_schedule;
end $$;

-- FAIL LOUD (R7).
do $$
declare
  bad text;
begin
  if to_regclass('cron.job') is null then return; end if;

  -- Plus aucun job ne NOMME ni n'APPELLE une fonction WhatsApp.
  select string_agg(jobname, ', ' order by jobname) into bad
    from cron.job
   where jobname ilike '%whatsapp%' or command ilike '%whatsapp-%';
  if bad is not null then
    raise exception 'dewhatsapp: cron(s) pointant encore WhatsApp: %', bad;
  end if;

  -- Et le planificateur de check-ins existe toujours: repointer ne doit pas
  -- vouloir dire perdre. Un dimanche sans check-in planifie ressemble a un
  -- dimanche calme.
  perform 1 from cron.job where jobname = 'schedule-checkins-v2';
  if not found then
    raise warning 'dewhatsapp: schedule-checkins-v2 absent du cron (normal si jamais programme sur cette base)';
  else
    raise notice 'dewhatsapp: schedule-checkins-v2 programme';
  end if;
end $$;
