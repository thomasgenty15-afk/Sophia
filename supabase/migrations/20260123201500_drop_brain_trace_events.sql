-- Remove brain_trace_events: brain tracing is stored canonically in conversation_eval_events (source='brain-trace').

drop table if exists public.brain_trace_events;




