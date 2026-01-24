-- Allow using conversation_eval_events as a general-purpose structured event stream (logdrain simulation),
-- not only for eval runs.
alter table public.conversation_eval_events
  alter column eval_run_id drop not null;


