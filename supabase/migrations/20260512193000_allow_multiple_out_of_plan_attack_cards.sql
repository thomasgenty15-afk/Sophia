drop index if exists public.user_attack_cards_one_out_of_plan_per_cycle_idx;
drop index if exists public.user_defense_cards_one_out_of_plan_per_cycle_idx;

create index if not exists user_attack_cards_out_of_plan_user_cycle_generated_idx
  on public.user_attack_cards (user_id, cycle_id, generated_at desc)
  where scope_kind = 'out_of_plan';

create index if not exists user_defense_cards_out_of_plan_user_cycle_generated_idx
  on public.user_defense_cards (user_id, cycle_id, generated_at desc)
  where scope_kind = 'out_of_plan';
