alter table public.user_defense_cards
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.user_defense_cards
  drop constraint if exists user_defense_cards_transformation_id_key;

alter table public.user_attack_cards
  drop constraint if exists user_attack_cards_transformation_id_key;

drop index if exists defense_cards_user_transformation_idx;
drop index if exists attack_cards_user_transformation_idx;

create index if not exists defense_cards_user_scope_generated_idx
  on public.user_defense_cards (user_id, cycle_id, scope_kind, transformation_id, generated_at desc);

create index if not exists attack_cards_user_scope_status_generated_idx
  on public.user_attack_cards (user_id, cycle_id, scope_kind, transformation_id, status, generated_at desc);
