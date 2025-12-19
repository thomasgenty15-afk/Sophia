-- Seed dummy data for visualization
do $$
declare
  u1_id uuid := gen_random_uuid();
  u2_id uuid := gen_random_uuid();
  u3_id uuid := gen_random_uuid();
begin
  -- Update pricing to have non-zero values for visualization
  update public.llm_pricing 
  set input_per_1k_tokens_usd = 0.0001, output_per_1k_tokens_usd = 0.0004
  where model = 'gemini-2.0-flash';

  -- Create dummy users in auth.users (minimal fields)
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values 
    (u1_id, 'alice.wonder@example.com', 'dummy', now(), '{"full_name": "Alice Wonder"}'::jsonb),
    (u2_id, 'bob.builder@example.com', 'dummy', now(), '{"full_name": "Bob Builder"}'::jsonb),
    (u3_id, 'charlie.chaplin@example.com', 'dummy', now(), '{"full_name": "Charlie Chaplin"}'::jsonb)
  on conflict (id) do nothing; -- Should not happen with random uuid

  -- Triggers on auth.users usually create profiles, but let's ensure they exist/update them
  -- The trigger `on_auth_user_created` calls `handle_new_user` which inserts into profiles.
  -- So profiles should be there. Let's just update them to be sure about names if trigger failed or whatever.
  -- Actually, let's rely on trigger or insert if missing.
  -- But since we are inside a DO block, triggers might fire.
  
  -- Insert some dummy plans
  insert into public.user_plans (user_id, title, status, content)
  values
    (u1_id, 'Plan de conquête du monde', 'active', '{}'::jsonb),
    (u1_id, 'Apprendre le piano', 'completed', '{}'::jsonb),
    (u2_id, 'Construire une maison', 'active', '{}'::jsonb);

  -- Insert some dummy chat messages
  insert into public.chat_messages (user_id, role, content)
  values
    (u1_id, 'user', 'Hello Sophia !'),
    (u1_id, 'assistant', 'Bonjour Alice !'),
    (u1_id, 'user', 'Aide moi à conquérir le monde.'),
    (u2_id, 'user', 'On peut construire quoi ?'),
    (u2_id, 'assistant', 'Tout ce que tu veux Bob.');

  -- Insert dummy LLM usage
  -- Alice: High usage
  insert into public.llm_usage_events (user_id, model, kind, prompt_tokens, output_tokens, total_tokens, cost_usd)
  select 
    u1_id, 
    'gemini-2.0-flash', 
    'generate', 
    (random() * 1000)::int, 
    (random() * 500)::int, 
    0, -- will be calc roughly
    (random() * 0.01)::numeric
  from generate_series(1, 50);

  -- Bob: Medium usage
  insert into public.llm_usage_events (user_id, model, kind, prompt_tokens, output_tokens, total_tokens, cost_usd)
  select 
    u2_id, 
    'gemini-2.0-flash', 
    'generate', 
    (random() * 500)::int, 
    (random() * 200)::int, 
    0,
    (random() * 0.005)::numeric
  from generate_series(1, 20);

  -- Charlie: Low usage (just started)
  insert into public.llm_usage_events (user_id, model, kind, prompt_tokens, output_tokens, total_tokens, cost_usd)
  select 
    u3_id, 
    'gemini-2.0-flash', 
    'generate', 
    100, 
    50, 
    150,
    0.0001
  from generate_series(1, 2);

end $$;

