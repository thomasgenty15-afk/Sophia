-- Add RLS to WhatsApp tracking tables
-- Tables:
-- - public.whatsapp_inbound_dedup
-- - public.whatsapp_outbound_messages
-- - public.whatsapp_outbound_status_events
--
-- Rationale:
-- - inbound_dedup / outbound_messages have a user_id => allow authenticated users to read their own rows.
-- - outbound_status_events has no user_id => keep it internal-only (no public SELECT policies).

do $$
begin
  if to_regclass('public.whatsapp_inbound_dedup') is not null then
    execute 'alter table public.whatsapp_inbound_dedup enable row level security';
    execute 'drop policy if exists rls_whatsapp_inbound_dedup_select_own on public.whatsapp_inbound_dedup';
    execute 'create policy rls_whatsapp_inbound_dedup_select_own on public.whatsapp_inbound_dedup for select using (auth.uid() = user_id)';
  end if;

  if to_regclass('public.whatsapp_outbound_messages') is not null then
    execute 'alter table public.whatsapp_outbound_messages enable row level security';
    execute 'drop policy if exists rls_whatsapp_outbound_messages_select_own on public.whatsapp_outbound_messages';
    execute 'create policy rls_whatsapp_outbound_messages_select_own on public.whatsapp_outbound_messages for select using (auth.uid() = user_id)';
  end if;

  if to_regclass('public.whatsapp_outbound_status_events') is not null then
    execute 'alter table public.whatsapp_outbound_status_events enable row level security';
    -- Intentionally no public policies: only service role should read/write (service role bypasses RLS).
  end if;
end $$;





