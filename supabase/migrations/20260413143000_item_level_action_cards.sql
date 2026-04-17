alter table public.user_plan_items
  add column if not exists defense_card_id uuid null references public.user_defense_cards(id) on delete set null,
  add column if not exists attack_card_id uuid null references public.user_attack_cards(id) on delete set null,
  add column if not exists cards_status text not null default 'not_required'
    check (cards_status in ('not_required', 'not_started', 'generating', 'ready', 'failed')),
  add column if not exists cards_generated_at timestamptz null;

update public.user_plan_items
set cards_status = case
  when dimension in ('missions', 'habits') and status = 'pending' then 'not_started'
  when dimension in ('missions', 'habits') and status <> 'pending' then 'ready'
  else 'not_required'
end
where cards_status is null
   or cards_status = 'not_required';

alter table public.user_defense_cards
  add column if not exists phase_id text null,
  add column if not exists plan_item_id uuid null references public.user_plan_items(id) on delete set null,
  add column if not exists source text not null default 'system'
    check (source in ('manual', 'prefill_plan', 'prefill_classification', 'system')),
  add column if not exists status text not null default 'active'
    check (status in ('draft', 'suggested', 'active', 'archived'));

alter table public.user_attack_cards
  add column if not exists plan_item_id uuid null references public.user_plan_items(id) on delete set null;

drop index if exists defense_cards_user_scope_generated_idx;
create index if not exists defense_cards_user_scope_generated_idx
  on public.user_defense_cards (user_id, cycle_id, scope_kind, transformation_id, phase_id, generated_at desc);

create index if not exists defense_cards_plan_item_idx
  on public.user_defense_cards (plan_item_id, generated_at desc)
  where plan_item_id is not null;

create index if not exists attack_cards_plan_item_idx
  on public.user_attack_cards (plan_item_id, generated_at desc)
  where plan_item_id is not null;

create index if not exists user_plan_items_cards_status_idx
  on public.user_plan_items (plan_id, cards_status, phase_order, activation_order nulls last);
