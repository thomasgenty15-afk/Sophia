-- Table for tracking framework progress (similar to user_actions but specific to frameworks)
-- This table is populated when the plan is validated/activated
create table if not exists public.user_framework_tracking (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- Context links
  plan_id uuid references public.user_plans(id) on delete cascade not null,
  submission_id uuid,
  
  -- Framework details (matching the Action object)
  action_id text not null, -- The ID from the plan JSON
  title text not null,
  type text not null, -- 'one_shot' or 'recurring'
  
  -- Progress tracking
  target_reps integer default 1,
  current_reps integer default 0,
  
  -- Status
  status text default 'active' check (status in ('active', 'completed', 'cancelled')),
  last_performed_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for performance
create index if not exists framework_tracking_user_plan_idx on public.user_framework_tracking(user_id, plan_id);

-- RLS
alter table public.user_framework_tracking enable row level security;

create policy "Users can view their own framework tracking"
  on public.user_framework_tracking for select
  using (auth.uid() = user_id);

create policy "Users can insert their own framework tracking"
  on public.user_framework_tracking for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own framework tracking"
  on public.user_framework_tracking for update
  using (auth.uid() = user_id);

create policy "Users can delete their own framework tracking"
  on public.user_framework_tracking for delete
  using (auth.uid() = user_id);

