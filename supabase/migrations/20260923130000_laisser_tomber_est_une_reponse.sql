-- « LAISSER TOMBER » EST UNE RÉPONSE, ET LA BASE LA GARDE.
--
-- Signalé le 2026-09-23 : « quand je change de l'onglet "Mon plan" à un autre,
-- ça me redemande de valider un plan, alors que je viens de cliquer sur
-- Laisser tomber ». Un brouillon n'a que deux fins : « Valider » (`adopted`)
-- ou « Laisser tomber ». La seconde ne vivait que dans l'écran
-- (`setDraft(null)`) : la ligne restait `done` pendant 24 h, et
-- `recoverLatestDraft()` la rouvrait à chaque retour sur la page.
--
-- Deux gestes, un seul statut, `discarded` :
--
--   (1) « Laisser tomber » appelle `keel_discard_meal_draft(p_draft)`. La
--       personne ne peut toujours rien écrire dans la table (SELECT seul) ;
--       la fonction ne fait qu'une chose : passer SON brouillon `done` à
--       `discarded`.
--
--   (2) UN NOUVEAU BROUILLON PRÊT REFUSE CEUX QUI N'ONT PAS EU DE RÉPONSE.
--       Dès qu'une ligne passe à `done`, les lignes `done` plus anciennes de
--       la même personne passent à `discarded`, comme si elle avait cliqué
--       « Laisser tomber ». Sans ça, trois brouillons d'avant revenaient l'un
--       après l'autre alors que le dernier plan avait été validé.
--       ⚠️ À `done`, pas à la création : une recomposition qui échoue laisse
--       l'aperçu d'avant à l'écran, et il doit rester adoptable.
--       Un déclencheur, parce que deux écrivains posent `done` :
--       `completeDraft` (`draft_store.ts`) et
--       `keel_household_complete_draft_generation` (20260914150000).
--
-- L'adoption refuse déjà tout ce qui n'est pas `done` (`draft_not_ready`,
-- 20260914143000) : un brouillon écarté ne peut plus être validé.

-- ---------------------------------------------------------------------------
-- 1. LE STATUT
-- ---------------------------------------------------------------------------
alter table public.student_meal_drafts
  drop constraint if exists student_meal_drafts_status_check;
alter table public.student_meal_drafts
  add constraint student_meal_drafts_status_check
  check (status in ('pending', 'running', 'done', 'failed', 'adopted', 'discarded'));

comment on column public.student_meal_drafts.status is
  'pending/running = en composition ; done = prêt, en attente de réponse ; '
  'adopted = validé ; discarded = laissé tombé, ou remplacé par un brouillon '
  'plus récent avant toute réponse ; failed = pas de brouillon.';

-- ---------------------------------------------------------------------------
-- 2. LES RELIQUES DÉJÀ EN BASE
--
-- Tout `done` qui a derrière lui un `done` ou un `adopted` plus récent de la
-- même personne n'attend plus de réponse. Mesuré en local avant ce lot : un
-- compte portait trois `done` postérieurs à son adoption de 00:30, et sept
-- antérieurs.
-- ---------------------------------------------------------------------------
update public.student_meal_drafts d
   set status = 'discarded'
 where d.status = 'done'
   and exists (
     select 1 from public.student_meal_drafts n
      where n.user_id = d.user_id
        and n.status in ('done', 'adopted')
        and n.created_at > d.created_at);

-- ---------------------------------------------------------------------------
-- 3. UN BROUILLON PRÊT REFUSE LES PRÉCÉDENTS
-- ---------------------------------------------------------------------------
create or replace function public.keel_meal_draft_discards_older()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Seulement au passage à `done` : une mise à jour d'une ligne déjà prête
  -- ne rejoue pas le refus.
  if tg_op = 'UPDATE' and old.status = 'done' then
    return null;
  end if;
  update public.student_meal_drafts
     set status = 'discarded'
   where user_id = new.user_id
     and status = 'done'
     and id <> new.id
     and created_at < new.created_at;
  return null;
end;
$function$;

revoke all on function public.keel_meal_draft_discards_older()
  from public, anon, authenticated;

drop trigger if exists student_meal_drafts_newer_discards_older
  on public.student_meal_drafts;
create trigger student_meal_drafts_newer_discards_older
  after insert or update of status on public.student_meal_drafts
  for each row
  when (new.status = 'done')
  execute function public.keel_meal_draft_discards_older();

-- ---------------------------------------------------------------------------
-- 4. « LAISSER TOMBER »
--
-- Le propriétaire vient du jeton, jamais du client. Rien d'autre que `done`
-- ne bouge : un brouillon déjà validé ou déjà écarté rend `discarded: false`,
-- et un second clic ne change rien.
-- ---------------------------------------------------------------------------
create or replace function public.keel_discard_meal_draft(p_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null or p_draft is null then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;
  update public.student_meal_drafts
     set status = 'discarded'
   where id = p_draft
     and user_id = v_uid
     and status = 'done';
  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'discarded', v_rows = 1);
end;
$function$;

-- « revoke from public » ne retire pas `anon` : on le nomme.
revoke all on function public.keel_discard_meal_draft(uuid) from public, anon;
grant execute on function public.keel_discard_meal_draft(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. LA BALAYEUSE EFFACE AUSSI LES ÉCARTÉS
--
-- Même corps que 20260915181000, avec `discarded` dans (b) : un brouillon
-- écarté disparaît à son échéance, comme un `done` resté sans réponse.
-- ---------------------------------------------------------------------------
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

  -- (b) LES APERÇUS PÉRIMÉS — sans réponse, écartés ou ratés.
  delete from public.student_meal_drafts
   where status in ('done', 'failed', 'discarded')
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

drop index if exists public.student_meal_drafts_expiry_idx;
create index student_meal_drafts_expiry_idx
  on public.student_meal_drafts (expires_at)
  where status in ('done', 'failed', 'discarded');

-- ---------------------------------------------------------------------------
-- 6. LA PREUVE — dans une sous-transaction annulée à la fin : aucune ligne
-- réelle n'est touchée, quel que soit le compte choisi.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_older uuid;
  v_newer uuid;
  v_result jsonb;
  swept record;
begin
  select u.id into v_user
    from auth.users u
   where not exists (
     select 1 from public.student_meal_drafts d
      where d.user_id = u.id and d.status in ('pending', 'running'))
   order by u.created_at
   limit 1;
  if v_user is null then
    raise notice 'laisser_tomber: aucun utilisateur libre, preuve sautee';
    return;
  end if;

  begin
    insert into public.student_meal_drafts
      (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
       request_body, source_version, write_payload, response, created_at)
    values (v_user, 'household', 'household_meal', 'done', 'preuve-ancien',
            'preuve-ancien', 'async', '{}'::jsonb, 'preuve|draft_store.v1',
            '{}'::jsonb, '{}'::jsonb, now() - interval '2 minutes')
    returning id into v_older;

    -- Le chemin réel : une composition en vol qui finit.
    insert into public.student_meal_drafts
      (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
       request_body, source_version, created_at)
    values (v_user, 'household', 'household_meal', 'running', 'preuve-recent',
            'preuve-recent', 'async', '{}'::jsonb, 'preuve|draft_store.v1',
            now() - interval '1 minute')
    returning id into v_newer;

    -- Tant que le récent n'est pas prêt, l'ancien attend toujours sa réponse.
    if (select status from public.student_meal_drafts where id = v_older) <> 'done' then
      raise exception 'laisser_tomber: un brouillon en vol a refuse l''ancien avant d''etre pret';
    end if;

    update public.student_meal_drafts
       set status = 'done', write_payload = '{}'::jsonb, response = '{}'::jsonb
     where id = v_newer;

    if (select status from public.student_meal_drafts where id = v_older) <> 'discarded' then
      raise exception 'laisser_tomber: le brouillon plus ancien n''a pas ete refuse';
    end if;
    if (select status from public.student_meal_drafts where id = v_newer) <> 'done' then
      raise exception 'laisser_tomber: le brouillon qui vient d''etre pret a ete refuse';
    end if;

    -- Un autre compte ne peut pas écarter ce brouillon.
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    v_result := public.keel_discard_meal_draft(v_newer);
    if (v_result ->> 'discarded')::boolean
       or (select status from public.student_meal_drafts where id = v_newer) <> 'done' then
      raise exception 'laisser_tomber: un autre compte a ecarte le brouillon';
    end if;

    -- Le propriétaire, lui, le peut.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_result := public.keel_discard_meal_draft(v_newer);
    if not coalesce((v_result ->> 'discarded')::boolean, false)
       or (select status from public.student_meal_drafts where id = v_newer) <> 'discarded' then
      raise exception 'laisser_tomber: le proprietaire n''a pas pu ecarter son brouillon';
    end if;

    -- Échu, un brouillon écarté est effacé par la balayeuse.
    update public.student_meal_drafts
       set expires_at = now() - interval '1 second'
     where id = v_newer;
    select * into swept from public.keel_sweep_meal_drafts();
    if exists (select 1 from public.student_meal_drafts where id = v_newer) then
      raise exception 'laisser_tomber: la balayeuse a laisse un brouillon ecarte echu';
    end if;

    raise exception using errcode = 'P0913', message = 'laisser_tomber: preuve passee';
  exception when sqlstate 'P0913' then
    null;
  end;
end $$;
