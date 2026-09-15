create table if not exists public.user_cycle_drafts (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id text not null,
  status text not null
    check (status in ('draft', 'structured', 'prioritized', 'expired')),
  raw_intake_text text not null default '',
  draft_payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_cycle_drafts_anonymous_session_id_key
  on public.user_cycle_drafts (anonymous_session_id);

create index if not exists user_cycle_drafts_expires_at_idx
  on public.user_cycle_drafts (expires_at);

drop trigger if exists update_user_cycle_drafts_modtime on public.user_cycle_drafts;
create trigger update_user_cycle_drafts_modtime
before update on public.user_cycle_drafts
for each row
execute function public.update_modified_column();

alter table public.user_cycle_drafts enable row level security;

comment on table public.user_cycle_drafts is
  'Best-effort server cache for onboarding V2 drafts keyed by anonymous_session_id; accessed via edge functions using service_role.';
