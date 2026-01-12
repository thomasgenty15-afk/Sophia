create table if not exists user_feedback_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    plan_id uuid references user_plans(id) on delete set null,
    submission_id uuid, -- Lien avec le cycle/submission
    
    -- Section Système
    system_rating integer check (system_rating >= 0 and system_rating <= 10),
    system_comment text,
    
    -- Section Sophia WhatsApp
    sophia_rating integer check (sophia_rating >= 0 and sophia_rating <= 10),
    sophia_comment text,
    
    -- Section Architecte
    architect_rating integer check (architect_rating >= 0 and architect_rating <= 10),
    architect_comment text,
    
    -- Méta-données
    context jsonb default '{}'::jsonb, -- trial, subscription_tier, source, etc.
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Active RLS
alter table user_feedback_entries enable row level security;

-- Policies
create policy "Users can insert their own feedback" 
on user_feedback_entries for insert 
with check (auth.uid() = user_id);

create policy "Users can view their own feedback" 
on user_feedback_entries for select 
using (auth.uid() = user_id);


