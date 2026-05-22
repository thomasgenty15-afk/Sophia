create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_entities_updated_at on public.user_entities;
create trigger trg_user_entities_updated_at
  before update on public.user_entities
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_memory_item_topics_updated_at on public.memory_item_topics;
create trigger trg_memory_item_topics_updated_at
  before update on public.memory_item_topics
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_memory_item_entities_updated_at on public.memory_item_entities;
create trigger trg_memory_item_entities_updated_at
  before update on public.memory_item_entities
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_memory_item_actions_updated_at on public.memory_item_actions;
create trigger trg_memory_item_actions_updated_at
  before update on public.memory_item_actions
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_user_topic_memories_updated_at on public.user_topic_memories;
create trigger trg_user_topic_memories_updated_at
  before update on public.user_topic_memories
  for each row execute function public.tg_set_updated_at();
