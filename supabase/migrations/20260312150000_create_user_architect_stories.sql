create or replace function public.normalize_architect_story_bullet_points(input_points text[])
returns text[]
language plpgsql
immutable
as $$
declare
  raw_point text;
  cleaned_point text;
  result_points text[] := '{}'::text[];
begin
  if input_points is null then
    return '{}'::text[];
  end if;

  foreach raw_point in array input_points loop
    cleaned_point := nullif(regexp_replace(btrim(coalesce(raw_point, '')), '\s+', ' ', 'g'), '');
    if cleaned_point is null then
      continue;
    end if;

    result_points := array_append(result_points, cleaned_point);
  end loop;

  return result_points;
end;
$$;

create or replace function public.normalize_architect_story_tags(input_tags text[])
returns text[]
language plpgsql
immutable
as $$
declare
  raw_tag text;
  cleaned_tag text;
  result_tags text[] := '{}'::text[];
  seen_tags text[] := '{}'::text[];
begin
  if input_tags is null then
    return '{}'::text[];
  end if;

  foreach raw_tag in array input_tags loop
    cleaned_tag := nullif(regexp_replace(btrim(coalesce(raw_tag, '')), '\s+', ' ', 'g'), '');
    if cleaned_tag is null then
      continue;
    end if;

    if lower(cleaned_tag) = any(seen_tags) then
      continue;
    end if;

    seen_tags := array_append(seen_tags, lower(cleaned_tag));
    result_tags := array_append(result_tags, cleaned_tag);
  end loop;

  return result_tags;
end;
$$;

create or replace function public.architect_story_bullet_points_are_valid(input_points text[])
returns boolean
language plpgsql
immutable
as $$
declare
  point text;
begin
  if input_points is null then
    return false;
  end if;

  if cardinality(input_points) > 24 then
    return false;
  end if;

  foreach point in array input_points loop
    if point is null or btrim(point) = '' or char_length(point) > 500 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.architect_story_tags_are_valid(input_tags text[])
returns boolean
language plpgsql
immutable
as $$
declare
  tag text;
begin
  if input_tags is null then
    return false;
  end if;

  if cardinality(input_tags) > 16 then
    return false;
  end if;

  foreach tag in array input_tags loop
    if tag is null or btrim(tag) = '' or char_length(tag) > 48 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.handle_user_architect_stories_write()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(coalesce(new.title, ''));
  new.duration_label := nullif(btrim(coalesce(new.duration_label, '')), '');
  new.bullet_points := public.normalize_architect_story_bullet_points(coalesce(new.bullet_points, '{}'::text[]));
  new.speech_map := btrim(regexp_replace(coalesce(new.speech_map, ''), E'\\r\\n?', E'\n', 'g'));
  new.topic_tags := public.normalize_architect_story_tags(coalesce(new.topic_tags, '{}'::text[]));
  return new;
end;
$$;

create table if not exists public.user_architect_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  duration_label text null,
  bullet_points text[] not null default '{}'::text[],
  speech_map text not null default '',
  topic_tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_architect_stories_title_check
    check (char_length(title) between 1 and 180),
  constraint user_architect_stories_duration_label_check
    check (duration_label is null or char_length(duration_label) <= 80),
  constraint user_architect_stories_bullet_points_check
    check (public.architect_story_bullet_points_are_valid(bullet_points)),
  constraint user_architect_stories_speech_map_check
    check (char_length(speech_map) <= 8000),
  constraint user_architect_stories_topic_tags_check
    check (public.architect_story_tags_are_valid(topic_tags))
);

create index if not exists user_architect_stories_user_updated_idx
  on public.user_architect_stories (user_id, updated_at desc, id desc);

create index if not exists user_architect_stories_user_created_idx
  on public.user_architect_stories (user_id, created_at desc, id desc);

create index if not exists user_architect_stories_topic_tags_gin_idx
  on public.user_architect_stories using gin (topic_tags);

drop trigger if exists normalize_user_architect_stories on public.user_architect_stories;
create trigger normalize_user_architect_stories
before insert or update on public.user_architect_stories
for each row
execute function public.handle_user_architect_stories_write();

drop trigger if exists update_user_architect_stories_modtime on public.user_architect_stories;
create trigger update_user_architect_stories_modtime
before update on public.user_architect_stories
for each row
execute function public.update_modified_column();

alter table public.user_architect_stories enable row level security;

drop policy if exists rls_user_architect_stories_select_own on public.user_architect_stories;
create policy rls_user_architect_stories_select_own
  on public.user_architect_stories
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_architect_stories_insert_own on public.user_architect_stories;
create policy rls_user_architect_stories_insert_own
  on public.user_architect_stories
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_architect_stories_update_own on public.user_architect_stories;
create policy rls_user_architect_stories_update_own
  on public.user_architect_stories
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_architect_stories_delete_own on public.user_architect_stories;
create policy rls_user_architect_stories_delete_own
  on public.user_architect_stories
  for delete
  to authenticated
  using (auth.uid() = user_id);
