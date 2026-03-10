alter table public.user_actions
  drop constraint if exists user_actions_status_check;

alter table public.user_actions
  add constraint user_actions_status_check
  check (status = any (array['pending'::text, 'active'::text, 'completed'::text, 'deactivated'::text, 'cancelled'::text, 'abandoned'::text]));

alter table public.user_framework_tracking
  drop constraint if exists user_framework_tracking_status_check;

alter table public.user_framework_tracking
  add constraint user_framework_tracking_status_check
  check (status = any (array['pending'::text, 'active'::text, 'completed'::text, 'deactivated'::text, 'cancelled'::text, 'abandoned'::text]));

alter table public.user_personal_actions
  drop constraint if exists user_personal_actions_status_check;

alter table public.user_personal_actions
  add constraint user_personal_actions_status_check
  check (status in ('pending', 'active', 'completed', 'deactivated', 'cancelled', 'abandoned'));
