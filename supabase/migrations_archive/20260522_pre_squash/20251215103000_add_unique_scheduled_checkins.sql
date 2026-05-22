-- Prevent duplicates when the scheduler/job runs multiple times (idempotency).
-- We consider a check-in uniquely identified by (user_id, event_context, scheduled_for).
create unique index if not exists scheduled_checkins_user_event_time_unique
  on public.scheduled_checkins (user_id, event_context, scheduled_for);


