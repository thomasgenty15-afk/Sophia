-- Extend checkin status to support "awaiting_user" when a template opt-in was sent.
do $$
begin
  begin
    alter type public.checkin_status add value if not exists 'awaiting_user';
  exception when duplicate_object then
    -- already added
    null;
  end;
end $$;

create table if not exists public.whatsapp_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  kind text not null check (kind in ('scheduled_checkin', 'memory_echo')),
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled', 'expired')),
  -- Optional link to scheduled_checkins row
  scheduled_checkin_id uuid references public.scheduled_checkins(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists whatsapp_pending_actions_lookup_idx
  on public.whatsapp_pending_actions (user_id, kind, status, created_at desc);

alter table public.whatsapp_pending_actions enable row level security;

-- End-users don't need access; backend only (service role bypasses RLS).
create policy "No direct access to whatsapp_pending_actions (select none)"
  on public.whatsapp_pending_actions for select
  using (false);


