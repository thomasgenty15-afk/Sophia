-- LES BALAYEUSES SUIVENT LE BAIL — plus « 7 minutes », mais l'échéance elle-même.
--
-- `keel_sweep_meal_drafts()` (20260906230000 §6) marquait `failed/timed_out`
-- toute ligne `pending|running` sans fin après 7 minutes. Depuis le bail
-- (20260914150000), l'échéance d'une composition est UNE constante :
-- `keel_generation_stale_after()` = 440 s = PLAN_REQUEST_BUDGET_MS (380 s) +
-- GENERATION_LOCK_MARGIN_MS (60 s). Or 7 min = 420 s < 440 s : la balayeuse
-- pouvait couper une composition VIVANTE dans ses vingt dernières secondes de
-- budget — exactement celles où elle écrit. Deux copies d'un même délai
-- divergent, et c'est celle qu'on relit le moins qui décide.
--
-- Même geste côté worker : `DRAFT_STUCK_AFTER_MS` (`draft_store.ts`) dérive
-- désormais des deux mêmes constantes. Le nombre ne vit plus qu'à un endroit
-- par côté, et un test épingle qu'ils sont égaux.
--
-- (b) et (c) ne changent pas.

create or replace function public.keel_sweep_meal_drafts()
returns table(timed_out integer, expired_purged integer, adopted_purged integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timed_out integer := 0;
  v_expired integer := 0;
  v_adopted integer := 0;
  v_stale interval := public.keel_generation_stale_after();
begin
  -- (a) LES COMPOSITIONS QUI N'ONT JAMAIS FINI — au-delà du bail, plus personne
  --     n'écrit (un worker edge vit 400 s au plus).
  update public.student_meal_drafts
     set status = 'failed',
         error_code = 'timed_out',
         error = coalesce(error, 'balayeuse: aucune fin avant l''echeance du bail'),
         finished_at = coalesce(finished_at, now())
   where status in ('pending', 'running')
     and coalesce(started_at, created_at) < now() - v_stale;
  get diagnostics v_timed_out = row_count;

  -- (b) LES APERÇUS PÉRIMÉS.
  delete from public.student_meal_drafts
   where status in ('done', 'failed')
     and expires_at < now();
  get diagnostics v_expired = row_count;

  -- (c) LES ADOPTÉS DE PLUS DE TRENTE JOURS.
  delete from public.student_meal_drafts
   where status = 'adopted'
     and coalesce(adopted_at, created_at) < now() - interval '30 days';
  get diagnostics v_adopted = row_count;

  return query select v_timed_out, v_expired, v_adopted;
end;
$$;

comment on function public.keel_sweep_meal_drafts() is
  'Balayeuse horaire des brouillons de composition: sans fin au-dela de '
  'keel_generation_stale_after() (440 s, le bail) => failed (timed_out), et c''est '
  'ce qui LIBERE l''index unique; purge des apercus perimes et des adoptes de plus '
  'de 30 jours.';

-- LA PREUVE, DANS LES DEUX SENS : une ligne à 430 s est VIVANTE (pas balayée),
-- une ligne à 450 s est MORTE (balayée). Sans le second cas, une garde cassée
-- qui ne balaie plus rien ressemblerait à une garde qui marche.
do $$
declare
  v_user uuid;
  v_alive uuid;
  v_dead uuid;
  swept record;
begin
  -- Un utilisateur SANS ligne en vol : l'index partiel n'en admet qu'une par
  -- personne, et une base de travail peut en porter une.
  select u.id into v_user
    from auth.users u
   where not exists (
     select 1 from public.student_meal_drafts d
      where d.user_id = u.id and d.status in ('pending', 'running'))
   order by u.created_at
   limit 1;
  if v_user is null then
    raise notice 'keel_sweep_meal_drafts: aucun utilisateur libre, preuve sautee';
    return;
  end if;
  -- Deux lignes en vol pour le même utilisateur violeraient l'index partiel :
  -- on les insère et on les balaie l'une après l'autre.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-vivante',
          'preuve-vivante', 'sync', '{}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '430 seconds', now() - interval '430 seconds')
  returning id into v_alive;
  select * into swept from public.keel_sweep_meal_drafts();
  if (select status from public.student_meal_drafts where id = v_alive) <> 'running' then
    raise exception 'keel_sweep_meal_drafts: une ligne de 430 s (sous le bail) a ete balayee';
  end if;
  delete from public.student_meal_drafts where id = v_alive;

  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at)
  values (v_user, 'household', 'household_meal', 'running', 'preuve-morte',
          'preuve-morte', 'sync', '{}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds')
  returning id into v_dead;
  select * into swept from public.keel_sweep_meal_drafts();
  if (select status from public.student_meal_drafts where id = v_dead) <> 'failed'
     or (select error_code from public.student_meal_drafts where id = v_dead) <> 'timed_out' then
    raise exception 'keel_sweep_meal_drafts: une ligne de 450 s (au-dela du bail) n''a pas ete balayee';
  end if;
  delete from public.student_meal_drafts where id = v_dead;
end $$;
