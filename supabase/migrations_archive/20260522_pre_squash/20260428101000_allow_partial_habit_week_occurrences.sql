alter table public.user_habit_week_occurrences
  drop constraint if exists user_habit_week_occurrences_status_check;

alter table public.user_habit_week_occurrences
  add constraint user_habit_week_occurrences_status_check
  check (status in ('planned', 'done', 'partial', 'missed', 'rescheduled'));
