-- BÊTA 2B — une lecture authentifiée de l'issue d'une demande. Le verrou
-- n'a aucune policy client; sans cette RPC, un Composer dont le transport
-- s'interrompt ne peut pas établir « encore en cours » et affiche une panne
-- pendant que le worker écrit.

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
    return jsonb_build_object('kind', 'in_flight', 'draft_id', null);
  end if;

  return jsonb_build_object('kind', 'unavailable');
end;
$function$;

revoke all on function public.keel_household_request_status(uuid)
  from public, anon;
grant execute on function public.keel_household_request_status(uuid)
  to authenticated, service_role;
