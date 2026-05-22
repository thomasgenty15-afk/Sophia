alter table public.scheduled_checkins
  drop constraint if exists scheduled_checkins_origin_check;

alter table public.scheduled_checkins
  add constraint scheduled_checkins_origin_check
  check (
    origin in (
      'watcher',
      'rendez_vous',
      'action_morning',
      'action_review',
      'weekly_planning',
      'weekly_review',
      'unknown'
    )
  );
