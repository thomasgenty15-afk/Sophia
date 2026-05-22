insert into public.llm_pricing (provider, model, input_per_1k_tokens_usd, output_per_1k_tokens_usd)
values
  -- text-embedding-004
  -- Input: $0.025 / 1M tokens = $0.000025 / 1k tokens
  -- Output: 0
  ('gemini', 'text-embedding-004', 0.000025, 0)
on conflict (provider, model) do update
set 
  input_per_1k_tokens_usd = excluded.input_per_1k_tokens_usd,
  output_per_1k_tokens_usd = excluded.output_per_1k_tokens_usd,
  updated_at = now();



