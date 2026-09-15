alter table public.profiles
  add column if not exists whatsapp_coaching_paused_until timestamptz;

create index if not exists profiles_whatsapp_coaching_paused_until_idx
  on public.profiles (whatsapp_coaching_paused_until);
