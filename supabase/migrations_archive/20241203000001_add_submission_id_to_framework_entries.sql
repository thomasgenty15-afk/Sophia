alter table public.user_framework_entries
add column if not exists submission_id uuid;

create index if not exists framework_entries_submission_idx on public.user_framework_entries(submission_id);

