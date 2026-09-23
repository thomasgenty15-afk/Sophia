-- LE BOUTON REPREND LA MAIN (2026-09-20).
--
-- Mesuré en local le 2026-09-20 sur un compte neuf : trois compositions de
-- suite (une morte au bail, deux abouties), puis un clic sur « Construire mon
-- plan » PENDANT la troisième → 409 `generation_in_flight`, et l'écran dit
-- « attends ». Tant que le verrou tient, le bouton ne répond plus ; et si quoi
-- que ce soit s'est mal passé entre-temps (onglet fermé, note qui a relancé
-- sans le dire, worker mort avant son `catch`), la personne n'a AUCUN geste
-- pour reprendre avant la péremption (440 s).
--
-- DÉCISION : le geste explicite du bouton PREND LA MAIN. `p_takeover = true`
--   · ferme la composition en vol du foyer — brouillon `failed`, jeton
--     `generation_lease_lost` (la phrase existe déjà et dit exactement ça :
--     « reprise par une autre demande, arrêtée sans rien écrire ») ;
--   · lève le verrou du foyer quel que soit son âge ;
--   · pose le sien, et rend `superseded_request_id` pour le journal.
-- Le worker de l'ancienne demande finit de son côté : la barrière du bail
-- (`keel_household_complete_draft_generation`, `keel_household_publish_generation`)
-- refuse son écriture. Il ne peut ni écrire un plan, ni rouvrir la ligne
-- (`markStage` et la RPC de fin exigent `status = 'running'`).
--
-- CE QUI NE CHANGE PAS :
--   · sans `p_takeover`, la prise refuse comme avant (`in_flight`) ;
--   · la relance interne (`x-relaunch-of`) ne prend jamais la main — le
--     handler ne passe `true` que sur un appel JWT ;
--   · la relance automatique ne réclame que `timed_out`
--     (`keel_claim_meal_drafts_for_relaunch`) : une ligne fermée ici n'est
--     jamais relancée.
--
-- L'ANCIENNE SIGNATURE EST SUPPRIMÉE, PAS DOUBLÉE. Deux surcharges dont l'une
-- a un défaut rendent l'appel PostgREST ambigu (« could not choose the best
-- candidate function »). Le handler passe toujours les six arguments.

drop function if exists public.keel_household_claim_generation(uuid, uuid, text, uuid, interval);

create or replace function public.keel_household_claim_generation(
  p_household uuid,
  p_request uuid,
  p_intent text,
  p_actor uuid,
  p_stale_after interval,
  p_takeover boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing public.household_generation_lock%rowtype;
  v_lease uuid := gen_random_uuid();
  v_superseded uuid := null;
  v_closed integer := 0;
begin
  if p_household is null then
    return jsonb_build_object('ok', false, 'reason', 'household_required');
  end if;
  if p_request is null then
    return jsonb_build_object('ok', false, 'reason', 'request_required');
  end if;
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if p_stale_after is null then
    return jsonb_build_object('ok', false, 'reason', 'stale_after_required');
  end if;

  -- Le balayage ordinaire : un bail plus vieux que l'échéance est un worker mort.
  delete from public.household_generation_lock
   where household_id = p_household
     and started_at < now() - p_stale_after;

  if coalesce(p_takeover, false) then
    -- Le geste explicite ferme ce qui est en vol, quel que soit son âge.
    -- Le brouillon d'abord : c'est lui qui occupe
    -- `student_meal_drafts_one_inflight_per_user` et refuserait la ligne suivante.
    -- Par foyer ET par acteur : l'index est par personne, le verrou par foyer.
    update public.student_meal_drafts
       set status = 'failed',
           error_code = 'generation_lease_lost',
           error = 'reprise: un nouveau plan a ete demande pendant la composition',
           finished_at = coalesce(finished_at, now())
     where status in ('pending', 'running')
       and (household_id = p_household or user_id = p_actor);
    get diagnostics v_closed = row_count;

    delete from public.household_generation_lock
     where household_id = p_household
       and request_id <> p_request
    returning request_id into v_superseded;
  end if;

  insert into public.household_generation_lock
    (household_id, request_id, intent, actor_user_id, lease_token)
  values (
    p_household,
    p_request,
    coalesce(nullif(trim(p_intent), ''), 'unknown'),
    p_actor,
    v_lease
  )
  on conflict (household_id) do nothing;
  if found then
    return jsonb_build_object(
      'ok', true,
      'request_id', p_request,
      'lease_token', v_lease,
      'superseded_request_id', v_superseded,
      'drafts_closed', v_closed
    );
  end if;
  select * into v_existing
    from public.household_generation_lock
   where household_id = p_household;
  return jsonb_build_object(
    'ok', false,
    'reason', 'in_flight',
    'request_id', v_existing.request_id,
    'intent', v_existing.intent,
    'started_at', v_existing.started_at
  );
end;
$function$;

comment on function public.keel_household_claim_generation(uuid, uuid, text, uuid, interval, boolean) is
  'BÊTA lot 2B — prend le verrou de composition d''un foyer. L''INSERT est la '
  'garde (clé primaire), jamais une lecture suivie d''une écriture. Rend '
  '{ok:false, reason:"in_flight", request_id} quand une autre demande tourne, '
  'pour que le client RETROUVE l''issue au lieu de relancer. '
  '2026-09-20 : p_takeover = true (le bouton « Construire mon plan », appel JWT '
  'seulement) ferme le brouillon en vol (failed, generation_lease_lost), lève le '
  'verrou quel que soit son âge et pose le sien ; rend superseded_request_id. '
  'L''ancien worker est arrêté par la barrière du bail, jamais par ce geste.';

revoke all on function public.keel_household_claim_generation(uuid, uuid, text, uuid, interval, boolean)
  from public, anon, authenticated;
grant execute on function public.keel_household_claim_generation(uuid, uuid, text, uuid, interval, boolean)
  to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PREUVE — sur un foyer libre de la base courante ; sautée s'il n'y en a pas.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user uuid;
  v_household uuid;
  v_req_a uuid := gen_random_uuid();
  v_req_b uuid := gen_random_uuid();
  v_draft_a uuid;
  v_claim jsonb;
  v_status text;
  v_code text;
  v_lock_req uuid;
begin
  select hm.user_id, hm.household_id into v_user, v_household
    from public.household_members hm
   where hm.role = 'owner'
     and hm.user_id is not null
     and not exists (
       select 1 from public.household_generation_lock l
        where l.household_id = hm.household_id)
     and not exists (
       select 1 from public.student_meal_drafts d
        where d.user_id = hm.user_id and d.status in ('pending', 'running'))
   order by hm.joined_at
   limit 1;
  if v_user is null then
    raise notice 'keel_household_claim_generation(p_takeover): aucun foyer libre, preuve sautee';
    return;
  end if;

  -- Une composition A en vol : verrou frais + brouillon `running`.
  insert into public.household_generation_lock
    (household_id, request_id, intent, actor_user_id)
  values (v_household, v_req_a, 'draft', v_user);
  insert into public.student_meal_drafts
    (user_id, household_id, plan_kind, lane, status, request_id, idempotency_key,
     mode, request_body, source_version, created_at, started_at)
  values (v_user, v_household, 'household', 'household_meal', 'running',
          v_req_a::text, 'preuve-reprise-' || v_req_a::text, 'async',
          '{"operation":"compose"}'::jsonb, 'preuve|draft_store.v1', now(), now())
  returning id into v_draft_a;

  -- Sans reprise : refus, comme avant.
  v_claim := public.keel_household_claim_generation(
    v_household, v_req_b, 'draft', v_user, interval '440 seconds', false);
  if coalesce((v_claim ->> 'ok')::boolean, true) then
    raise exception 'reprise: sans p_takeover, la prise devrait etre refusee (%)', v_claim;
  end if;
  if v_claim ->> 'reason' <> 'in_flight' then
    raise exception 'reprise: motif attendu in_flight, recu %', v_claim ->> 'reason';
  end if;

  -- Avec reprise : B prend la main, A est fermee.
  v_claim := public.keel_household_claim_generation(
    v_household, v_req_b, 'draft', v_user, interval '440 seconds', true);
  if not coalesce((v_claim ->> 'ok')::boolean, false) then
    raise exception 'reprise: avec p_takeover, la prise devrait passer (%)', v_claim;
  end if;
  if (v_claim ->> 'superseded_request_id')::uuid is distinct from v_req_a then
    raise exception 'reprise: superseded_request_id attendu %, recu %', v_req_a, v_claim ->> 'superseded_request_id';
  end if;
  if (v_claim ->> 'drafts_closed')::integer <> 1 then
    raise exception 'reprise: un brouillon devait etre ferme, % l''ont ete', v_claim ->> 'drafts_closed';
  end if;
  select status, error_code into v_status, v_code
    from public.student_meal_drafts where id = v_draft_a;
  if v_status <> 'failed' or v_code <> 'generation_lease_lost' then
    raise exception 'reprise: le brouillon A devait etre failed/generation_lease_lost, il est %/%', v_status, v_code;
  end if;
  select request_id into v_lock_req
    from public.household_generation_lock where household_id = v_household;
  if v_lock_req is distinct from v_req_b then
    raise exception 'reprise: le verrou devait porter B, il porte %', v_lock_req;
  end if;

  -- La ligne fermee n'est pas relancable : la relance ne reclame que timed_out.
  if exists (
    select 1 from public.student_meal_drafts d
     where d.id = v_draft_a and d.error_code = 'timed_out') then
    raise exception 'reprise: le brouillon ferme ne doit pas ressembler a un timed_out';
  end if;

  -- Nettoyage.
  delete from public.household_generation_lock where household_id = v_household;
  delete from public.student_meal_drafts where id = v_draft_a;
  raise notice 'keel_household_claim_generation(p_takeover): preuve passee sur le foyer %', v_household;
end $$;
