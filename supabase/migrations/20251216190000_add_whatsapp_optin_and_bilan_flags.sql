alter table public.profiles
  add column if not exists whatsapp_optin_sent_at timestamptz,
  add column if not exists whatsapp_bilan_opted_in boolean not null default false;

create index if not exists profiles_whatsapp_bilan_opted_in_idx
  on public.profiles (whatsapp_bilan_opted_in);


