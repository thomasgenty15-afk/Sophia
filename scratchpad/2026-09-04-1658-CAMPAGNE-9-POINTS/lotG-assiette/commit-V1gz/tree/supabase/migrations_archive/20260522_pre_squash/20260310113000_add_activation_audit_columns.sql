alter table public.user_actions
  add column if not exists last_activated_at timestamptz null,
  add column if not exists last_deactivated_at timestamptz null,
  add column if not exists last_activation_reason text null;

alter table public.user_framework_tracking
  add column if not exists last_activated_at timestamptz null,
  add column if not exists last_deactivated_at timestamptz null,
  add column if not exists last_activation_reason text null;
