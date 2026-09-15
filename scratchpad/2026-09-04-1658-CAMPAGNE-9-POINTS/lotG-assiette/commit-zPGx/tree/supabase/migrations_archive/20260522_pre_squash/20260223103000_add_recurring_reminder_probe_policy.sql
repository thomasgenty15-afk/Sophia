-- Track unanswered 24h-window consent probes for recurring reminders.
-- Rule: send consent probe for up to 2 occurrences; if still unanswered, auto-pause the reminder.

alter table public.user_recurring_reminders
  add column if not exists unanswered_probe_count integer not null default 0
    check (unanswered_probe_count >= 0 and unanswered_probe_count <= 2),
  add column if not exists probe_last_sent_at timestamptz null,
  add column if not exists probe_paused_at timestamptz null;

