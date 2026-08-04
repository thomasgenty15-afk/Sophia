alter table public.user_cycles
  add column if not exists validated_structure jsonb null;
