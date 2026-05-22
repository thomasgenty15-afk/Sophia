create table if not exists public.user_potion_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  phase_id text null,
  potion_type text not null check (
    potion_type in ('rappel', 'courage', 'guerison', 'clarte', 'amour', 'apaisement')
  ),
  source text not null check (source in ('manual', 'prefill_plan', 'prefill_classification', 'system')),
  status text not null check (status in ('completed', 'archived')),
  questionnaire_schema jsonb not null default '[]'::jsonb,
  questionnaire_answers jsonb not null default '{}'::jsonb,
  free_text text null,
  content jsonb not null default '{}'::jsonb,
  follow_up_strategy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now()
);

alter table public.user_potion_sessions enable row level security;

create policy "Users can read own potion sessions"
  on public.user_potion_sessions for select
  using (auth.uid() = user_id);

create index if not exists potion_sessions_user_transformation_idx
  on public.user_potion_sessions (user_id, transformation_id, generated_at desc);

create index if not exists potion_sessions_user_transformation_type_idx
  on public.user_potion_sessions (user_id, transformation_id, potion_type, generated_at desc);
