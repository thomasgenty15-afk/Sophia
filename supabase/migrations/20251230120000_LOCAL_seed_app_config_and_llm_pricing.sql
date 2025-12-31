-- LOCAL ONLY
--
-- Seeds environment-specific config rows used by DB triggers/crons, and ensures baseline LLM pricing rows.
-- This migration is intentionally marked LOCAL because it uses a local Functions base URL.

-----------------------------------------------------------------------------
-- 1) app_config: Edge Functions gateway base URL + anon key for Kong `apikey` header
-----------------------------------------------------------------------------
insert into public.app_config (key, value)
values
  ('edge_functions_base_url', 'http://host.docker.internal:54321'),
  ('edge_functions_anon_key', 'sb_publishable_ACJWI2qHIZjBrEguHvfOxg_3BJgxAaH')
on conflict (key) do update
set
  value = excluded.value,
  updated_at = now();

-----------------------------------------------------------------------------
-- 2) llm_pricing: baseline prices (USD)
-----------------------------------------------------------------------------
insert into public.llm_pricing (
  provider,
  model,
  input_per_1k_tokens_usd,
  output_per_1k_tokens_usd,
  currency
)
values
  ('gemini', 'gemini-2.0-flash', 0.0003, 0.0025, 'USD'),
  ('gemini', 'gemini-2.5-flash', 0.0003, 0.0025, 'USD'),
  ('gemini', 'text-embedding-004', 0, 0, 'USD')
on conflict (provider, model) do update
set
  input_per_1k_tokens_usd = excluded.input_per_1k_tokens_usd,
  output_per_1k_tokens_usd = excluded.output_per_1k_tokens_usd,
  currency = excluded.currency,
  updated_at = now();


