-- Architect reflections storage.
-- User-owned notes for the "Reflections" section in the Architect space.

create or replace function public.normalize_architect_reflection_tags(input_tags text[])
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
    cleaned_tag := nullif(btrim(coalesce(raw_tag, '')), '');
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

create or replace function public.architect_reflection_tags_are_valid(input_tags text[])
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

  if cardinality(input_tags) > 12 then
    return false;
  end if;

  foreach tag in array input_tags loop
    if tag is null or btrim(tag) = '' or char_length(tag) > 40 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.handle_user_architect_reflections_write()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(coalesce(new.title, ''));
  new.content := btrim(coalesce(new.content, ''));

  if new.title = '' and new.content <> '' then
    new.title := 'Sans titre';
  end if;

  new.tags := public.normalize_architect_reflection_tags(coalesce(new.tags, '{}'::text[]));
  return new;
end;
$$;

create table if not exists public.user_architect_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_architect_reflections_title_check
    check (char_length(title) between 1 and 160),
  constraint user_architect_reflections_content_check
    check (char_length(content) <= 12000),
  constraint user_architect_reflections_tags_check
    check (public.architect_reflection_tags_are_valid(tags))
);

create index if not exists user_architect_reflections_user_created_idx
  on public.user_architect_reflections (user_id, created_at desc, id desc);

create index if not exists user_architect_reflections_user_updated_idx
  on public.user_architect_reflections (user_id, updated_at desc, id desc);

create index if not exists user_architect_reflections_tags_gin_idx
  on public.user_architect_reflections using gin (tags);

drop trigger if exists normalize_user_architect_reflections on public.user_architect_reflections;
create trigger normalize_user_architect_reflections
before insert or update on public.user_architect_reflections
for each row
execute function public.handle_user_architect_reflections_write();

drop trigger if exists update_user_architect_reflections_modtime on public.user_architect_reflections;
create trigger update_user_architect_reflections_modtime
before update on public.user_architect_reflections
for each row
execute function public.update_modified_column();

alter table public.user_architect_reflections enable row level security;

drop policy if exists rls_user_architect_reflections_select_own on public.user_architect_reflections;
create policy rls_user_architect_reflections_select_own
  on public.user_architect_reflections
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_architect_reflections_insert_own on public.user_architect_reflections;
create policy rls_user_architect_reflections_insert_own
  on public.user_architect_reflections
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.has_app_write_access(auth.uid())
  );

drop policy if exists rls_user_architect_reflections_update_own on public.user_architect_reflections;
create policy rls_user_architect_reflections_update_own
  on public.user_architect_reflections
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and public.has_app_write_access(auth.uid())
  )
  with check (
    auth.uid() = user_id
    and public.has_app_write_access(auth.uid())
  );

drop policy if exists rls_user_architect_reflections_delete_own on public.user_architect_reflections;
create policy rls_user_architect_reflections_delete_own
  on public.user_architect_reflections
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    and public.has_app_write_access(auth.uid())
  );
