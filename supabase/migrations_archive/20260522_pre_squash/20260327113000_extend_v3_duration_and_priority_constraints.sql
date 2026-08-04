alter table public.user_cycles
  drop constraint if exists user_cycles_duration_months_check;

alter table public.user_cycles
  add constraint user_cycles_duration_months_check
  check (duration_months is null or duration_months between 1 and 6);

alter table public.user_transformations
  drop constraint if exists user_transformations_priority_order_check;

alter table public.user_transformations
  add constraint user_transformations_priority_order_check
  check (priority_order >= 1);
