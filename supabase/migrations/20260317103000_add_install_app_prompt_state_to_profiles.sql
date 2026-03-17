alter table public.profiles
  add column if not exists install_app_dismissed_until timestamptz,
  add column if not exists install_app_marked_installed_at timestamptz,
  add column if not exists install_app_last_prompted_at timestamptz;

comment on column public.profiles.install_app_dismissed_until is
  'When the install app prompt may be shown again after a user postpones it.';

comment on column public.profiles.install_app_marked_installed_at is
  'When the user explicitly said the app is already installed or accepted install.';

comment on column public.profiles.install_app_last_prompted_at is
  'Last time the install app prompt was shown in the dashboard.';
