create type checkin_status as enum ('pending', 'sent', 'cancelled');

create table scheduled_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  event_context text not null,
  draft_message text not null,
  scheduled_for timestamptz not null,
  status checkin_status default 'pending'::checkin_status not null,
  created_at timestamptz default now() not null,
  processed_at timestamptz
);

-- Add RLS policies
alter table scheduled_checkins enable row level security;

create policy "Users can view their own scheduled checkins"
  on scheduled_checkins for select
  using (auth.uid() = user_id);

-- We might not need insert/update policies for the frontend if this is purely backend driven,
-- but helpful for debugging or if we add UI control later.
create policy "Users can update their own scheduled checkins"
  on scheduled_checkins for update
  using (auth.uid() = user_id);

