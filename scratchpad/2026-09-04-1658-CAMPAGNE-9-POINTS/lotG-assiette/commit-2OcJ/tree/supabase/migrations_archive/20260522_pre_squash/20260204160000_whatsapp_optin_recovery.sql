-- Track WhatsApp opt-in delivery failures + recovery state (email fallback).
-- Used by:
-- - supabase/functions/process-whatsapp-optin-recovery
-- - supabase/functions/whatsapp-webhook (resolve on inbound)
-- - frontend dashboard banner

create table if not exists public.whatsapp_optin_recovery (
  user_id uuid primary key references public.profiles(id) on delete cascade,

  status text not null default 'pending' check (status in ('pending','resolved','cancelled')),

  provider_message_id text null,
  error_code text null,
  error_message text null,

  first_detected_at timestamptz not null default now(),
  email_sent_at timestamptz null,
  resolved_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_optin_recovery_status_idx
  on public.whatsapp_optin_recovery (status, updated_at desc);

create index if not exists whatsapp_optin_recovery_email_sent_idx
  on public.whatsapp_optin_recovery (email_sent_at desc);

alter table public.whatsapp_optin_recovery enable row level security;

-- Users can see their own recovery state (for dashboard UX).
drop policy if exists rls_whatsapp_optin_recovery_select_own on public.whatsapp_optin_recovery;
create policy rls_whatsapp_optin_recovery_select_own
  on public.whatsapp_optin_recovery
  for select
  using (auth.uid() = user_id);

-- No direct write policies: service role only.


