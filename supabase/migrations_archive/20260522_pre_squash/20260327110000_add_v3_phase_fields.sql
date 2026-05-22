alter table public.user_plan_items
  add column if not exists phase_id text null,
  add column if not exists phase_order integer null;

create index if not exists user_plan_items_phase_idx
  on public.user_plan_items (plan_id, phase_order);

alter table public.user_transformations
  add column if not exists ordering_rationale text null;
