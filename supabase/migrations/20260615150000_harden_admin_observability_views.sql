-- Harden admin-only observability views that should not be directly exposed
-- through public/anon/authenticated PostgREST access.

alter view public.cost_fact_events set (security_invoker = true);
alter view public.cost_fact_events_enriched set (security_invoker = true);
alter view public.conversation_runtime_audit_events set (security_invoker = true);

revoke all on table public.cost_fact_events from public;
revoke all on table public.cost_fact_events from anon;
revoke all on table public.cost_fact_events from authenticated;
grant select on table public.cost_fact_events to service_role;

revoke all on table public.cost_fact_events_enriched from public;
revoke all on table public.cost_fact_events_enriched from anon;
revoke all on table public.cost_fact_events_enriched from authenticated;
grant select on table public.cost_fact_events_enriched to service_role;

revoke all on table public.conversation_runtime_audit_events from public;
revoke all on table public.conversation_runtime_audit_events from anon;
revoke all on table public.conversation_runtime_audit_events from authenticated;
grant select on table public.conversation_runtime_audit_events to service_role;
