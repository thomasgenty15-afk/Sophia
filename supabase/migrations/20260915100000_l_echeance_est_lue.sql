-- BÊTA 2C — L'ÉCHÉANCE EST LUE, PAS SEULEMENT ÉCRITE.
--
-- `keel_household_claim_generation` balaie un bail plus vieux que
-- `p_stale_after` au moment d'une NOUVELLE prise. Mais la lecture de statut
-- (`keel_household_request_status`) rendait `in_flight` sur toute ligne de
-- verrou et sur tout brouillon pending/running, sans regarder leur âge.
--
-- Mesuré le 2026-09-15 sur la pile locale : les verrous du 546 (tir 8-s5,
-- 05:01:30) et du 502 (b10 tir 2, 16:16:13) étaient lus « en cours » à 17 h
-- et 6 h d'âge. Ni un 546 ni un 502 ne libèrent le verrou — le worker est
-- mort avant son `catch`. Seule l'horloge peut le dire : un worker edge vit
-- 400 s, et au-delà de l'échéance il n'y a plus personne pour écrire.
--
-- UNE SEULE CONSTANTE. 440 s = PLAN_REQUEST_BUDGET_MS (380 000) +
-- GENERATION_LOCK_MARGIN_MS (60 000), `generation_model.ts` — la valeur que
-- `index.ts` passe en `p_stale_after` à la prise. Un test Deno
-- (`generation_stale_after_pin_test.ts`) épingle les deux côtés sur ce fichier.
--
-- La LECTURE ne modifie rien : c'est la prochaine prise qui balaie le bail.
-- Le client, lui, traite `expired` comme terminal (« plan_expired »), et ne
-- dit plus « la composition continue » sur un worker mort.

create or replace function public.keel_generation_stale_after()
returns interval
language sql
immutable
set search_path to ''
as $$ select interval '440 seconds' $$;

comment on function public.keel_generation_stale_after() is
  'L''échéance d''une demande de composition : 440 s = PLAN_REQUEST_BUDGET_MS + '
  'GENERATION_LOCK_MARGIN_MS (generation_model.ts), la même valeur que index.ts '
  'passe en p_stale_after à keel_household_claim_generation. Au-delà, un verrou '
  'ou un brouillon pending/running est un worker mort : '
  'keel_household_request_status le lit `expired`.';

revoke all on function public.keel_generation_stale_after() from public, anon;
grant execute on function public.keel_generation_stale_after()
  to authenticated, service_role;

create or replace function public.keel_household_request_status(
  p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_draft public.student_meal_drafts%rowtype;
  v_lock public.household_generation_lock%rowtype;
  v_meal_id uuid;
  v_stale interval := public.keel_generation_stale_after();
begin
  if v_uid is null or p_request is null then
    return jsonb_build_object('kind', 'unavailable');
  end if;

  select id into v_meal_id
    from public.student_generated_meals
   where user_id = v_uid
     and generated_from ->> 'request_id' = p_request::text
   order by created_at desc
   limit 1;
  if v_meal_id is not null then
    return jsonb_build_object('kind', 'written', 'meal_id', v_meal_id);
  end if;

  select * into v_draft
    from public.student_meal_drafts
   where user_id = v_uid
     and request_id = p_request::text
   order by created_at desc
   limit 1;

  if found then
    if v_draft.status = 'adopted' and v_draft.adopted_meal_id is not null then
      return jsonb_build_object(
        'kind', 'written',
        'meal_id', v_draft.adopted_meal_id
      );
    end if;
    if v_draft.expires_at is not null and v_draft.expires_at <= now() then
      return jsonb_build_object('kind', 'unavailable');
    end if;
    if v_draft.status in ('done') and v_draft.response is not null then
      return jsonb_build_object('kind', 'done', 'draft_id', v_draft.id);
    end if;
    if v_draft.status in ('pending', 'running') then
      -- Un brouillon en vol plus vieux que l'échéance n'a plus d'écrivain.
      if v_draft.created_at < now() - v_stale then
        return jsonb_build_object(
          'kind', 'expired',
          'draft_id', v_draft.id,
          'started_at', v_draft.created_at,
          'age_seconds', floor(extract(epoch from (now() - v_draft.created_at)))
        );
      end if;
      return jsonb_build_object('kind', 'in_flight', 'draft_id', v_draft.id);
    end if;
    if v_draft.status = 'failed' then
      return jsonb_build_object(
        'kind', 'failed',
        'error_code', coalesce(nullif(v_draft.error_code, ''), 'composition_unavailable')
      );
    end if;
  end if;

  select * into v_lock
    from public.household_generation_lock
   where request_id = p_request
     and actor_user_id = v_uid;
  if found then
    -- Un bail plus vieux que l'échéance est un worker mort (546, 502, coupure).
    if v_lock.started_at < now() - v_stale then
      return jsonb_build_object(
        'kind', 'expired',
        'draft_id', null,
        'started_at', v_lock.started_at,
        'age_seconds', floor(extract(epoch from (now() - v_lock.started_at)))
      );
    end if;
    return jsonb_build_object('kind', 'in_flight', 'draft_id', null);
  end if;

  return jsonb_build_object('kind', 'unavailable');
end;
$function$;

revoke all on function public.keel_household_request_status(uuid)
  from public, anon;
grant execute on function public.keel_household_request_status(uuid)
  to authenticated, service_role;
