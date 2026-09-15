-- LOT C — UNE RELANCE, ET UNE SEULE. LA LIGNE EST LA FILE, LE CRON L'ORDONNANCEUR.
--
-- Depuis le lot A, la composition est acceptée tôt (202) et finit dans le
-- worker, jusqu'au mur de la machine (400 s, mesuré). Un worker peut encore
-- mourir — 546, redémarrage, coupure — sans exécuter son `catch` : la ligne
-- reste `running`, puis une balayeuse la marque `failed/timed_out`. Avant ce
-- lot, personne ne relançait rien : la personne rechargeait une page qui ne
-- changerait jamais.
--
-- CE QUE FAIT CE LOT :
--   · trois colonnes : `attempt` (1 ou 2 — jamais plus), `relaunch_of` (la
--     mère), `relaunched_at` (posé UNE fois, dans le même `update` qui
--     sélectionne : un seul gagnant si deux ticks se chevauchent) ;
--   · `keel_claim_meal_drafts_for_relaunch()` : la réclamation, en SQL pur,
--     testée ici dans les deux sens ;
--   · `keel_relaunch_meal_drafts()` : réclame puis re-poste la MÊME demande à
--     `generate-household-meal-v1` (même `request_id`, corps stocké), avec le
--     secret interne et `x-on-behalf-of` — le patron des crons du dépôt
--     (20260728090000). Le handler ouvre une ligne fille `attempt = 2`.
--   · un cron par minute.
--
-- ⛔ CE QUI N'EST JAMAIS RELANCÉ : une ligne `sync` (ancien client), une
-- `attempt = 2`, une reprise locale (`edit_cells` — son brouillon de base est
-- la mère, morte), une ligne de plus d'une heure, une ligne déjà relancée.
--
-- ⚠️ LE GEL BÊTA (`keel_generation_pause_state`) REFUSE AUSSI UNE RELANCE : la
-- fille n'est pas ouverte, le navigateur attend sa grâce (90 s) puis rend
-- `plan_expired`. `net._http_response` garde le 503.

alter table public.student_meal_drafts
  add column if not exists attempt smallint not null default 1
    check (attempt in (1, 2)),
  add column if not exists relaunch_of uuid
    references public.student_meal_drafts(id) on delete set null,
  add column if not exists relaunched_at timestamptz;

create index if not exists student_meal_drafts_relaunch_of_idx
  on public.student_meal_drafts (relaunch_of)
  where relaunch_of is not null;

comment on column public.student_meal_drafts.attempt is
  'Lot C (2026-09-15) : 1 = la demande d''origine, 2 = sa relance. Jamais 3.';
comment on column public.student_meal_drafts.relaunch_of is
  'Lot C : la ligne mere dont celle-ci est la relance (attempt = 2).';
comment on column public.student_meal_drafts.relaunched_at is
  'Lot C : pose une seule fois par keel_claim_meal_drafts_for_relaunch(), dans '
  'le meme update qui selectionne — un seul gagnant si deux ticks se chevauchent.';

-- ---------------------------------------------------------------------------
-- LA RÉCLAMATION — pure, testable, atomique.
-- ---------------------------------------------------------------------------
create or replace function public.keel_claim_meal_drafts_for_relaunch()
returns table(id uuid, user_id uuid, request_id text, request_body jsonb)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.student_meal_drafts d
       set status = 'failed',
           error_code = coalesce(nullif(d.error_code, ''), 'timed_out'),
           error = coalesce(d.error, 'relanceur: aucune fin avant l''echeance du bail'),
           finished_at = coalesce(d.finished_at, now()),
           relaunched_at = now()
     where d.mode = 'async'
       and d.attempt = 1
       and d.relaunched_at is null
       and d.created_at > now() - interval '1 hour'
       and coalesce(d.request_body ->> 'operation', 'compose') <> 'edit_cells'
       and (
         (d.status in ('pending', 'running')
            and coalesce(d.started_at, d.created_at) < now() - public.keel_generation_stale_after())
         or (d.status = 'failed' and d.error_code = 'timed_out')
       )
     returning d.id, d.user_id, d.request_id, d.request_body
  )
  select * from claimed;
$$;

revoke all on function public.keel_claim_meal_drafts_for_relaunch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- LA RELANCE — réclame, puis re-poste la même demande.
-- ---------------------------------------------------------------------------
create or replace function public.keel_relaunch_meal_drafts()
returns table(claimed integer, posted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_anon text;
  v_secret text;
  r record;
  v_claimed integer := 0;
  v_posted integer := 0;
begin
  select coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '')
    into v_base_url;
  select coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '')
    into v_anon;
  select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '')
    into v_secret;

  -- ⛔ SANS DE QUOI POSTER, ON NE RÉCLAME RIEN : une ligne réclamée et jamais
  -- postée serait perdue (relanced_at posé). Elle reste réclamable pour quand
  -- la configuration sera là. Cicatrice `keel-crons-invoke-vs-internal-secret`.
  if v_base_url = '' or v_anon = '' or v_secret = '' then
    raise warning 'keel_relaunch_meal_drafts: app_config/vault incomplets (base_url=%, anon=%, secret=%) — aucune relance',
      v_base_url <> '', v_anon <> '', v_secret <> '';
    return query select 0, 0;
    return;
  end if;

  for r in select * from public.keel_claim_meal_drafts_for_relaunch() loop
    v_claimed := v_claimed + 1;
    perform net.http_post(
      url := rtrim(v_base_url, '/') || '/functions/v1/generate-household-meal-v1',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', v_anon,
        'authorization', 'Bearer ' || v_anon,
        'x-internal-secret', v_secret,
        'x-on-behalf-of', r.user_id::text,
        -- LE MÊME `request_id` : la relecture par demande retrouve la fille,
        -- et le compteur d'appels modele additionne les deux tentatives.
        'x-request-id', r.request_id,
        'x-relaunch-of', r.id::text
      ),
      body := r.request_body,
      -- Le 202 n'arrive qu'apres admission, bail et ouverture ; le defaut de
      -- pg_net (5 s) couperait avant.
      timeout_milliseconds := 60000
    );
    v_posted := v_posted + 1;
  end loop;
  return query select v_claimed, v_posted;
end;
$$;

revoke all on function public.keel_relaunch_meal_drafts() from public, anon, authenticated;

comment on function public.keel_relaunch_meal_drafts() is
  'Lot C (2026-09-15) : relance UNE fois une composition async morte (bail '
  'depasse ou timed_out), en re-postant la meme demande avec le secret interne. '
  'Ne reclame rien si app_config/vault sont incomplets.';

-- ---------------------------------------------------------------------------
-- LE CRON — une minute, SQL pur (même patron que keel-sweep-meal-drafts).
-- ---------------------------------------------------------------------------
do $$
declare job record;
begin
  for job in select jobid from cron.job where jobname = 'keel-relaunch-meal-drafts'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

do $$
begin
  perform cron.schedule(
    'keel-relaunch-meal-drafts',
    '* * * * *',
    $cmd$ select public.keel_relaunch_meal_drafts(); $cmd$
  );
end $$;

-- ---------------------------------------------------------------------------
-- LA PREUVE DE LA RÉCLAMATION, DANS LES DEUX SENS.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_alive uuid;
  v_dead uuid;
  v_edit uuid;
  v_second uuid;
  n integer;
begin
  select u.id into v_user
    from auth.users u
   where not exists (
     select 1 from public.student_meal_drafts d
      where d.user_id = u.id and d.status in ('pending', 'running'))
   order by u.created_at
   limit 1;
  if v_user is null then
    raise notice 'keel_claim_meal_drafts_for_relaunch: aucun utilisateur libre, preuve sautee';
    return;
  end if;

  -- (1) vivante (400 s) : PAS réclamée.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-vivante',
          'preuve-vivante', 'async', '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '400 seconds', now() - interval '400 seconds')
  returning id into v_alive;
  select count(*) into n from public.keel_claim_meal_drafts_for_relaunch();
  if n <> 0 then raise exception 'relance: une ligne de 400 s (sous le bail) a ete reclamee'; end if;
  delete from public.student_meal_drafts where id = v_alive;

  -- (2) morte (450 s) : réclamée, une fois, et marquée.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-morte',
          'preuve-morte', 'async', '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds')
  returning id into v_dead;
  select count(*) into n from public.keel_claim_meal_drafts_for_relaunch();
  if n <> 1 then raise exception 'relance: une ligne de 450 s (au-dela du bail) n''a pas ete reclamee (%)', n; end if;
  if (select status from public.student_meal_drafts where id = v_dead) <> 'failed'
     or (select error_code from public.student_meal_drafts where id = v_dead) <> 'timed_out'
     or (select relaunched_at from public.student_meal_drafts where id = v_dead) is null then
    raise exception 'relance: la ligne reclamee n''est pas failed/timed_out/relaunched_at';
  end if;
  -- (2b) un second tick ne la reprend pas.
  select count(*) into n from public.keel_claim_meal_drafts_for_relaunch();
  if n <> 0 then raise exception 'relance: la meme ligne a ete reclamee deux fois'; end if;
  delete from public.student_meal_drafts where id = v_dead;

  -- (3) une reprise locale morte : jamais relancée.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at)
  values (v_user, 'household', 'household_meal', 'failed', 'preuve-edit',
          'preuve-edit', 'async', '{"operation":"edit_cells"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds')
  returning id into v_edit;
  update public.student_meal_drafts set error_code = 'timed_out' where id = v_edit;
  select count(*) into n from public.keel_claim_meal_drafts_for_relaunch();
  if n <> 0 then raise exception 'relance: une reprise locale (edit_cells) a ete relancee'; end if;
  delete from public.student_meal_drafts where id = v_edit;

  -- (4) une fille (attempt 2) morte : jamais relancée — une relance, et une seule.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at, attempt)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-fille',
          'preuve-fille', 'async', '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds', 2)
  returning id into v_second;
  select count(*) into n from public.keel_claim_meal_drafts_for_relaunch();
  if n <> 0 then raise exception 'relance: une fille (attempt 2) a ete relancee'; end if;
  delete from public.student_meal_drafts where id = v_second;
end $$;
