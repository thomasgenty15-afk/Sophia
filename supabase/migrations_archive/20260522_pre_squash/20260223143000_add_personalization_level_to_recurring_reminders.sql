alter table public.user_recurring_reminders
  add column if not exists personalization_level integer not null default 1
    check (personalization_level between 1 and 3),
  add column if not exists context_policy jsonb not null default '{}'::jsonb,
  add column if not exists classification_reason text null,
  add column if not exists last_classified_at timestamptz null;

create index if not exists user_recurring_reminders_personalization_idx
  on public.user_recurring_reminders (user_id, personalization_level, updated_at desc);
