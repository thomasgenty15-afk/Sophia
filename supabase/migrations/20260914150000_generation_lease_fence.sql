-- BÊTA 2B — le request_id identifie le travail; le lease_token prouve que ce
-- worker détient ENCORE le droit de publier. Un exécuteur revenu après la
-- péremption ne peut ni écrire un plan, ni terminer un brouillon, ni libérer
-- le verrou de son remplaçant.

alter table public.household_generation_lock
  add column if not exists lease_token uuid;

update public.household_generation_lock
   set lease_token = gen_random_uuid()
 where lease_token is null;

alter table public.household_generation_lock
  alter column lease_token set default gen_random_uuid(),
  alter column lease_token set not null;

create unique index if not exists household_generation_lock_lease_token_uidx
  on public.household_generation_lock (lease_token);

create or replace function public.keel_household_claim_generation(
  p_household uuid,
  p_request uuid,
  p_intent text,
  p_actor uuid,
  p_stale_after interval
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing public.household_generation_lock%rowtype;
  v_lease uuid := gen_random_uuid();
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

  delete from public.household_generation_lock
   where household_id = p_household
     and started_at < now() - p_stale_after;

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
      'lease_token', v_lease
    );
  end if;

  select * into v_existing
    from public.household_generation_lock
   where household_id = p_household;

  -- Même request_id ou non: un worker vivant existe déjà. Le rejeu retrouve
  -- sa ligne persistée; il ne devient jamais un second exécuteur.
  return jsonb_build_object(
    'ok', false,
    'reason', 'in_flight',
    'request_id', v_existing.request_id,
    'intent', v_existing.intent,
    'started_at', v_existing.started_at
  );
end;
$function$;

create or replace function public.keel_household_release_generation(
  p_household uuid,
  p_request uuid,
  p_lease uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
begin
  if p_household is null or p_request is null or p_lease is null then
    return jsonb_build_object('ok', false, 'reason', 'arguments_required');
  end if;
  delete from public.household_generation_lock
   where household_id = p_household
     and request_id = p_request
     and lease_token = p_lease;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'released', v_rows);
end;
$function$;

create or replace function public.keel_household_publish_generation(
  p_household uuid,
  p_request uuid,
  p_lease uuid,
  p_user uuid,
  p_intent text,
  p_starts_on date,
  p_duration_days integer,
  p_replaces uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lock public.household_generation_lock%rowtype;
  v_written record;
begin
  select * into v_lock
    from public.household_generation_lock
   where household_id = p_household
   for update;
  if not found or v_lock.request_id <> p_request or v_lock.lease_token <> p_lease then
    return jsonb_build_object('ok', false, 'reason', 'generation_lease_lost');
  end if;

  begin
    select * into v_written
      from public.write_student_meal_plan(
        p_user_id => p_user,
        p_intent => p_intent,
        p_starts_on => p_starts_on,
        p_duration_days => p_duration_days,
        p_replaces => p_replaces,
        p_payload => p_payload
      );
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'plan_not_written', 'detail', sqlerrm);
  end;

  delete from public.household_generation_lock
   where household_id = p_household and lease_token = p_lease;
  return jsonb_build_object(
    'ok', true,
    'meal_id', v_written.meal_id,
    'retired_plan_id', v_written.retired_plan_id
  );
end;
$function$;

create or replace function public.keel_household_complete_draft_generation(
  p_household uuid,
  p_request uuid,
  p_lease uuid,
  p_draft uuid,
  p_response jsonb,
  p_write_payload jsonb,
  p_source_text text,
  p_source_meal jsonb,
  p_adoption_context jsonb,
  p_safety_fingerprint text,
  p_starts_on date,
  p_duration_days integer,
  p_lead_days integer,
  p_wall_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lock public.household_generation_lock%rowtype;
  v_rows integer;
begin
  select * into v_lock
    from public.household_generation_lock
   where household_id = p_household
   for update;
  if not found or v_lock.request_id <> p_request or v_lock.lease_token <> p_lease then
    return jsonb_build_object('ok', false, 'reason', 'generation_lease_lost');
  end if;

  update public.student_meal_drafts
     set status = 'done',
         response = p_response,
         write_payload = p_write_payload,
         source_text = p_source_text,
         source_meal = p_source_meal,
         adoption_context = p_adoption_context,
         safety_fingerprint = p_safety_fingerprint,
         starts_on = p_starts_on,
         duration_days = p_duration_days,
         lead_days = p_lead_days,
         wall_ms = p_wall_ms,
         finished_at = now()
   where id = p_draft
     and household_id = p_household
     and request_id = p_request::text
     and status = 'running';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('ok', false, 'reason', 'draft_not_running');
  end if;

  delete from public.household_generation_lock
   where household_id = p_household and lease_token = p_lease;
  return jsonb_build_object('ok', true, 'draft_id', p_draft);
end;
$function$;

revoke all on function public.keel_household_release_generation(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.keel_household_publish_generation(uuid, uuid, uuid, uuid, text, date, integer, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.keel_household_complete_draft_generation(uuid, uuid, uuid, uuid, jsonb, jsonb, text, jsonb, jsonb, text, date, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.keel_household_release_generation(uuid, uuid, uuid)
  to service_role;
grant execute on function public.keel_household_publish_generation(uuid, uuid, uuid, uuid, text, date, integer, uuid, jsonb)
  to service_role;
grant execute on function public.keel_household_complete_draft_generation(uuid, uuid, uuid, uuid, jsonb, jsonb, text, jsonb, jsonb, text, date, integer, integer, integer)
  to service_role;
