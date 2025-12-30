insert into public.llm_pricing (provider, model, input_per_1k_tokens_usd, output_per_1k_tokens_usd)
values
  ('gemini', 'gemini-2.0-flash', 0.0003, 0.0025),
  ('gemini', 'gemini-2.5-flash', 0.0003, 0.0025)
on conflict (provider, model) do update
set 
  input_per_1k_tokens_usd = excluded.input_per_1k_tokens_usd,
  output_per_1k_tokens_usd = excluded.output_per_1k_tokens_usd;

