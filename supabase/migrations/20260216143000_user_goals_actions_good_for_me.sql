alter table public.user_goals
add column if not exists actions_good_for_me text;

comment on column public.user_goals.actions_good_for_me
is 'User-provided list of actions that feel good/effective for them; used to guide plan generation.';
