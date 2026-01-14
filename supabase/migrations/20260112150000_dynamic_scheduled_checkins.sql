-- Enable "dynamic" scheduled checkins:
-- - scheduled_checkins can be created without a pre-written draft_message (generate at send time)
-- - store mode + payload for generation instructions

do $$
begin
  -- Allow draft_message to be null (dynamic generation at send time)
  begin
    alter table public.scheduled_checkins alter column draft_message drop not null;
  exception when undefined_table then
    null;
  end;
end $$;

alter table public.scheduled_checkins
  add column if not exists message_mode text not null default 'static'
    check (message_mode in ('static', 'dynamic'));

alter table public.scheduled_checkins
  add column if not exists message_payload jsonb not null default '{}'::jsonb;


