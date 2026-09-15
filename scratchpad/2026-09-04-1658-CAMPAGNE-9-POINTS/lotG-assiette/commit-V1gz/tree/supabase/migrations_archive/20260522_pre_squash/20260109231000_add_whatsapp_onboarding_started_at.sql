-- Track the start of WhatsApp onboarding so we can enforce guardrails
-- (e.g. forbid claiming/performing action activation during the first 24h).

alter table public.profiles
  add column if not exists whatsapp_onboarding_started_at timestamptz;

create index if not exists profiles_whatsapp_onboarding_started_at_idx
  on public.profiles (whatsapp_onboarding_started_at);




