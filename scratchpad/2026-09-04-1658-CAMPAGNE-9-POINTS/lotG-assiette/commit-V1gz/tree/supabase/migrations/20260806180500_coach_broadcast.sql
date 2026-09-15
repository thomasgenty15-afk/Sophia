-- ============================================================================
-- LE MESSAGE DE COHORTE — le seul endroit où le coach parle, et il parle à tous
-- ============================================================================
-- Il n'existait AUCUN canal coach → élèves. L'élève paie pour la méthode de son
-- coach et ne voit jamais son coach: l'autorité qui a porté l'adoption ne se
-- renouvelle jamais. C'est le trou de rétention le moins cher à combler.
--
-- ── POURQUOI ÇA NE VIOLE PAS `docs/keel/MODEL.md` ────────────────────────
-- L'interdit du modèle est « aucun écran coach qui demande un GESTE PAR ÉLÈVE »,
-- parce qu'un coach à 200 élèves ne peut pas écrire 200 fois. Ici il écrit UNE
-- fois et N élèves reçoivent: le geste ne grandit pas avec la cohorte. C'est du
-- 1:N au sens strict, contrairement à `student_coach_notes` (20260805180000)
-- qui, elle, était un arbitrage assumé CONTRE le modèle.
--
-- ── LA CADENCE EST EN BASE, PAS DANS L'ÉCRAN ─────────────────────────────
-- Un par semaine et par coach. Une limite d'interface n'est pas une limite: un
-- appel direct à la RPC la contournerait, et c'est précisément le genre de
-- garde que ce dépôt a déjà vue désarmée. L'index unique partiel ci-dessous la
-- rend infranchissable.
--
-- Pourquoi une semaine: le message doit valoir la peine d'être ouvert. Un coach
-- qui écrit tous les jours brûle l'attention qu'on essaie de créer, et il
-- mangerait chaque jour un des DEUX créneaux non sollicités de l'élève
-- (`DAILY_UNSOLICITED_CAP`), au détriment de la relance du jour 9.
--
-- ── ÉCRIRE N'EST PAS DIFFUSER ────────────────────────────────────────────
-- La RPC pose la ligne et rend la main. La diffusion est faite par
-- `keel-coach-broadcast-v1`, au curseur: une diffusion synchrone à 500 élèves
-- ferait expirer la requête HTTP du coach, et un échec au 300ᵉ élève laisserait
-- une cohorte à moitié servie sans moyen de savoir où reprendre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La table
-- ---------------------------------------------------------------------------

create table if not exists public.coach_broadcasts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,

  body text not null,
  -- R2: la locale dans laquelle le coach a écrit. L'élève reçoit ses mots, on
  -- ne les traduit pas — c'est la même règle que `instead` dans la doctrine.
  content_locale text not null,

  created_at timestamptz not null default now(),

  -- ── L'ÉTAT DE DIFFUSION ────────────────────────────────────────────────
  -- `started_at` est posé au premier tick qui prend la ligne, `finished_at` au
  -- tick qui épuise la cohorte. Les deux sont NULL tant que rien n'a commencé.
  started_at timestamptz,
  finished_at timestamptz,
  -- Le curseur de reprise: le dernier `user_id` servi. NULL = on n'a pas
  -- commencé. Même mécanique que `after_user_id` dans `keel-daily-pulse-v1`.
  cursor_user_id uuid,
  -- Comptés, jamais estimés. `skipped` sépare le plafond du mute: un coach dont
  -- la moitié de la cohorte est plafonnée doit pouvoir le voir.
  delivered_count integer not null default 0,
  skipped_count integer not null default 0,

  constraint coach_broadcasts_body_length check (
    char_length(btrim(body)) between 1 and 1000
  ),
  -- Un `finished_at` sans `started_at` est un état qu'aucun chemin ne produit;
  -- l'autoriser rendrait toute lecture ultérieure ambiguë.
  constraint coach_broadcasts_finished_needs_start check (
    finished_at is null or started_at is not null
  )
);

comment on table public.coach_broadcasts is
  'Un message du coach à TOUTE sa cohorte. Écrit par keel_coach_send_broadcast, '
  'diffusé par keel-coach-broadcast-v1 au curseur. Cadence: 1 par semaine et par '
  'coach, tenue par coach_broadcasts_one_per_week_idx.';

-- LA CADENCE, EN BASE.
--
-- `date_trunc('week', ...)` est immuable sur un timestamptz seulement si le
-- fuseau est fixé; on indexe donc la semaine UTC. Un coach ne peut pas poster
-- deux fois dans la même semaine calendaire UTC, quel que soit le chemin
-- d'appel.
create unique index if not exists coach_broadcasts_one_per_week_idx
  on public.coach_broadcasts (
    coach_id,
    (date_trunc('week', (created_at at time zone 'utc')))
  );

create index if not exists coach_broadcasts_pending_idx
  on public.coach_broadcasts (created_at)
  where finished_at is null;

-- ---------------------------------------------------------------------------
-- 2. RLS — le coach lit les siens, personne d'autre ne les lit
-- ---------------------------------------------------------------------------
--
-- Aucune policy pour l'élève: il ne lit pas cette table, il reçoit le message
-- dans son fil. Lui ouvrir la table lui donnerait la liste des diffusions de
-- son coach, y compris celles qu'il n'a pas reçues (plafond, mute) — une
-- information sur les autres élèves.

alter table public.coach_broadcasts enable row level security;

drop policy if exists coach_broadcasts_coach_select on public.coach_broadcasts;
create policy coach_broadcasts_coach_select on public.coach_broadcasts
  for select to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c where c.user_id = (select auth.uid())
    )
  );

revoke all on public.coach_broadcasts from anon;
revoke insert, update, delete on public.coach_broadcasts from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Envoyer — la RPC du coach
-- ---------------------------------------------------------------------------
--
-- Pas de policy d'écriture, une RPC à porte étroite: le même arbitrage que
-- `keel_coach_schedule_client_end` (20260806160000). Ici la raison est la
-- cadence — une policy INSERT laisserait le client choisir `created_at`, donc
-- choisir sa semaine, donc contourner l'index.
--
-- ⚠️ `auth.uid()` est NULL sous service_role: cette RPC est faite pour le JWT du
-- coach depuis le navigateur, et refuse proprement sinon.
create or replace function public.keel_coach_send_broadcast(
  p_body text,
  p_content_locale text default 'en-US'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_coach_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_recipients integer;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  -- La longueur est vérifiée ICI **et** par la CHECK. Ici pour rendre un motif
  -- lisible, là-bas parce que c'est la seule qui tienne quel que soit l'appelant.
  if char_length(v_body) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_body');
  end if;
  if char_length(v_body) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'body_too_long');
  end if;

  -- RIEN À DIFFUSER N'EST PAS UNE DIFFUSION. Sans ce refus, un coach sans élève
  -- consommerait sa semaine sur un message que personne ne reçoit.
  select count(*) into v_recipients
  from public.coach_clients cc
  where cc.coach_id = v_coach_id
    and cc.status = 'active'
    and cc.student_user_id is not null;

  if v_recipients = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_recipients');
  end if;

  begin
    insert into public.coach_broadcasts (coach_id, body, content_locale)
    values (v_coach_id, v_body, coalesce(nullif(btrim(p_content_locale), ''), 'en-US'))
    returning id into v_id;
  exception when unique_violation then
    -- L'index de cadence. On rend un motif, pas une 500: le coach a le droit de
    -- savoir qu'il a déjà écrit cette semaine.
    return jsonb_build_object('ok', false, 'reason', 'already_sent_this_week');
  end;

  return jsonb_build_object(
    'ok', true, 'reason', 'queued',
    'broadcast_id', v_id, 'recipients', v_recipients
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Ce que l'écran du coach lit
-- ---------------------------------------------------------------------------
--
-- Une RPC plutôt qu'une vue: elle rend d'un coup le dernier envoi ET le nombre
-- de destinataires, c'est-à-dire les deux choses que l'écran doit afficher
-- avant que le coach n'écrive. Deux requêtes séparées auraient laissé l'écran
-- afficher un compte de destinataires d'une autre seconde que l'état de cadence.
create or replace function public.keel_coach_broadcast_state()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_coach_id uuid;
  v_last public.coach_broadcasts%rowtype;
  v_recipients integer;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  select count(*) into v_recipients
  from public.coach_clients cc
  where cc.coach_id = v_coach_id
    and cc.status = 'active'
    and cc.student_user_id is not null;

  select * into v_last
  from public.coach_broadcasts b
  where b.coach_id = v_coach_id
  order by b.created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'recipients', v_recipients,
    -- `can_send_now` est calculé ICI et pas dans l'écran: l'index de cadence
    -- est la vérité, et une seconde arithmétique de semaine côté client aurait
    -- divergé au premier changement de fuseau.
    'can_send_now', (
      v_last.id is null
      or date_trunc('week', (v_last.created_at at time zone 'utc'))
         < date_trunc('week', (now() at time zone 'utc'))
    ),
    'next_window_opens_at', (
      date_trunc('week', (now() at time zone 'utc')) + interval '1 week'
    ),
    'last', case when v_last.id is null then null else jsonb_build_object(
      'id', v_last.id,
      'body', v_last.body,
      'created_at', v_last.created_at,
      'finished_at', v_last.finished_at,
      'delivered_count', v_last.delivered_count,
      'skipped_count', v_last.skipped_count
    ) end
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Droits
-- ---------------------------------------------------------------------------

revoke all on function public.keel_coach_send_broadcast(text, text) from public;
revoke all on function public.keel_coach_send_broadcast(text, text) from anon;
revoke all on function public.keel_coach_broadcast_state() from public;
revoke all on function public.keel_coach_broadcast_state() from anon;

grant execute on function public.keel_coach_send_broadcast(text, text) to authenticated;
grant execute on function public.keel_coach_broadcast_state() to authenticated;
grant execute on function public.keel_coach_broadcast_state() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Le cron de diffusion
-- ---------------------------------------------------------------------------
--
-- TOUTES LES DIX MINUTES, et pas horaire. Un message de cohorte est écrit pour
-- maintenant — « cette semaine, on regarde les petits-déjeuners » livré cinquante
-- minutes plus tard est encore juste, livré le lendemain ne l'est plus. Dix
-- minutes est le compromis entre « le coach voit son message partir » et « on ne
-- réveille pas la base pour rien »: le job sort immédiatement quand aucune
-- diffusion n'est en attente (une seule lecture indexée).
--
-- À :05, :15, … pour ne pas tomber sur les minutes déjà chargées (:00 provision,
-- :10 pulse, :20 sièges, :25 relance, :45 évaluation, :55 balayage).
--
-- Le job appelle une fonction EDGE (il livre dans le fil, donc il a besoin du
-- runtime), donc le patron http_post avec résolution des secrets À L'EXÉCUTION —
-- interpoler un secret ici le graverait dans la définition du job.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

create or replace function pg_temp.keel_schedule_broadcast_job(
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

select pg_temp.keel_schedule_broadcast_job(
  'keel-coach-broadcast', '5,15,25,35,45,55 * * * *', 'keel-coach-broadcast-v1', '{}'::jsonb
);

-- Fail loud (R7): « le job existe » est la vérification qui a déjà laissé passer
-- un cron muet dans ce dépôt.
do $$
declare j record;
begin
  select schedule, active into j from cron.job where jobname = 'keel-coach-broadcast';
  if not found then
    raise exception 'cron keel-coach-broadcast absent apres schedule';
  end if;
  if not j.active then
    raise exception 'cron keel-coach-broadcast inactif';
  end if;
end;
$$;
