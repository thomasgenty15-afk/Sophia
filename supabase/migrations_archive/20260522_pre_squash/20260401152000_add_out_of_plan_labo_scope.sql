alter table public.user_defense_cards
  add column if not exists cycle_id uuid
  references public.user_cycles(id)
  on delete cascade;

update public.user_defense_cards card
set cycle_id = t.cycle_id
from public.user_transformations t
where card.transformation_id = t.id
  and card.cycle_id is null;

alter table public.user_defense_cards
  alter column cycle_id set not null;

alter table public.user_defense_cards
  add column if not exists scope_kind text not null default 'transformation'
  check (scope_kind in ('transformation', 'out_of_plan'));

alter table public.user_defense_cards
  alter column transformation_id drop not null;

drop index if exists defense_cards_user_transformation_idx;

create index if not exists defense_cards_user_scope_idx
  on public.user_defense_cards (user_id, cycle_id, scope_kind, transformation_id);

create unique index if not exists user_defense_cards_one_out_of_plan_per_cycle_idx
  on public.user_defense_cards (user_id, cycle_id)
  where scope_kind = 'out_of_plan';

alter table public.user_attack_cards
  add column if not exists scope_kind text not null default 'transformation'
  check (scope_kind in ('transformation', 'out_of_plan'));

alter table public.user_attack_cards
  alter column transformation_id drop not null;

create index if not exists attack_cards_user_scope_idx
  on public.user_attack_cards (user_id, cycle_id, scope_kind, transformation_id);

create unique index if not exists user_attack_cards_one_out_of_plan_per_cycle_idx
  on public.user_attack_cards (user_id, cycle_id)
  where scope_kind = 'out_of_plan';

alter table public.user_support_cards
  add column if not exists scope_kind text not null default 'transformation'
  check (scope_kind in ('transformation', 'out_of_plan'));

alter table public.user_support_cards
  alter column transformation_id drop not null;

create index if not exists support_cards_user_scope_idx
  on public.user_support_cards (user_id, cycle_id, scope_kind, transformation_id);

create unique index if not exists user_support_cards_one_out_of_plan_per_cycle_idx
  on public.user_support_cards (user_id, cycle_id)
  where scope_kind = 'out_of_plan';

alter table public.user_inspiration_items
  add column if not exists scope_kind text not null default 'transformation'
  check (scope_kind in ('transformation', 'out_of_plan'));

alter table public.user_inspiration_items
  alter column transformation_id drop not null;

create index if not exists inspiration_items_user_scope_idx
  on public.user_inspiration_items (user_id, cycle_id, scope_kind, status, generated_at desc);
