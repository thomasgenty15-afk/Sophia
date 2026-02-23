-- Add explicit time_of_day for vital signs so checkup day_scope can be deterministic.
alter table public.user_vital_signs
  add column if not exists time_of_day text;

update public.user_vital_signs
set time_of_day = 'any_time'
where time_of_day is null;

alter table public.user_vital_signs
  alter column time_of_day set default 'any_time';

alter table public.user_vital_signs
  alter column time_of_day set not null;

alter table public.user_vital_signs
  drop constraint if exists user_vital_signs_time_of_day_check;

alter table public.user_vital_signs
  add constraint user_vital_signs_time_of_day_check
  check (time_of_day in ('morning', 'afternoon', 'evening', 'night', 'any_time'));
