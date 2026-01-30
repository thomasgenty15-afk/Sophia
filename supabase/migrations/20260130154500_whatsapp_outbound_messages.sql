-- WhatsApp outbound tracking tables (V2)
-- Required by:
-- - supabase/functions/_shared/whatsapp_outbound_tracking.ts
-- - supabase/functions/whatsapp-webhook/index.ts (status callbacks)

create extension if not exists "pgcrypto";

-- Outbound messages (tracked)
create table if not exists public.whatsapp_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  request_id text null,
  user_id uuid null references public.profiles(id) on delete set null,

  to_e164 text not null,
  reply_to_wamid_in text null,

  message_type text not null check (message_type in ('text', 'template')),
  content_preview text not null default '',
  graph_payload jsonb not null default '{}'::jsonb,

  status text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','cancelled','skipped')),
  provider_message_id text null,

  attempt_count int not null default 0,
  max_attempts int not null default 8,
  last_attempt_at timestamptz null,
  next_retry_at timestamptz null,

  locked_at timestamptz null,
  locked_by text null,

  last_error_code text null,
  last_error_message text null,
  last_error jsonb null,

  metadata jsonb not null default '{}'::jsonb
);

create index if not exists whatsapp_outbound_messages_user_id_idx
  on public.whatsapp_outbound_messages (user_id);

create index if not exists whatsapp_outbound_messages_status_next_retry_idx
  on public.whatsapp_outbound_messages (status, next_retry_at);

create unique index if not exists whatsapp_outbound_messages_provider_message_id_key
  on public.whatsapp_outbound_messages (provider_message_id)
  where provider_message_id is not null;

-- Status callbacks from Meta (delivery/read/failed). Used by whatsapp-webhook.
create table if not exists public.whatsapp_outbound_status_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  provider_message_id text not null,
  status text not null,
  status_timestamp timestamptz null,
  recipient_id text null,
  raw jsonb not null default '{}'::jsonb
);

create unique index if not exists whatsapp_outbound_status_events_dedup_key
  on public.whatsapp_outbound_status_events (provider_message_id, status, status_timestamp);


