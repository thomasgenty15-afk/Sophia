alter table public.user_global_memories
  add column if not exists scope text not null default 'transformation',
  add column if not exists cycle_id uuid references public.user_cycles(id) on delete set null,
  add column if not exists transformation_id uuid references public.user_transformations(id) on delete set null;

do $$ begin
  alter table public.user_global_memories
    add constraint user_global_memories_scope_check
    check (scope in ('cycle', 'transformation', 'relational'));
exception when duplicate_object then null; end $$;

create index if not exists idx_global_memories_user_scope
  on public.user_global_memories (user_id, scope);

create index if not exists idx_global_memories_cycle_scope
  on public.user_global_memories (cycle_id, scope)
  where cycle_id is not null;

create index if not exists idx_global_memories_transformation_scope
  on public.user_global_memories (transformation_id, scope)
  where transformation_id is not null;
