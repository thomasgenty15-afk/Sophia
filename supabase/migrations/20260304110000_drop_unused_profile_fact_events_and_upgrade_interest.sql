-- Drop deprecated profile facts audit table and unused upgrade interest table.
-- Rationale:
-- - user_profile_fact_events is no longer required for runtime behavior.
-- - upgrade_interest is unused by runtime code.
-- - memories explicitly requested for removal.

drop table if exists public.user_profile_fact_events cascade;
drop table if exists public.memories cascade;

drop trigger if exists trigger_upgrade_interest_updated_at on public.upgrade_interest;
drop function if exists public.update_upgrade_interest_updated_at();
drop table if exists public.upgrade_interest cascade;
