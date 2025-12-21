alter table public.profiles
  add column if not exists whatsapp_opted_out_at timestamptz,
  add column if not exists whatsapp_optout_reason text,
  add column if not exists whatsapp_optout_confirmed_at timestamptz;

create index if not exists profiles_whatsapp_opted_out_at_idx
  on public.profiles (whatsapp_opted_out_at desc);


