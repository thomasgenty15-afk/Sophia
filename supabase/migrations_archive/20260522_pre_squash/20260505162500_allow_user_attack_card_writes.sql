drop policy if exists "Users can insert own attack cards" on public.user_attack_cards;
create policy "Users can insert own attack cards"
  on public.user_attack_cards
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own attack cards" on public.user_attack_cards;
create policy "Users can update own attack cards"
  on public.user_attack_cards
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
