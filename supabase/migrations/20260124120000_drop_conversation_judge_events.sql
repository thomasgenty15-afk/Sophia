-- Remove conversation_judge_events: verifier logs are now captured in conversation_eval_events during eval runs.
drop table if exists public.conversation_judge_events cascade;


