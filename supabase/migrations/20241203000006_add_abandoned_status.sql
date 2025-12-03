-- Update status check constraint for user_actions to include 'abandoned'
alter table public.user_actions drop constraint if exists user_actions_status_check;
alter table public.user_actions add constraint user_actions_status_check 
  check (status in ('pending', 'active', 'completed', 'cancelled', 'abandoned'));

-- Update status check constraint for user_framework_tracking to include 'abandoned'
alter table public.user_framework_tracking drop constraint if exists user_framework_tracking_status_check;
alter table public.user_framework_tracking add constraint user_framework_tracking_status_check 
  check (status in ('pending', 'active', 'completed', 'cancelled', 'abandoned'));

