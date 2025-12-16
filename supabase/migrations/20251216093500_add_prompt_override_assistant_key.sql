-- Ensure prompt override key exists for sophia.assistant (agent "assistant" mode).
insert into public.prompt_overrides (prompt_key, enabled, addendum)
values ('sophia.assistant', true, '')
on conflict (prompt_key) do nothing;


