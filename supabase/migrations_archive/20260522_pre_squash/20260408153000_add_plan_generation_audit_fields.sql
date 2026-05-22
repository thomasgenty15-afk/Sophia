alter table public.user_cycles
  add column if not exists requested_pace text null;

alter table public.user_cycles
  drop constraint if exists user_cycles_requested_pace_check;

alter table public.user_cycles
  add constraint user_cycles_requested_pace_check
  check (
    requested_pace is null
    or requested_pace in ('cool', 'normal', 'intense')
  );

alter table public.user_plans_v2
  add column if not exists generation_feedback text null,
  add column if not exists generation_input_snapshot jsonb null;
