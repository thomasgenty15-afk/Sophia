-- `keel_household_publish_generation` prend `p_duration_days integer` (le JSON
-- du handler). `write_student_meal_plan` attend `smallint`. En notation nommée,
-- PostgreSQL ne résout pas integer → smallint : le tir réel du 2026-09-14
-- (campagne b10, tir 1) a reçu 409 `plan_not_written` avec
-- `function public.write_student_meal_plan(..., p_duration_days => integer, ...)
-- does not exist` après 128 s de modèle déjà payé.

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
        p_duration_days => p_duration_days::smallint,
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
