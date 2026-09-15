-- P1-6: Add ON DELETE CASCADE to defense card tables
alter table public.user_defense_cards
  drop constraint if exists user_defense_cards_user_id_fkey;
alter table public.user_defense_cards
  add constraint user_defense_cards_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete cascade;

alter table public.user_defense_wins
  drop constraint if exists user_defense_wins_defense_card_id_fkey;
alter table public.user_defense_wins
  add constraint user_defense_wins_defense_card_id_fkey
    foreign key (defense_card_id)
    references public.user_defense_cards (id)
    on delete cascade;

-- P1-SEC-1: Revoke direct RPC access to unlock_transformation_principle
revoke execute on function public.unlock_transformation_principle(uuid, uuid, text)
  from authenticated, anon;

-- P1-SEC-2: Prevent non-service-role modification of unlocked_principles
create or replace function public.guard_unlocked_principles_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if old.unlocked_principles is distinct from new.unlocked_principles then
    raise exception 'Direct modification of unlocked_principles is not allowed'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_unlocked_principles_update on public.user_transformations;
create trigger guard_unlocked_principles_update
before update on public.user_transformations
for each row
execute function public.guard_unlocked_principles_update();
