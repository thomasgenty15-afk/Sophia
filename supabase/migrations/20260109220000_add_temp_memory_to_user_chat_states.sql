-- Adds a global parking-lot JSON state used by the Sophia brain/router.
-- This column is referenced by edge functions (e.g. sophia-brain router) and must exist
-- for WhatsApp onboarding + other stateful flows to work reliably.

alter table public.user_chat_states
  add column if not exists temp_memory jsonb not null default '{}'::jsonb;




