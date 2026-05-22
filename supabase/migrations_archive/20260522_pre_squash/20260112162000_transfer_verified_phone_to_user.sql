-- Allow transferring a VERIFIED phone number from one profile to another when the user proves ownership.
-- Proof is established by the WhatsApp linking flow (email validation -> LINK:<token> sent from that phone).
--
-- This function is called by edge functions with service_role and runs atomically in a single transaction.

create or replace function public.transfer_verified_phone_to_user(p_user_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_old_user_id uuid;
begin
  v_phone := nullif(trim(p_phone), '');
  if v_phone is null then
    raise exception 'missing phone';
  end if;

  -- Lock the current verified owner (if any) to avoid races.
  select p.id
    into v_old_user_id
  from public.profiles p
  where p.phone_number = v_phone
    and p.phone_verified_at is not null
    and p.phone_number is not null
  limit 1
  for update;

  -- If the phone is verified elsewhere, clear it from the old account.
  if v_old_user_id is not null and v_old_user_id <> p_user_id then
    update public.profiles
    set
      phone_number = null,
      phone_verified_at = null,
      phone_invalid = false,
      whatsapp_opted_in = false,
      whatsapp_bilan_opted_in = false,
      whatsapp_opted_out_at = now(),
      whatsapp_optout_reason = 'phone_transferred',
      whatsapp_optout_confirmed_at = null,
      whatsapp_state = null,
      whatsapp_state_updated_at = now()
    where id = v_old_user_id;
  end if;

  -- Set the phone as verified on the target user.
  update public.profiles
  set
    phone_number = v_phone,
    phone_verified_at = now(),
    phone_invalid = false,
    whatsapp_opted_in = true,
    whatsapp_opted_out_at = null,
    whatsapp_optout_reason = null,
    whatsapp_optout_confirmed_at = null,
    whatsapp_last_inbound_at = now(),
    whatsapp_state_updated_at = coalesce(whatsapp_state_updated_at, now())
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'old_user_id', v_old_user_id,
    'user_id', p_user_id,
    'phone', v_phone
  );
end;
$$;

grant execute on function public.transfer_verified_phone_to_user(uuid, text) to service_role;



