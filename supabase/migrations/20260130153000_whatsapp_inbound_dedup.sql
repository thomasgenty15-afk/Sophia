-- WhatsApp inbound idempotency table (V2)
-- Needed by `supabase/functions/whatsapp-webhook/index.ts` to de-duplicate inbound Meta messages by `wamid_in`.

create extension if not exists "pgcrypto";

create table if not exists public.whatsapp_inbound_dedup (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Debug / tracing
  request_id text null,
  webhook_request_id text null,

  -- Meta inbound message id (unique)
  wamid_in text not null,
  from_e164 text null,
  user_id uuid null references public.profiles(id) on delete cascade,

  status text not null default 'received',
  processed_at timestamptz null,
  chat_message_id uuid null references public.chat_messages(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists whatsapp_inbound_dedup_wamid_in_key
  on public.whatsapp_inbound_dedup (wamid_in);

create index if not exists whatsapp_inbound_dedup_user_id_idx
  on public.whatsapp_inbound_dedup (user_id);


