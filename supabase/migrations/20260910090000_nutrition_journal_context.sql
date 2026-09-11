-- Additive only. Context is server-owned and independent of model output.
alter table public.protocol_events add column if not exists meal_context jsonb;
alter table public.protocol_events add column if not exists meal_context_history jsonb not null default '[]'::jsonb;
alter table public.protocol_events add column if not exists journal_mutation_id text;
comment on column public.protocol_events.meal_context is 'Versioned nutrition journal occurrence, relation and plan references. Written by authenticated server operations.';
-- Keep browser writes from forging links to another person's plan. Existing
-- quick-tap trigger continues to protect its own columns.
create or replace function public.guard_meal_context() returns trigger language plpgsql set search_path=public as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') and coalesce(auth.role(),'') <> 'service_role' then
    if TG_OP='INSERT' then
      if new.meal_context is not null or new.meal_context_history <> '[]'::jsonb or new.journal_mutation_id is not null then raise exception 'meal_context_server_only'; end if;
    elsif new.meal_context is distinct from old.meal_context or new.meal_context_history is distinct from old.meal_context_history or new.journal_mutation_id is distinct from old.journal_mutation_id then
      raise exception 'meal_context_server_only';
    end if;
  end if;
  return new;
end $$;
create trigger protocol_events_meal_context_guard before insert or update on public.protocol_events for each row execute function public.guard_meal_context();

create or replace function public.correct_nutrition_journal(p_user_id uuid, p_event_ids uuid[], p_date date, p_slot text, p_context jsonb, p_mutation_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare expected integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'journal_server_only'; end if;
  expected := cardinality(p_event_ids);
  if expected < 1 or expected > 50 then raise exception 'journal_stale'; end if;
  if p_mutation_id !~ '^[A-Za-z0-9:_-]{8,120}$' then raise exception 'journal_bad_request'; end if;
  perform 1 from protocol_events where user_id=p_user_id and id=any(p_event_ids) for update;
  if (select count(*) from protocol_events where user_id=p_user_id and id=any(p_event_ids)) <> expected then raise exception 'journal_stale'; end if;
  if (select count(*) from protocol_events where user_id=p_user_id and id=any(p_event_ids) and journal_mutation_id=p_mutation_id) = expected then return; end if;
  update protocol_events set
    meal_context_history=meal_context_history || jsonb_build_array(jsonb_build_object('changed_at',clock_timestamp(),'mutation_id',p_mutation_id,'local_date',local_date,'slot_key',slot_key,'meal_context',meal_context)),
    local_date=p_date,slot_key=p_slot,meal_context=p_context,journal_mutation_id=p_mutation_id
  where user_id=p_user_id and id=any(p_event_ids);
end $$;
revoke all on function public.correct_nutrition_journal(uuid,uuid[],date,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.correct_nutrition_journal(uuid,uuid[],date,text,jsonb,text) to service_role;
