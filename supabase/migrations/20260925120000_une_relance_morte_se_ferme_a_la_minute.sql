-- ═══════════════════════════════════════════════════════════════════════════
-- ⟳ 2026-09-25 — UNE RELANCE MORTE SE FERME À LA MINUTE, PAS À L'HEURE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── LE DÉFAUT, MESURÉ ─────────────────────────────────────────────────────
-- Banc des trois foyers, plan C : la mère (attempt 1) est tuée par la limite
-- CPU du runtime, réclamée au bout du bail et relancée ; la fille (attempt 2)
-- est tuée à son tour. `keel_claim_meal_drafts_for_relaunch` ne regarde que
-- `attempt = 1` (une relance, et une seule : preuve (4) de
-- `20260915183000_une_relance_et_une_seule.sql`), et seul le balayage HORAIRE
-- (`keel_sweep_meal_drafts`, minute 11) fermait la fille : la ligne est restée
-- `running` plus de vingt minutes.
--
-- ── CE QUE FAIT CETTE MIGRATION ──────────────────────────────────────────
-- `keel_close_dead_relaunches()` ferme, chaque minute, les filles en vol
-- au-delà du bail (`keel_generation_stale_after()`) : `failed / timed_out`,
-- `relaunched_at` INTOUCHÉ (une fille n'est jamais relancée). La fonction du
-- cron l'appelle EN PREMIER, avant son retour anticipé de configuration : la
-- fermeture ne dépend pas de ce qu'il faut pour POSTER une relance.
--
-- ⚠️ C'EST UN FILET, PAS LE CORRECTIF DE L'ATTENTE. L'écran attend selon son
-- propre bail (`planDraft.ts`) ; ce qui raccourcit l'attente est l'écouteur
-- `beforeunload` du générateur, qui marque le brouillon au moment de la
-- coupure. Cette fonction rattrape les coupures qu'il n'a pas pu écrire.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.keel_close_dead_relaunches()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_closed integer := 0;
begin
  update public.student_meal_drafts d
     set status = 'failed',
         error_code = 'timed_out',
         error = coalesce(d.error, 'relanceur: la relance est morte avant l''echeance du bail'),
         finished_at = coalesce(d.finished_at, now())
   where d.attempt = 2
     and d.status in ('pending', 'running')
     and coalesce(d.started_at, d.created_at) < now() - public.keel_generation_stale_after();
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$function$;

revoke all on function public.keel_close_dead_relaunches() from public, anon, authenticated;

create or replace function public.keel_relaunch_meal_drafts()
 returns table(claimed integer, posted integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_base_url text;
  v_anon text;
  v_secret text;
  r record;
  v_claimed integer := 0;
  v_posted integer := 0;
begin
  -- ⟳ 2026-09-25 — EN PREMIER, et même sans configuration : une fille morte
  -- se ferme (`keel_close_dead_relaunches`).
  perform public.keel_close_dead_relaunches();

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
$function$;

-- ---------------------------------------------------------------------------
-- LA PREUVE, DANS LES DEUX SENS — sur `keel_close_dead_relaunches` seule, qui
-- ne poste rien (la fonction du cron, elle, relancerait pour de vrai).
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_alive uuid;
  v_dead uuid;
  v_mother uuid;
  v_done uuid;
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
    raise notice 'keel_close_dead_relaunches: aucun utilisateur libre, preuve sautee';
    return;
  end if;

  -- (1) une fille vivante (430 s, sous le bail) : PAS fermée.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at, attempt)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-fille-vivante',
          'preuve-fille-vivante', 'async', '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '430 seconds', now() - interval '430 seconds', 2)
  returning id into v_alive;
  n := public.keel_close_dead_relaunches();
  if n <> 0 or (select status from public.student_meal_drafts where id = v_alive) <> 'running' then
    raise exception 'fermeture: une fille de 430 s (sous le bail) a ete fermee';
  end if;
  delete from public.student_meal_drafts where id = v_alive;

  -- (2) une fille morte (450 s) : fermée, failed/timed_out, jamais relancée.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at, attempt)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-fille-morte',
          'preuve-fille-morte', 'async', '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds', 2)
  returning id into v_dead;
  n := public.keel_close_dead_relaunches();
  if n <> 1 then raise exception 'fermeture: une fille de 450 s n''a pas ete fermee (%)', n; end if;
  if (select status from public.student_meal_drafts where id = v_dead) <> 'failed'
     or (select error_code from public.student_meal_drafts where id = v_dead) <> 'timed_out'
     or (select relaunched_at from public.student_meal_drafts where id = v_dead) is not null then
    raise exception 'fermeture: la fille fermee n''est pas failed/timed_out sans relaunched_at';
  end if;
  -- (2b) ⚠️ ON N'APPELLE PAS la réclamation ici : elle marquerait « relancée »
  -- toute mère morte RÉELLE présente en base au moment de la migration, sans la
  -- relancer. Qu'elle ignore une fille est tenu par sa clause `attempt = 1`,
  -- preuve (4) de `20260915183000_une_relance_et_une_seule.sql`.
  delete from public.student_meal_drafts where id = v_dead;

  -- (3) une mère morte (attempt 1) : pas touchée ici — c'est la réclamation qui la prend.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-mere-morte',
          'preuve-mere-morte', 'async', '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds')
  returning id into v_mother;
  n := public.keel_close_dead_relaunches();
  if n <> 0 or (select status from public.student_meal_drafts where id = v_mother) <> 'running' then
    raise exception 'fermeture: une mere (attempt 1) a ete fermee par la fermeture des filles';
  end if;
  delete from public.student_meal_drafts where id = v_mother;

  -- (4) une fille déjà écrite : jamais défaite.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at, attempt,
     write_payload, response)
  values (v_user, 'household', 'household_meal', 'done', 'preuve-fille-ecrite',
          'preuve-fille-ecrite', 'async', '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds', 2,
          '{}'::jsonb, '{}'::jsonb)
  returning id into v_done;
  n := public.keel_close_dead_relaunches();
  if n <> 0 or (select status from public.student_meal_drafts where id = v_done) <> 'done' then
    raise exception 'fermeture: une fille ecrite a ete defaite';
  end if;
  delete from public.student_meal_drafts where id = v_done;
end $$;
