-- Allow deferring proactive WhatsApp messages to avoid interrupting active conversations.
-- Adds:
-- - kind 'deferred_send' to whatsapp_pending_actions
-- - not_before timestamp: earliest time we are allowed to attempt sending

do $$
begin
  -- Expand kind check constraint to include deferred_send.
  -- Default Postgres name for the inline check is usually <table>_<column>_check.
  begin
    alter table public.whatsapp_pending_actions drop constraint if exists whatsapp_pending_actions_kind_check;
  exception when undefined_table then
    -- table may not exist in some environments
    null;
  end;

  -- Re-add with expanded list (idempotent-ish).
  begin
    alter table public.whatsapp_pending_actions
      add constraint whatsapp_pending_actions_kind_check
      check (kind in ('scheduled_checkin', 'memory_echo', 'deferred_send'));
  exception when duplicate_object then
    null;
  end;
end $$;

alter table public.whatsapp_pending_actions
  add column if not exists not_before timestamptz;

create index if not exists whatsapp_pending_actions_deferred_due_idx
  on public.whatsapp_pending_actions (status, not_before, created_at desc)
  where kind = 'deferred_send';



