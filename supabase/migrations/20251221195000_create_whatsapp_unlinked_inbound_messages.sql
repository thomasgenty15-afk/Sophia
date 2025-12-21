create table if not exists public.whatsapp_unlinked_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  wa_message_id text not null,
  wa_type text,
  text_content text,
  interactive_id text,
  interactive_title text,
  wa_profile_name text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_unlinked_inbound_messages_wa_message_id_ux
  on public.whatsapp_unlinked_inbound_messages(wa_message_id);

create index if not exists whatsapp_unlinked_inbound_messages_phone_created_idx
  on public.whatsapp_unlinked_inbound_messages(phone_e164, created_at desc);

alter table public.whatsapp_unlinked_inbound_messages enable row level security;
-- No public policies: service role only.


