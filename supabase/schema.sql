-- Supabase schema for Sophia (Coachy)
-- Generated according to feat/db-infra specification (NO SCOPE DRIFT)

create extension if not exists "pgcrypto";

-- Enumerations ----------------------------------------------------------------

create type public.difficulty_level as enum ('facile', 'moyen', 'difficile');
create type public.objective_status as enum ('active', 'paused', 'completed', 'abandoned');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_channel as enum ('whatsapp');
create type public.checkin_status as enum ('done', 'missed', 'skipped', 'no_reply');
create type public.badge_type as enum ('bronze', 'argent', 'or');
create type public.agent_code as enum ('A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8');

-- Helper function to maintain updated_at -------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Tables ----------------------------------------------------------------------

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  locale text not null default 'fr-FR',
  timezone text not null default 'Europe/Paris',
  phone_e164 text,
  whatsapp_opt_in boolean not null default false,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending', 'completed', 'blocked')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.user_settings (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  weekly_checkin_dow smallint not null default 1 check (weekly_checkin_dow between 1 and 7),
  weekly_checkin_time time not null default time '20:30:00',
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.objectives_catalogue (
  code text primary key,
  theme_code text not null,
  theme_label text not null,
  subtheme_code text,
  subtheme_label text,
  difficulty public.difficulty_level not null,
  title text not null,
  description text,
  default_frequency_per_week integer not null check (default_frequency_per_week > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.quotes_catalogue (
  code text primary key,
  quote text not null,
  author text,
  theme_code text not null,
  subtheme_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.user_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  objective_code text not null references public.objectives_catalogue(code),
  status public.objective_status not null default 'active',
  started_at date not null default current_date,
  ended_at date,
  frequency_per_week integer,
  schedule jsonb not null default jsonb_build_object('days', '[]'::jsonb, 'time', null),
  last_checkin_at date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_objectives_schedule_days_array check (schedule ? 'days' and jsonb_typeof(schedule->'days') = 'array'),
  constraint user_objectives_schedule_time_string check (not (schedule ? 'time') or jsonb_typeof(schedule->'time') = 'string')
);

create index user_objectives_user_id_idx on public.user_objectives(user_id);
create index user_objectives_objective_code_idx on public.user_objectives(objective_code);

alter table public.user_objectives
  drop constraint if exists user_objectives_frequency_check;

alter table public.user_objectives
  add constraint user_objectives_frequency_check
  check (frequency_per_week is null or (frequency_per_week between 1 and 7));

create table public.user_objective_entries (
  id uuid primary key default gen_random_uuid(),
  user_objective_id uuid not null references public.user_objectives(id) on delete cascade,
  day date not null,
  status public.checkin_status not null,
  source text not null check (source in ('whatsapp_optin', 'manual')),
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_objective_id, day)
);

create index user_objective_entries_user_objective_id_idx on public.user_objective_entries(user_objective_id);

create table public.user_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  direction public.message_direction not null,
  channel public.message_channel not null default 'whatsapp',
  body text,
  template_key text,
  payload jsonb,
  related_user_objective_id uuid references public.user_objectives(id),
  external_id text,
  is_proactive boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index user_messages_user_id_idx on public.user_messages(user_id);
create index user_messages_template_key_idx on public.user_messages(template_key);
create index user_messages_related_objective_idx on public.user_messages(related_user_objective_id);

create unique index user_messages_one_proactive_per_day
  on public.user_messages (user_id, cast(timezone('Europe/Paris', created_at) as date))
  where is_proactive and direction = 'outbound';

create table public.optin_templates (
  key text primary key,
  category text not null,
  language text not null,
  body_template text not null,
  buttons jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.bilan_weekly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  week_start_date date not null,
  responses jsonb not null check (jsonb_typeof(responses) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, week_start_date)
);

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  user_objective_id uuid references public.user_objectives(id),
  badge public.badge_type not null,
  week_start_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index user_badges_user_id_idx on public.user_badges(user_id);

create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  agent public.agent_code not null,
  user_id uuid references public.user_profiles(id) on delete cascade,
  input jsonb not null,
  output jsonb,
  trace_id text,
  status text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index ai_logs_agent_idx on public.ai_logs(agent);
create index ai_logs_user_id_idx on public.ai_logs(user_id);

create table public.context_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  subject text not null,
  sentiment text,
  detected_at timestamptz not null default timezone('utc', now()),
  ttl interval,
  processed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index context_signals_user_id_idx on public.context_signals(user_id);
create index context_signals_processed_idx on public.context_signals(processed);

-- Timestamp triggers ----------------------------------------------------------

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.touch_updated_at();

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.touch_updated_at();

create trigger objectives_catalogue_set_updated_at
before update on public.objectives_catalogue
for each row execute function public.touch_updated_at();

create trigger quotes_catalogue_set_updated_at
before update on public.quotes_catalogue
for each row execute function public.touch_updated_at();

create trigger user_objectives_set_updated_at
before update on public.user_objectives
for each row execute function public.touch_updated_at();

create trigger user_objective_entries_set_updated_at
before update on public.user_objective_entries
for each row execute function public.touch_updated_at();

create trigger user_messages_set_updated_at
before update on public.user_messages
for each row execute function public.touch_updated_at();

create trigger optin_templates_set_updated_at
before update on public.optin_templates
for each row execute function public.touch_updated_at();

create trigger bilan_weekly_set_updated_at
before update on public.bilan_weekly
for each row execute function public.touch_updated_at();

create trigger user_badges_set_updated_at
before update on public.user_badges
for each row execute function public.touch_updated_at();

create trigger ai_logs_set_updated_at
before update on public.ai_logs
for each row execute function public.touch_updated_at();

create trigger context_signals_set_updated_at
before update on public.context_signals
for each row execute function public.touch_updated_at();

-- Auth triggers ---------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  locale text;
  timezone text;
begin
  locale := coalesce(nullif(new.raw_user_meta_data->>'locale', ''), 'fr-FR');
  timezone := coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'Europe/Paris');

  insert into public.user_profiles (id, first_name, locale, timezone, phone_e164, whatsapp_opt_in, onboarding_status)
  values (new.id, null, locale, timezone, null, false, 'pending')
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.handle_delete_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_settings where user_id = old.id;
  delete from public.user_profiles where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;

create trigger on_auth_user_deleted
after delete on auth.users
for each row execute function public.handle_delete_auth_user();

-- Row Level Security ----------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.objectives_catalogue enable row level security;
alter table public.quotes_catalogue enable row level security;
alter table public.user_objectives enable row level security;
alter table public.user_objective_entries enable row level security;
alter table public.user_messages enable row level security;
alter table public.optin_templates enable row level security;
alter table public.bilan_weekly enable row level security;
alter table public.user_badges enable row level security;
alter table public.ai_logs enable row level security;
alter table public.context_signals enable row level security;

-- user_profiles policies
create policy user_profiles_select_own
  on public.user_profiles for select
  using (auth.uid() = id);

create policy user_profiles_update_own
  on public.user_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy user_profiles_service_role_all
  on public.user_profiles for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- user_settings policies
create policy user_settings_select_own
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy user_settings_update_own
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_settings_service_role_all
  on public.user_settings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- objectives_catalogue policies
create policy objectives_catalogue_read_authenticated
  on public.objectives_catalogue for select
  using (auth.role() in ('authenticated', 'service_role'));

create policy objectives_catalogue_manage_service_role
  on public.objectives_catalogue for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- quotes_catalogue policies
create policy quotes_catalogue_read_authenticated
  on public.quotes_catalogue for select
  using (auth.role() in ('authenticated', 'service_role'));

create policy quotes_catalogue_manage_service_role
  on public.quotes_catalogue for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- user_objectives policies
create policy user_objectives_select_own
  on public.user_objectives for select
  using (auth.uid() = user_id);

create policy user_objectives_modify_own
  on public.user_objectives for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_objectives_service_role_all
  on public.user_objectives for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- user_objective_entries policies
create policy user_objective_entries_select_own
  on public.user_objective_entries for select
  using (exists (
    select 1 from public.user_objectives uo
    where uo.id = user_objective_entries.user_objective_id
      and uo.user_id = auth.uid()
  ));

create policy user_objective_entries_modify_own
  on public.user_objective_entries for all
  using (exists (
    select 1 from public.user_objectives uo
    where uo.id = user_objective_entries.user_objective_id
      and uo.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.user_objectives uo
    where uo.id = user_objective_entries.user_objective_id
      and uo.user_id = auth.uid()
  ));

create policy user_objective_entries_service_role_all
  on public.user_objective_entries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- user_messages policies
create policy user_messages_select_own
  on public.user_messages for select
  using (auth.uid() = user_id);

create policy user_messages_service_role_all
  on public.user_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- optin_templates policies
create policy optin_templates_read_authenticated
  on public.optin_templates for select
  using (auth.role() in ('authenticated', 'service_role'));

create policy optin_templates_manage_service_role
  on public.optin_templates for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- bilan_weekly policies
create policy bilan_weekly_select_own
  on public.bilan_weekly for select
  using (auth.uid() = user_id);

create policy bilan_weekly_modify_own
  on public.bilan_weekly for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy bilan_weekly_service_role_all
  on public.bilan_weekly for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- user_badges policies
create policy user_badges_select_own
  on public.user_badges for select
  using (auth.uid() = user_id);

create policy user_badges_modify_own
  on public.user_badges for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_badges_service_role_all
  on public.user_badges for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ai_logs policies
create policy ai_logs_service_role_all
  on public.ai_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy ai_logs_read_own
  on public.ai_logs for select
  using (user_id = auth.uid());

-- context_signals policies
create policy context_signals_select_own
  on public.context_signals for select
  using (auth.uid() = user_id);

create policy context_signals_modify_own
  on public.context_signals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy context_signals_service_role_all
  on public.context_signals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- RPCs ------------------------------------------------------------------------

create or replace function public.me_with_email()
returns table (
  id uuid,
  email text,
  first_name text,
  phone_e164 text
)
language sql
security definer
set search_path = auth, public
as $$
  select u.id, u.email, p.first_name, p.phone_e164
  from auth.users u
  join public.user_profiles p on p.id = u.id
  where u.id = auth.uid();
$$;

revoke all on function public.me_with_email() from public;
grant execute on function public.me_with_email() to authenticated;

create or replace function public.list_recipients_for_bilan(week_start date)
returns table (
  user_id uuid,
  email text,
  first_name text
)
language sql
security definer
set search_path = auth, public
as $$
  select u.id, u.email, p.first_name
  from auth.users u
  join public.user_profiles p on p.id = u.id
  join public.bilan_weekly b on b.user_id = u.id and b.week_start_date = week_start
  where p.onboarding_status = 'completed';
$$;

revoke all on function public.list_recipients_for_bilan(date) from public, authenticated;
grant execute on function public.list_recipients_for_bilan(date) to service_role;

//Ajout 
-- has_proactive_today : vrai si un message outbound proactif a déjà été envoyé aujourd'hui (Europe/Paris)
create or replace function public.has_proactive_today(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_messages um
    where um.user_id = p_user_id
      and um.direction = 'outbound'
      and um.is_proactive = true
      and (timezone('Europe/Paris', um.created_at))::date = (timezone('Europe/Paris', now()))::date
  );
$$;

-- (optionnel) donne le droit d'exécuter à authenticated
grant execute on function public.has_proactive_today(uuid) to authenticated;