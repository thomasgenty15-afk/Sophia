alter table public.user_plans
  add column if not exists inputs_low_motivation_message text;
