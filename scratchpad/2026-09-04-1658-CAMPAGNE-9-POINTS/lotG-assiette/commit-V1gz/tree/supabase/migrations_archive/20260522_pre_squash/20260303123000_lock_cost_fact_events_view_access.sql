-- Lock down direct access to analytics union view.
-- Access should happen through admin-guarded RPCs.

revoke all on table public.cost_fact_events from public;
revoke all on table public.cost_fact_events from anon;
revoke all on table public.cost_fact_events from authenticated;

grant select on table public.cost_fact_events to service_role;
