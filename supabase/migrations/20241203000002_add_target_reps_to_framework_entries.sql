alter table public.user_framework_entries
add column if not exists target_reps integer default 1;
