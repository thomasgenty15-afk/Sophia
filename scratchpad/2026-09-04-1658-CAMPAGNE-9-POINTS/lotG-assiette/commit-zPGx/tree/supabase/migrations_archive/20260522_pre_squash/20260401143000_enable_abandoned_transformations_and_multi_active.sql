alter type public.transformation_status
  add value if not exists 'abandoned';

drop index if exists public.user_transformations_one_active_per_cycle_idx;

create index if not exists user_transformations_cycle_status_priority_idx
  on public.user_transformations (cycle_id, status, priority_order, updated_at desc);
