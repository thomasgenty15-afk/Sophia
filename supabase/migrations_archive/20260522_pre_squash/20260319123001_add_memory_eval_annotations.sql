create table if not exists public.memory_eval_annotations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  scope text,
  window_from timestamptz not null,
  window_to timestamptz not null,

  target_type text not null check (target_type in ('window', 'turn')),
  target_key text not null,
  turn_id text,
  request_id text,

  dimension text not null check (
    dimension in (
      'overall',
      'identification',
      'persistence',
      'retrieval',
      'injection',
      'surface'
    )
  ),
  label text not null check (label in ('good', 'partial', 'miss', 'harmful')),
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists memory_eval_annotations_reviewer_target_dimension_idx
  on public.memory_eval_annotations (reviewer_user_id, target_key, dimension);

create index if not exists memory_eval_annotations_user_window_idx
  on public.memory_eval_annotations (user_id, window_from desc, window_to desc);

alter table public.memory_eval_annotations enable row level security;

drop policy if exists "memory_eval_annotations_internal_admin_all" on public.memory_eval_annotations;
create policy "memory_eval_annotations_internal_admin_all"
on public.memory_eval_annotations
for all
using (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()))
with check (exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()));

comment on table public.memory_eval_annotations is
  'Manual qualitative annotations for memory trace windows/turns and dimensions.';
