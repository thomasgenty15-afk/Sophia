alter table public.profiles
  add column if not exists whatsapp_bilan_paused_until timestamptz,
  add column if not exists whatsapp_bilan_missed_streak int not null default 0,
  add column if not exists whatsapp_bilan_last_prompt_at timestamptz,
  add column if not exists whatsapp_bilan_winback_step int not null default 0,
  add column if not exists whatsapp_bilan_last_winback_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_whatsapp_bilan_winback_step_check;

alter table public.profiles
  add constraint profiles_whatsapp_bilan_winback_step_check
  check (whatsapp_bilan_winback_step between 0 and 3);

alter table public.profiles
  drop constraint if exists profiles_whatsapp_bilan_missed_streak_check;

alter table public.profiles
  add constraint profiles_whatsapp_bilan_missed_streak_check
  check (whatsapp_bilan_missed_streak >= 0 and whatsapp_bilan_missed_streak <= 30);

create index if not exists profiles_whatsapp_bilan_paused_until_idx
  on public.profiles (whatsapp_bilan_paused_until);


