-- Minimal environment-specific configuration table.
-- Purpose: allow DB triggers / pg_cron jobs to read per-environment values
-- without hardcoding URLs in migration files.

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Basic RLS: lock down for normal users (service role + postgres bypasses RLS).
alter table public.app_config enable row level security;

-- Optional: if you ever want users/admins to read it via API, add policies later.


