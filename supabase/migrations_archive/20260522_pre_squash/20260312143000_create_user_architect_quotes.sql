create or replace function public.normalize_architect_quote_tags(input_tags text[])
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

create or replace function public.architect_quote_tags_are_valid(input_tags text[])
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

create or replace function public.handle_user_architect_quotes_write()
returns trigger
language plpgsql
as $$
begin
  new.quote_text := btrim(coalesce(new.quote_text, ''));
  new.author := nullif(btrim(coalesce(new.author, '')), '');
  new.source_context := nullif(btrim(coalesce(new.source_context, '')), '');
  new.tags := public.normalize_architect_quote_tags(coalesce(new.tags, '{}'::text[]));
  return new;
end;
$$;

create table if not exists public.user_architect_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_text text not null,
  author text null,
  source_context text null,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_architect_quotes_quote_text_check
    check (char_length(quote_text) between 1 and 3000),
  constraint user_architect_quotes_author_check
    check (author is null or char_length(author) <= 160),
  constraint user_architect_quotes_source_context_check
    check (source_context is null or char_length(source_context) <= 240),
  constraint user_architect_quotes_tags_check
    check (public.architect_quote_tags_are_valid(tags))
);

create index if not exists user_architect_quotes_user_updated_idx
  on public.user_architect_quotes (user_id, updated_at desc, id desc);

create index if not exists user_architect_quotes_user_created_idx
  on public.user_architect_quotes (user_id, created_at desc, id desc);

create index if not exists user_architect_quotes_tags_gin_idx
  on public.user_architect_quotes using gin (tags);

drop trigger if exists normalize_user_architect_quotes on public.user_architect_quotes;
create trigger normalize_user_architect_quotes
before insert or update on public.user_architect_quotes
for each row
execute function public.handle_user_architect_quotes_write();

drop trigger if exists update_user_architect_quotes_modtime on public.user_architect_quotes;
create trigger update_user_architect_quotes_modtime
before update on public.user_architect_quotes
for each row
execute function public.update_modified_column();

alter table public.user_architect_quotes enable row level security;

drop policy if exists rls_user_architect_quotes_select_own on public.user_architect_quotes;
create policy rls_user_architect_quotes_select_own
  on public.user_architect_quotes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_architect_quotes_insert_own on public.user_architect_quotes;
create policy rls_user_architect_quotes_insert_own
  on public.user_architect_quotes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_architect_quotes_update_own on public.user_architect_quotes;
create policy rls_user_architect_quotes_update_own
  on public.user_architect_quotes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_architect_quotes_delete_own on public.user_architect_quotes;
create policy rls_user_architect_quotes_delete_own
  on public.user_architect_quotes
  for delete
  to authenticated
  using (auth.uid() = user_id);
