alter table public.user_transformations
  drop constraint if exists user_transformations_priority_order_check;

alter table public.user_transformations
  add constraint user_transformations_priority_order_check
  check (priority_order >= 1);
