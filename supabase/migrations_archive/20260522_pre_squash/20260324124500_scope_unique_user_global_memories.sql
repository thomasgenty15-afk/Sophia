alter table public.user_global_memories
  drop constraint if exists user_global_memories_user_id_full_key_key;

create unique index if not exists user_global_memories_relational_scope_uidx
  on public.user_global_memories (user_id, full_key)
  where scope = 'relational';

create unique index if not exists user_global_memories_cycle_scope_uidx
  on public.user_global_memories (user_id, full_key, cycle_id)
  where scope = 'cycle' and cycle_id is not null;

create unique index if not exists user_global_memories_transformation_scope_uidx
  on public.user_global_memories (user_id, full_key, transformation_id)
  where scope = 'transformation' and transformation_id is not null;
