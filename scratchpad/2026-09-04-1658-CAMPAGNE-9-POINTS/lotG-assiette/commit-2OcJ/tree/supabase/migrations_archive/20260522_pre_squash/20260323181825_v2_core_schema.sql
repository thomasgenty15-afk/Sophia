do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'cycle_status'
      and n.nspname = 'public'
  ) then
    create type public.cycle_status as enum (
      'draft',
      'clarification_needed',
      'structured',
      'prioritized',
      'questionnaire_in_progress',
      'signup_pending',
      'profile_pending',
      'ready_for_plan',
      'active',
      'completed',
      'abandoned'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'transformation_status'
      and n.nspname = 'public'
  ) then
    create type public.transformation_status as enum (
      'draft',
      'ready',
      'pending',
      'active',
      'completed',
      'cancelled',
      'archived'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'aspect_status'
      and n.nspname = 'public'
  ) then
    create type public.aspect_status as enum (
      'active',
      'deferred',
      'rejected'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'aspect_uncertainty'
      and n.nspname = 'public'
  ) then
    create type public.aspect_uncertainty as enum (
      'low',
      'medium',
      'high'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'deferred_reason'
      and n.nspname = 'public'
  ) then
    create type public.deferred_reason as enum (
      'not_priority_now',
      'later_cycle',
      'out_of_scope',
      'user_choice',
      'unclear'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'plan_status'
      and n.nspname = 'public'
  ) then
    create type public.plan_status as enum (
      'draft',
      'generated',
      'active',
      'paused',
      'completed',
      'archived'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'plan_dimension'
      and n.nspname = 'public'
  ) then
    create type public.plan_dimension as enum (
      'support',
      'missions',
      'habits'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'plan_item_kind'
      and n.nspname = 'public'
  ) then
    create type public.plan_item_kind as enum (
      'framework',
      'exercise',
      'task',
      'milestone',
      'habit'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'plan_item_status'
      and n.nspname = 'public'
  ) then
    create type public.plan_item_status as enum (
      'pending',
      'active',
      'in_maintenance',
      'completed',
      'deactivated',
      'cancelled',
      'stalled'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'support_mode'
      and n.nspname = 'public'
  ) then
    create type public.support_mode as enum (
      'always_available',
      'recommended_now',
      'unlockable'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'support_function'
      and n.nspname = 'public'
  ) then
    create type public.support_function as enum (
      'practice',
      'rescue',
      'understanding'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'habit_state'
      and n.nspname = 'public'
  ) then
    create type public.habit_state as enum (
      'active_building',
      'in_maintenance',
      'stalled'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'tracking_type'
      and n.nspname = 'public'
  ) then
    create type public.tracking_type as enum (
      'boolean',
      'count',
      'scale',
      'text',
      'milestone'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'metric_scope'
      and n.nspname = 'public'
  ) then
    create type public.metric_scope as enum (
      'cycle',
      'transformation'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'metric_kind'
      and n.nspname = 'public'
  ) then
    create type public.metric_kind as enum (
      'north_star',
      'progress_marker',
      'support_metric',
      'custom'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'metric_status'
      and n.nspname = 'public'
  ) then
    create type public.metric_status as enum (
      'active',
      'paused',
      'completed',
      'archived'
    );
  end if;
end
$$;

create table if not exists public.user_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.cycle_status not null default 'draft',
  raw_intake_text text not null,
  intake_language text null,
  duration_months smallint null,
  birth_date_snapshot date null,
  gender_snapshot text null,
  active_transformation_id uuid null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  archived_at timestamptz null,
  constraint user_cycles_duration_months_check
    check (duration_months is null or duration_months in (1, 2, 3)),
  constraint user_cycles_version_check
    check (version >= 1)
);

create table if not exists public.user_transformations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  priority_order integer not null,
  status public.transformation_status not null default 'draft',
  title text null,
  internal_summary text not null,
  user_summary text not null,
  success_definition text null,
  main_constraint text null,
  questionnaire_schema jsonb null,
  questionnaire_answers jsonb null,
  completion_summary text null,
  handoff_payload jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz null,
  completed_at timestamptz null,
  constraint user_transformations_priority_order_check
    check (priority_order between 1 and 3),
  constraint user_transformations_cycle_priority_key
    unique (cycle_id, priority_order),
  constraint user_transformations_cycle_id_id_key
    unique (cycle_id, id)
);

alter table public.user_cycles
  add constraint user_cycles_active_transformation_fk
  foreign key (id, active_transformation_id)
  references public.user_transformations(cycle_id, id);

create table if not exists public.user_transformation_aspects (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid null references public.user_transformations(id) on delete set null,
  label text not null,
  raw_excerpt text null,
  status public.aspect_status not null default 'active',
  uncertainty_level public.aspect_uncertainty not null,
  deferred_reason public.deferred_reason null,
  source_rank integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_transformation_aspects_source_rank_check
    check (source_rank is null or source_rank >= 1),
  constraint user_transformation_aspects_deferred_reason_check
    check (
      status = 'deferred'
      or deferred_reason is null
    )
);

create table if not exists public.user_plans_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null,
  transformation_id uuid not null,
  status public.plan_status not null default 'draft',
  version integer not null default 1,
  title text null,
  content jsonb not null default '{}'::jsonb,
  generation_attempts integer not null default 0,
  last_generation_reason text null,
  activated_at timestamptz null,
  completed_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_plans_v2_cycle_fk
    foreign key (cycle_id)
    references public.user_cycles(id)
    on delete cascade,
  constraint user_plans_v2_cycle_transformation_fk
    foreign key (cycle_id, transformation_id)
    references public.user_transformations(cycle_id, id)
    on delete cascade,
  constraint user_plans_v2_version_check
    check (version >= 1),
  constraint user_plans_v2_generation_attempts_check
    check (generation_attempts between 0 and 2),
  constraint user_plans_v2_transformation_version_key
    unique (transformation_id, version),
  constraint user_plans_v2_id_cycle_transformation_key
    unique (id, cycle_id, transformation_id)
);

create table if not exists public.user_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null,
  dimension public.plan_dimension not null,
  kind public.plan_item_kind not null,
  status public.plan_item_status not null default 'pending',
  title text not null,
  description text null,
  tracking_type public.tracking_type not null,
  activation_order integer null,
  activation_condition jsonb null,
  current_habit_state public.habit_state null,
  support_mode public.support_mode null,
  support_function public.support_function null,
  target_reps integer null,
  current_reps integer null,
  cadence_label text null,
  scheduled_days text[] null,
  time_of_day text null,
  start_after_item_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz null,
  completed_at timestamptz null,
  constraint user_plan_items_plan_fk
    foreign key (plan_id, cycle_id, transformation_id)
    references public.user_plans_v2(id, cycle_id, transformation_id)
    on delete cascade,
  constraint user_plan_items_activation_order_check
    check (activation_order is null or activation_order >= 1),
  constraint user_plan_items_target_reps_check
    check (target_reps is null or target_reps >= 0),
  constraint user_plan_items_current_reps_check
    check (current_reps is null or current_reps >= 0),
  constraint user_plan_items_current_habit_state_check
    check (
      dimension = 'habits'
      or current_habit_state is null
    ),
  constraint user_plan_items_support_fields_check
    check (
      dimension = 'support'
      or (
        support_mode is null
        and support_function is null
      )
    ),
  constraint user_plan_items_scheduled_days_check
    check (
      scheduled_days is null
      or (
        cardinality(scheduled_days) between 1 and 7
        and scheduled_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]
      )
    ),
  constraint user_plan_items_id_plan_cycle_transformation_key
    unique (id, plan_id, cycle_id, transformation_id),
  constraint user_plan_items_plan_id_id_key
    unique (plan_id, id)
);

alter table public.user_plan_items
  add constraint user_plan_items_start_after_item_fk
  foreign key (start_after_item_id)
  references public.user_plan_items(id)
  on delete set null;

create table if not exists public.user_plan_item_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null,
  plan_item_id uuid not null,
  entry_kind text not null,
  outcome text not null,
  value_numeric numeric null,
  value_text text null,
  difficulty_level text null,
  blocker_hint text null,
  created_at timestamptz not null default now(),
  effective_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint user_plan_item_entries_plan_item_fk
    foreign key (plan_item_id, plan_id, cycle_id, transformation_id)
    references public.user_plan_items(id, plan_id, cycle_id, transformation_id)
    on delete cascade,
  constraint user_plan_item_entries_entry_kind_check
    check (
      entry_kind in (
        'checkin',
        'progress',
        'skip',
        'partial',
        'blocker',
        'support_feedback'
      )
    ),
  constraint user_plan_item_entries_difficulty_level_check
    check (
      difficulty_level is null
      or difficulty_level in ('low', 'medium', 'high')
    )
);

create table if not exists public.user_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid null,
  scope public.metric_scope not null,
  kind public.metric_kind not null,
  status public.metric_status not null default 'active',
  title text not null,
  unit text null,
  current_value text null,
  target_value text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_metrics_cycle_transformation_fk
    foreign key (cycle_id, transformation_id)
    references public.user_transformations(cycle_id, id)
    on delete cascade,
  constraint user_metrics_scope_transformation_check
    check (
      (
        scope = 'cycle'
        and transformation_id is null
      )
      or (
        scope = 'transformation'
        and transformation_id is not null
      )
    )
);

create table if not exists public.user_victory_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid null references public.user_transformations(id) on delete set null,
  plan_item_id uuid null references public.user_plan_items(id) on delete set null,
  title text not null,
  summary text not null,
  confidence text not null,
  source_kind text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint user_victory_ledger_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  constraint user_victory_ledger_source_kind_check
    check (source_kind in ('daily', 'weekly', 'chat', 'system'))
);

create table if not exists public.system_runtime_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid null references public.user_cycles(id) on delete set null,
  transformation_id uuid null references public.user_transformations(id) on delete set null,
  snapshot_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint system_runtime_snapshots_snapshot_type_check
    check (
      snapshot_type in (
        'conversation_pulse',
        'momentum_state_v2',
        'active_load',
        'repair_mode',
        'weekly_digest'
      )
    )
);

create unique index if not exists user_cycles_one_active_per_user_idx
  on public.user_cycles (user_id)
  where status = 'active';

create index if not exists user_cycles_user_status_idx
  on public.user_cycles (user_id, status, updated_at desc);

create index if not exists user_cycles_active_transformation_idx
  on public.user_cycles (active_transformation_id)
  where active_transformation_id is not null;

create unique index if not exists user_transformations_one_active_per_cycle_idx
  on public.user_transformations (cycle_id)
  where status = 'active';

create index if not exists user_transformations_cycle_status_idx
  on public.user_transformations (cycle_id, status, priority_order);

create index if not exists user_transformation_aspects_cycle_idx
  on public.user_transformation_aspects (cycle_id, status, created_at desc);

create index if not exists user_transformation_aspects_transformation_idx
  on public.user_transformation_aspects (transformation_id, status, created_at desc)
  where transformation_id is not null;

create unique index if not exists user_plans_v2_one_active_per_transformation_idx
  on public.user_plans_v2 (transformation_id)
  where status = 'active';

create index if not exists user_plans_v2_user_status_idx
  on public.user_plans_v2 (user_id, status, updated_at desc);

create index if not exists user_plans_v2_cycle_status_idx
  on public.user_plans_v2 (cycle_id, status, updated_at desc);

create index if not exists user_plans_v2_transformation_status_idx
  on public.user_plans_v2 (transformation_id, status, updated_at desc);

create index if not exists user_plan_items_plan_status_idx
  on public.user_plan_items (plan_id, status, activation_order nulls last);

create index if not exists user_plan_items_cycle_status_idx
  on public.user_plan_items (cycle_id, status, updated_at desc);

create index if not exists user_plan_items_transformation_status_idx
  on public.user_plan_items (transformation_id, status, updated_at desc);

create index if not exists user_plan_items_dimension_status_idx
  on public.user_plan_items (dimension, status, activation_order nulls last);

create index if not exists user_plan_items_start_after_idx
  on public.user_plan_items (start_after_item_id)
  where start_after_item_id is not null;

create index if not exists user_plan_item_entries_plan_item_effective_idx
  on public.user_plan_item_entries (plan_item_id, effective_at desc, created_at desc);

create index if not exists user_plan_item_entries_plan_idx
  on public.user_plan_item_entries (plan_id, effective_at desc, created_at desc);

create index if not exists user_plan_item_entries_cycle_idx
  on public.user_plan_item_entries (cycle_id, effective_at desc, created_at desc);

create index if not exists user_plan_item_entries_transformation_idx
  on public.user_plan_item_entries (transformation_id, effective_at desc, created_at desc);

create unique index if not exists user_metrics_one_active_north_star_per_cycle_idx
  on public.user_metrics (cycle_id)
  where scope = 'cycle'
    and kind = 'north_star'
    and status = 'active';

create index if not exists user_metrics_cycle_status_idx
  on public.user_metrics (cycle_id, status, updated_at desc);

create index if not exists user_metrics_transformation_status_idx
  on public.user_metrics (transformation_id, status, updated_at desc)
  where transformation_id is not null;

create index if not exists user_metrics_scope_kind_idx
  on public.user_metrics (scope, kind, status);

create index if not exists user_victory_ledger_cycle_created_idx
  on public.user_victory_ledger (cycle_id, created_at desc);

create index if not exists user_victory_ledger_transformation_created_idx
  on public.user_victory_ledger (transformation_id, created_at desc)
  where transformation_id is not null;

create index if not exists user_victory_ledger_plan_item_created_idx
  on public.user_victory_ledger (plan_item_id, created_at desc)
  where plan_item_id is not null;

create index if not exists system_runtime_snapshots_user_type_created_idx
  on public.system_runtime_snapshots (user_id, snapshot_type, created_at desc);

create index if not exists system_runtime_snapshots_cycle_type_created_idx
  on public.system_runtime_snapshots (cycle_id, snapshot_type, created_at desc)
  where cycle_id is not null;

create index if not exists system_runtime_snapshots_transformation_type_created_idx
  on public.system_runtime_snapshots (transformation_id, snapshot_type, created_at desc)
  where transformation_id is not null;

drop trigger if exists update_user_cycles_modtime on public.user_cycles;
create trigger update_user_cycles_modtime
before update on public.user_cycles
for each row
execute function public.update_modified_column();

drop trigger if exists update_user_transformations_modtime on public.user_transformations;
create trigger update_user_transformations_modtime
before update on public.user_transformations
for each row
execute function public.update_modified_column();

drop trigger if exists update_user_transformation_aspects_modtime on public.user_transformation_aspects;
create trigger update_user_transformation_aspects_modtime
before update on public.user_transformation_aspects
for each row
execute function public.update_modified_column();

drop trigger if exists update_user_plans_v2_modtime on public.user_plans_v2;
create trigger update_user_plans_v2_modtime
before update on public.user_plans_v2
for each row
execute function public.update_modified_column();

drop trigger if exists update_user_plan_items_modtime on public.user_plan_items;
create trigger update_user_plan_items_modtime
before update on public.user_plan_items
for each row
execute function public.update_modified_column();

drop trigger if exists update_user_metrics_modtime on public.user_metrics;
create trigger update_user_metrics_modtime
before update on public.user_metrics
for each row
execute function public.update_modified_column();

alter table public.user_cycles enable row level security;
alter table public.user_transformations enable row level security;
alter table public.user_transformation_aspects enable row level security;
alter table public.user_plans_v2 enable row level security;
alter table public.user_plan_items enable row level security;
alter table public.user_plan_item_entries enable row level security;
alter table public.user_metrics enable row level security;
alter table public.user_victory_ledger enable row level security;
alter table public.system_runtime_snapshots enable row level security;

drop policy if exists rls_user_cycles_select_own on public.user_cycles;
create policy rls_user_cycles_select_own
  on public.user_cycles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_cycles_insert_own on public.user_cycles;
create policy rls_user_cycles_insert_own
  on public.user_cycles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_cycles_update_own on public.user_cycles;
create policy rls_user_cycles_update_own
  on public.user_cycles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_cycles_delete_own on public.user_cycles;
create policy rls_user_cycles_delete_own
  on public.user_cycles
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_transformations_select_own on public.user_transformations;
create policy rls_user_transformations_select_own
  on public.user_transformations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_transformations_insert_own on public.user_transformations;
create policy rls_user_transformations_insert_own
  on public.user_transformations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_transformations_update_own on public.user_transformations;
create policy rls_user_transformations_update_own
  on public.user_transformations
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_transformations_delete_own on public.user_transformations;
create policy rls_user_transformations_delete_own
  on public.user_transformations
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_transformation_aspects_select_own on public.user_transformation_aspects;
create policy rls_user_transformation_aspects_select_own
  on public.user_transformation_aspects
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_transformation_aspects_insert_own on public.user_transformation_aspects;
create policy rls_user_transformation_aspects_insert_own
  on public.user_transformation_aspects
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_transformation_aspects_update_own on public.user_transformation_aspects;
create policy rls_user_transformation_aspects_update_own
  on public.user_transformation_aspects
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_transformation_aspects_delete_own on public.user_transformation_aspects;
create policy rls_user_transformation_aspects_delete_own
  on public.user_transformation_aspects
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_cycles c
      where c.id = cycle_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists rls_user_plans_v2_select_own on public.user_plans_v2;
create policy rls_user_plans_v2_select_own
  on public.user_plans_v2
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_plans_v2_insert_own on public.user_plans_v2;
create policy rls_user_plans_v2_insert_own
  on public.user_plans_v2
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_plans_v2_update_own on public.user_plans_v2;
create policy rls_user_plans_v2_update_own
  on public.user_plans_v2
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_plans_v2_delete_own on public.user_plans_v2;
create policy rls_user_plans_v2_delete_own
  on public.user_plans_v2
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_plan_items_select_own on public.user_plan_items;
create policy rls_user_plan_items_select_own
  on public.user_plan_items
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_plan_items_insert_own on public.user_plan_items;
create policy rls_user_plan_items_insert_own
  on public.user_plan_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_plan_items_update_own on public.user_plan_items;
create policy rls_user_plan_items_update_own
  on public.user_plan_items
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_plan_items_delete_own on public.user_plan_items;
create policy rls_user_plan_items_delete_own
  on public.user_plan_items
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_plan_item_entries_select_own on public.user_plan_item_entries;
create policy rls_user_plan_item_entries_select_own
  on public.user_plan_item_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_plan_item_entries_insert_own on public.user_plan_item_entries;
create policy rls_user_plan_item_entries_insert_own
  on public.user_plan_item_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_plan_item_entries_update_own on public.user_plan_item_entries;
create policy rls_user_plan_item_entries_update_own
  on public.user_plan_item_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_plan_item_entries_delete_own on public.user_plan_item_entries;
create policy rls_user_plan_item_entries_delete_own
  on public.user_plan_item_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_metrics_select_own on public.user_metrics;
create policy rls_user_metrics_select_own
  on public.user_metrics
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_metrics_insert_own on public.user_metrics;
create policy rls_user_metrics_insert_own
  on public.user_metrics
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_metrics_update_own on public.user_metrics;
create policy rls_user_metrics_update_own
  on public.user_metrics
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_metrics_delete_own on public.user_metrics;
create policy rls_user_metrics_delete_own
  on public.user_metrics
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_victory_ledger_select_own on public.user_victory_ledger;
create policy rls_user_victory_ledger_select_own
  on public.user_victory_ledger
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_victory_ledger_insert_own on public.user_victory_ledger;
create policy rls_user_victory_ledger_insert_own
  on public.user_victory_ledger
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_victory_ledger_update_own on public.user_victory_ledger;
create policy rls_user_victory_ledger_update_own
  on public.user_victory_ledger
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_victory_ledger_delete_own on public.user_victory_ledger;
create policy rls_user_victory_ledger_delete_own
  on public.user_victory_ledger
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_system_runtime_snapshots_select_own on public.system_runtime_snapshots;
create policy rls_system_runtime_snapshots_select_own
  on public.system_runtime_snapshots
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_system_runtime_snapshots_insert_own on public.system_runtime_snapshots;
create policy rls_system_runtime_snapshots_insert_own
  on public.system_runtime_snapshots
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_system_runtime_snapshots_update_own on public.system_runtime_snapshots;
create policy rls_system_runtime_snapshots_update_own
  on public.system_runtime_snapshots
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_system_runtime_snapshots_delete_own on public.system_runtime_snapshots;
create policy rls_system_runtime_snapshots_delete_own
  on public.system_runtime_snapshots
  for delete
  to authenticated
  using (auth.uid() = user_id);
