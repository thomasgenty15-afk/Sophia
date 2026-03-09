create table if not exists public.whatsapp_monthly_quotas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quota_key text not null,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  used_count integer not null default 0 check (used_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, quota_key, month_key)
);

alter table public.whatsapp_monthly_quotas enable row level security;

revoke all on public.whatsapp_monthly_quotas from anon, authenticated;

create or replace function public.consume_whatsapp_monthly_quota(
  p_user_id uuid,
  p_quota_key text,
  p_month_key text,
  p_limit integer
)
returns table (
  allowed boolean,
  used_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used_count integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be >= 1';
  end if;

  insert into public.whatsapp_monthly_quotas (
    user_id,
    quota_key,
    month_key,
    used_count
  )
  values (
    p_user_id,
    p_quota_key,
    p_month_key,
    0
  )
  on conflict (user_id, quota_key, month_key) do nothing;

  update public.whatsapp_monthly_quotas
  set
    used_count = public.whatsapp_monthly_quotas.used_count + 1,
    updated_at = now()
  where user_id = p_user_id
    and quota_key = p_quota_key
    and month_key = p_month_key
    and public.whatsapp_monthly_quotas.used_count < p_limit
  returning public.whatsapp_monthly_quotas.used_count into v_used_count;

  if found then
    return query select true, v_used_count;
    return;
  end if;

  select q.used_count
  into v_used_count
  from public.whatsapp_monthly_quotas q
  where q.user_id = p_user_id
    and q.quota_key = p_quota_key
    and q.month_key = p_month_key;

  return query select false, coalesce(v_used_count, 0);
end;
$$;

create or replace function public.release_whatsapp_monthly_quota(
  p_user_id uuid,
  p_quota_key text,
  p_month_key text
)
returns table (
  used_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used_count integer;
begin
  update public.whatsapp_monthly_quotas
  set
    used_count = greatest(public.whatsapp_monthly_quotas.used_count - 1, 0),
    updated_at = now()
  where user_id = p_user_id
    and quota_key = p_quota_key
    and month_key = p_month_key
  returning public.whatsapp_monthly_quotas.used_count into v_used_count;

  return query select coalesce(v_used_count, 0);
end;
$$;

revoke all on function public.consume_whatsapp_monthly_quota(uuid, text, text, integer) from public;
revoke all on function public.release_whatsapp_monthly_quota(uuid, text, text) from public;

grant execute on function public.consume_whatsapp_monthly_quota(uuid, text, text, integer) to service_role;
grant execute on function public.release_whatsapp_monthly_quota(uuid, text, text) to service_role;
