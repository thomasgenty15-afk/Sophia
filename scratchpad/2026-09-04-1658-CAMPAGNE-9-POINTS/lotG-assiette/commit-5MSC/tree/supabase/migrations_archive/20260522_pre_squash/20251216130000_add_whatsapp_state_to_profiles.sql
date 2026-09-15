alter table public.profiles
  add column if not exists whatsapp_opted_in boolean not null default false,
  add column if not exists phone_invalid boolean not null default false,
  add column if not exists whatsapp_last_inbound_at timestamptz,
  add column if not exists whatsapp_last_outbound_at timestamptz;

create index if not exists profiles_whatsapp_last_inbound_idx
  on public.profiles (whatsapp_last_inbound_at desc);

create index if not exists profiles_whatsapp_opted_in_idx
  on public.profiles (whatsapp_opted_in);


