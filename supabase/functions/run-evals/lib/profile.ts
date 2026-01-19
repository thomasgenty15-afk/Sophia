export async function fetchProfileSnapshot(admin: any, userId: string): Promise<any> {
  const { data } = await admin
    .from("profiles")
    .select(
      "id,full_name,email,phone_number,phone_invalid,phone_verified_at,trial_end,whatsapp_opted_in,whatsapp_opted_out_at,whatsapp_optout_reason,whatsapp_optout_confirmed_at,whatsapp_bilan_opted_in,whatsapp_optin_sent_at,whatsapp_last_inbound_at,whatsapp_last_outbound_at,whatsapp_state,whatsapp_state_updated_at",
    )
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}




