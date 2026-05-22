alter table public.user_potion_sessions
  add column if not exists scope_kind text not null default 'transformation'
  check (scope_kind in ('transformation', 'out_of_plan'));

alter table public.user_potion_sessions
  alter column transformation_id drop not null;

drop index if exists potion_sessions_user_transformation_idx;

drop index if exists potion_sessions_user_transformation_type_idx;

create index if not exists potion_sessions_user_scope_idx
  on public.user_potion_sessions (user_id, cycle_id, scope_kind, transformation_id, generated_at desc);

create index if not exists potion_sessions_user_scope_type_idx
  on public.user_potion_sessions (user_id, cycle_id, scope_kind, transformation_id, potion_type, generated_at desc);
