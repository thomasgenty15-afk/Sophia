alter table public.user_plan_review_requests
  add column if not exists user_change_summary text null;
