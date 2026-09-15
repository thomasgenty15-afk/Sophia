alter table public.profiles
  add column if not exists whatsapp_state text,
  add column if not exists whatsapp_state_updated_at timestamptz;

create index if not exists profiles_whatsapp_state_idx
  on public.profiles (whatsapp_state);


