create table if not exists public.user_attack_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  phase_id text null,
  source text not null check (source in ('manual', 'prefill_plan', 'prefill_classification', 'system')),
  status text not null check (status in ('draft', 'suggested', 'active', 'archived')),
  content jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  unique (transformation_id)
);

alter table public.user_attack_cards enable row level security;

create policy "Users can read own attack cards"
  on public.user_attack_cards for select
  using (auth.uid() = user_id);

create index if not exists attack_cards_user_transformation_idx
  on public.user_attack_cards (user_id, transformation_id);

create table if not exists public.user_support_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  phase_id text null,
  source text not null check (source in ('manual', 'prefill_plan', 'prefill_classification', 'system')),
  status text not null check (status in ('draft', 'suggested', 'active', 'archived')),
  content jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  unique (transformation_id)
);

alter table public.user_support_cards enable row level security;

create policy "Users can read own support cards"
  on public.user_support_cards for select
  using (auth.uid() = user_id);

create index if not exists support_cards_user_transformation_idx
  on public.user_support_cards (user_id, transformation_id);

create table if not exists public.user_inspiration_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  phase_id text null,
  source text not null check (source in ('manual', 'prefill_plan', 'prefill_classification', 'system')),
  status text not null check (status in ('draft', 'suggested', 'active', 'archived')),
  inspiration_type text not null,
  angle text null,
  title text not null,
  body text not null,
  cta_label text null,
  cta_payload jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  effort_level text not null check (effort_level in ('light', 'medium', 'high')),
  context_window text not null check (context_window in ('anytime', 'morning', 'afternoon', 'evening', 'during_friction')),
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now()
);

alter table public.user_inspiration_items enable row level security;

create policy "Users can read own inspiration items"
  on public.user_inspiration_items for select
  using (auth.uid() = user_id);

create index if not exists inspiration_items_user_transformation_idx
  on public.user_inspiration_items (user_id, transformation_id, status, generated_at desc);
