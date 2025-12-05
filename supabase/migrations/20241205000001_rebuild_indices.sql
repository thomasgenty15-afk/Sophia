-- Drop and recreate indices to fix potential corruption and improve performance

-- user_actions
drop index if exists public.actions_user_plan_idx;
drop index if exists public.actions_status_idx;
create index actions_user_plan_idx on public.user_actions(user_id, plan_id);
create index actions_status_idx on public.user_actions(status);

-- user_framework_tracking
drop index if exists public.framework_tracking_user_plan_idx;
drop index if exists public.framework_tracking_status_idx;
create index framework_tracking_user_plan_idx on public.user_framework_tracking(user_id, plan_id);
create index framework_tracking_status_idx on public.user_framework_tracking(status);

