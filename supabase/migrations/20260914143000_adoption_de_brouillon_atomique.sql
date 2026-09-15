-- Adopter un aperçu est une seule transaction: verrouiller le brouillon,
-- écrire exactement son write_payload, puis le marquer adopté. Un double tap
-- rend le même meal_id; il ne publie jamais une seconde ligne.

create or replace function public.keel_adopt_meal_draft(
  p_draft uuid,
  p_user uuid,
  p_intent text,
  p_replaces uuid,
  p_live_fingerprint text,
  p_contract_version text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_draft public.student_meal_drafts%rowtype;
  v_written record;
  v_contract text;
begin
  if p_draft is null or p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'draft_not_found');
  end if;

  -- Même arbitre que write_student_meal_plan, pris avant la ligne du
  -- brouillon: deux adoptions du même compte suivent le même ordre de verrous.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select * into v_draft
    from public.student_meal_drafts
   where id = p_draft and user_id = p_user
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'draft_not_found');
  end if;

  -- Rejeu idempotent: la première transaction a déjà publié. Le second tap
  -- reçoit le même accusé, sans rappeler l'écrivain.
  if v_draft.status = 'adopted' then
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'meal_id', v_draft.adopted_meal_id,
      'starts_on', v_draft.starts_on,
      'duration_days', v_draft.duration_days
    );
  end if;

  if v_draft.status = 'failed' then
    return jsonb_build_object('ok', false, 'reason', 'draft_failed');
  end if;
  if v_draft.status <> 'done' or v_draft.write_payload is null then
    return jsonb_build_object('ok', false, 'reason', 'draft_not_ready');
  end if;
  if v_draft.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'draft_expired');
  end if;
  if v_draft.safety_fingerprint is null
     or v_draft.safety_fingerprint is distinct from p_live_fingerprint then
    return jsonb_build_object('ok', false, 'reason', 'draft_stale', 'stale', 'safety');
  end if;

  v_contract := case
    when strpos(v_draft.source_version, '|') = 0 then v_draft.source_version
    else reverse(split_part(reverse(v_draft.source_version), '|', 1))
  end;
  if v_contract is distinct from p_contract_version then
    return jsonb_build_object('ok', false, 'reason', 'draft_stale', 'stale', 'source');
  end if;

  begin
    select * into v_written
      from public.write_student_meal_plan(
        p_user_id => p_user,
        p_intent => p_intent,
        p_starts_on => v_draft.starts_on,
        p_duration_days => v_draft.duration_days,
        p_payload => v_draft.write_payload,
        p_replaces => p_replaces
      );
  exception when others then
    -- Le sous-bloc annule toute mutation de l'écrivain avant de rendre le
    -- motif. La ligne reste done et peut être relue; aucun état moitié adopté.
    return jsonb_build_object(
      'ok', false,
      'reason', 'plan_not_written',
      'detail', sqlerrm
    );
  end;

  if v_written.meal_id is null then
    raise exception 'keel_adopt_meal_draft: write_student_meal_plan sans meal_id';
  end if;

  update public.student_meal_drafts
     set status = 'adopted',
         adopted_meal_id = v_written.meal_id,
         adopted_at = now()
   where id = v_draft.id and status = 'done';

  if not found then
    raise exception 'keel_adopt_meal_draft: brouillon perdu apres verrouillage';
  end if;

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'meal_id', v_written.meal_id,
    'starts_on', v_draft.starts_on,
    'duration_days', v_draft.duration_days
  );
end;
$function$;

comment on function public.keel_adopt_meal_draft(uuid, uuid, text, uuid, text, text) is
  'Adoption atomique et idempotente d''un student_meal_drafts: verrouille la '
  'ligne, revalide état/expiration/empreinte/contrat, appelle l''écrivain '
  'unique puis marque adopted dans la même transaction.';

revoke all on function public.keel_adopt_meal_draft(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.keel_adopt_meal_draft(uuid, uuid, text, uuid, text, text)
  to service_role;
