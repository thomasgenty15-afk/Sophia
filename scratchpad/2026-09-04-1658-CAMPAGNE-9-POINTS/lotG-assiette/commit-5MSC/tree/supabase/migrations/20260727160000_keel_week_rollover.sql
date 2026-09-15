-- W2.B — Rollover hebdomadaire des items de plan + démontage du circuit de
-- validation semaine 1 (KEEL).
--
-- POURQUOI CE FICHIER EXISTE
-- La machine de validation hebdo par l'élève est supprimée (W2.B). Or
-- `activateDueWeekItemsForUser` — la fonction qui fait passer les items
-- `pending` de la semaine qui commence à `active` — n'avait qu'UN seul
-- appelant: `_shared/weekly_planning_lifecycle.ts::autoApplyWeeklyPlanning`,
-- déclenché par l'auto-validation de 07:00 locale. Supprimer ce fichier sans
-- re-loger l'appel casserait le déblocage des semaines EN SILENCE: aucune
-- erreur, aucun log, juste des items qui n'arrivent jamais. L'appel est
-- re-logé sur `keel-week-rollover-v1` (edge fn protégée par
-- `ensureInternalRequest`), planifié ici.
--
-- CADENCE: QUOTIDIENNE, PAS "LUNDI"
-- Un job hebdomadaire à lundi 00:10 UTC serait un piège identique au BUG 3 de
-- 20260727140000: `computeCurrentWeekOrder` lit la date LOCALE de l'ancre du
-- plan. À lundi 00:10 UTC il est encore dimanche pour tout fuseau à l'ouest de
-- UTC-1 — leur nouvelle semaine n'a pas commencé, rien n'est activé, et le
-- tick suivant est SEPT JOURS plus tard: la semaine entière serait perdue pour
-- ces utilisateurs. Un tick quotidien à 00:10 UTC borne le retard
-- d'activation à moins de 24 h dans TOUS les fuseaux (-11..+14) et reste
-- moins coûteux que l'ancien chemin (qui repassait de toute façon par user).
-- Idempotence: l'update est gardé par `.eq("status","pending")`, un re-jeu
-- le même jour n'active rien de plus.
--
-- Réversibilité: `cron.unschedule('keel-week-rollover-v1')` et recréer les
-- triggers depuis 20260615143000 / 20260703120000 / 20260706160000.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

-- 1. Cron de rollover ---------------------------------------------------------

do $$
declare
  job record;
begin
  for job in
    select jobid from cron.job where jobname = 'keel-week-rollover-v1'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

-- Même pattern app_config + vault que 20260615133000 / 20260727140000: base
-- url et clé anon depuis public.app_config, secret interne depuis vault, et le
-- post est purement sauté si l'un des trois manque.
create or replace function pg_temp.schedule_internal_edge_job(
  p_jobname text,
  p_schedule text,
  p_function_name text,
  p_body jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
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

select pg_temp.schedule_internal_edge_job(
  'keel-week-rollover-v1',
  '10 0 * * *',
  'keel-week-rollover-v1'
);

-- 2. Démontage du circuit de validation semaine 1 -----------------------------
--
-- Ces triggers POSTent vers `schedule-onboarding-week1-validation`, supprimée
-- en W2.B. Les laisser en place produirait un net.http_post vers un 404 à
-- chaque activation de plan / opt-in WhatsApp / changement de tier.

-- Activation d'un plan -> programmait le prompt de validation semaine 1.
drop trigger if exists trg_request_onboarding_week1_validation_schedule
  on public.user_plans_v2;
-- Opt-in WhatsApp tardif -> rattrapait le prompt manqué.
drop trigger if exists trg_request_onboarding_week1_validation_on_optin
  on public.profiles;

drop function if exists public.request_onboarding_week1_validation_schedule();
drop function if exists public.request_onboarding_week1_validation_on_optin();
-- Signature relevée en base: (p_user_id uuid, p_plan_id uuid,
-- p_activated_at timestamptz).
drop function if exists public.invoke_onboarding_week1_validation_schedule(
  uuid, uuid, timestamptz
);

-- Rattrapage de cycle de vie sur upgrade de tier: ses DEUX cibles sont
-- supprimées en W2.B (`trigger-level-review-transitions-v1` côté lot edge
-- functions, `schedule-onboarding-week1-validation` ici). Le trigger n'a plus
-- rien à rattraper.
drop trigger if exists trg_request_lifecycle_recovery_on_tier_upgrade
  on public.profiles;
drop function if exists public.request_lifecycle_recovery_on_tier_upgrade();

-- `public.invoke_internal_edge_function(text, jsonb)` est GARDÉE: c'est
-- l'invocateur générique, réutilisable par les futurs triggers KEEL.

-- 3. Fail loud (R7) -----------------------------------------------------------
-- Un no-op silencieux ici = plus aucun item de semaine N+1 activé, jamais.

do $$
declare
  rollover_schedule text;
  leftover_trigger text;
begin
  select schedule into rollover_schedule
  from cron.job where jobname = 'keel-week-rollover-v1';

  if rollover_schedule is distinct from '10 0 * * *' then
    raise exception
      'W2.B: keel-week-rollover-v1 must tick daily at 00:10 UTC, got %',
      coalesce(rollover_schedule, '<not scheduled>');
  end if;

  select t.tgname into leftover_trigger
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname in (
      'trg_request_onboarding_week1_validation_schedule',
      'trg_request_onboarding_week1_validation_on_optin',
      'trg_request_lifecycle_recovery_on_tier_upgrade'
    )
  limit 1;

  if leftover_trigger is not null then
    raise exception
      'W2.B: week1-validation trigger % still installed', leftover_trigger;
  end if;
end $$;
