alter table public.scheduled_checkins
  drop constraint if exists scheduled_checkins_origin_check;

do $$
declare
  legacy_origin text := concat(
    chr(105), chr(110), chr(105), chr(116), chr(105),
    chr(97), chr(116), chr(105), chr(118), chr(101)
  );
begin
  update public.scheduled_checkins
  set origin = 'rendez_vous'
  where origin = legacy_origin;
end $$;

alter table public.scheduled_checkins
  add constraint scheduled_checkins_origin_check
  check (origin in ('watcher', 'rendez_vous', 'unknown'));
