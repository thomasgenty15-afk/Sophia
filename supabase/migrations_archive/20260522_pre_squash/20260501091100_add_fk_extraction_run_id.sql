alter table public.memory_items
  drop constraint if exists fk_memory_items_extraction_run,
  add constraint fk_memory_items_extraction_run
    foreign key (extraction_run_id)
    references public.memory_extraction_runs(id)
    on delete set null;

alter table public.memory_item_topics
  drop constraint if exists fk_memory_item_topics_extraction_run,
  add constraint fk_memory_item_topics_extraction_run
    foreign key (extraction_run_id)
    references public.memory_extraction_runs(id)
    on delete set null;

alter table public.memory_item_entities
  drop constraint if exists fk_memory_item_entities_extraction_run,
  add constraint fk_memory_item_entities_extraction_run
    foreign key (extraction_run_id)
    references public.memory_extraction_runs(id)
    on delete set null;

alter table public.memory_item_actions
  drop constraint if exists fk_memory_item_actions_extraction_run,
  add constraint fk_memory_item_actions_extraction_run
    foreign key (extraction_run_id)
    references public.memory_extraction_runs(id)
    on delete set null;

alter table public.memory_item_sources
  drop constraint if exists fk_memory_item_sources_extraction_run,
  add constraint fk_memory_item_sources_extraction_run
    foreign key (extraction_run_id)
    references public.memory_extraction_runs(id)
    on delete set null;
