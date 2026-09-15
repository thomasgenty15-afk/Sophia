-- ============================================================================
-- DÉCOCHER UN REPAS — sans jamais laisser réécrire un fait
--
-- LE DÉFAUT MESURÉ, et il est silencieux
-- --------------------------------------
-- L'écran du plan gagne des cases à cocher: « j'ai mangé le dîner prévu ». Une
-- coche écrit un FAIT (`protocol_events`, `source='quick_tap'`, poids 0.4), et
-- décocher pose `disqualified_reason='food_not_eaten'` — la table est
-- append-only, on marque, on ne supprime pas.
--
-- Sauf que `protocol_events` n'a AUCUNE policy UPDATE. L'élève a `insert` et
-- `select`, plus un `delete` étroit sur ses quick_taps. PostgREST rend donc 204
-- sur un UPDATE qui ne touche zéro ligne: le décochage rapportait un SUCCÈS et
-- ne changeait rien. Mesuré:
--
--     decocher: ok — lignes restantes=1, motif=null
--
-- La case se serait décochée à l'écran pendant que le fait continuait de compter
-- dans la couverture du coach. Un mensonge sans erreur, sans log, sans trace.
--
-- POURQUOI UNE POLICY *ET* UN TRIGGER
-- -----------------------------------
-- Une policy RLS porte sur des LIGNES, pas sur des COLONNES: un `for update`
-- ouvert laisserait l'élève réécrire `food_group_ref`, `local_date`,
-- `evidence_weight` — c'est-à-dire fabriquer des faits au lieu d'en retirer un.
-- Sur la table qui nourrit l'évaluateur et la couverture, ce serait la porte
-- la plus large du produit.
--
-- Le trigger dit ce qu'une policy ne sait pas dire: sur ces lignes-là, la SEULE
-- chose qui bouge est `disqualified_reason`, et seulement entre NULL et
-- `food_not_eaten`.
--
-- LA PORTÉE EST ÉTROITE À DESSEIN: `source='quick_tap'` uniquement. Une photo,
-- une déclaration écrite, une entrée de coach ne se décochent pas — elles se
-- corrigent par la conversation, qui a déjà son chemin (`meal_precision_*`).
-- ============================================================================

drop policy if exists protocol_events_owner_untick on public.protocol_events;

create policy protocol_events_owner_untick
  on public.protocol_events
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and source = 'quick_tap'
  )
  with check (
    user_id = (select auth.uid())
    and source = 'quick_tap'
  );

comment on policy protocol_events_owner_untick on public.protocol_events is
  'L''élève coche et décoche ses propres repas. Le PÉRIMÈTRE de la modification '
  'est tenu par le trigger protocol_events_quick_tap_untick_only, pas ici: une '
  'policy porte sur des lignes, pas sur des colonnes.';

-- ----------------------------------------------------------------------------
-- LE TRIGGER — une seule colonne bouge, et seulement entre deux valeurs
-- ----------------------------------------------------------------------------

create or replace function public.protocol_events_quick_tap_untick_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Le service role et les lanes internes écrivent d'autres sources; ce trigger
  -- ne parle QUE des coches. `analyze-meal-photo-v1` doit continuer de poser
  -- `disqualified_reason` et `recognized` sur ses lignes photo.
  if old.source is distinct from 'quick_tap' then
    return new;
  end if;

  -- L'identité du fait ne se réécrit jamais.
  if new.user_id is distinct from old.user_id
     or new.source is distinct from old.source
     or new.local_date is distinct from old.local_date
     or new.occurred_at is distinct from old.occurred_at
     or new.slot_key is distinct from old.slot_key
     or new.source_message_id is distinct from old.source_message_id
     or new.food_group_ref is distinct from old.food_group_ref
     or new.substance_ref is distinct from old.substance_ref
     or new.quantity is distinct from old.quantity
     or new.unit is distinct from old.unit
     or new.evidence_weight is distinct from old.evidence_weight
  then
    raise exception
      'protocol_events: a quick_tap fact is ticked or unticked, never rewritten';
  end if;

  -- La seule bascule autorisée.
  if new.disqualified_reason is distinct from old.disqualified_reason
     and coalesce(new.disqualified_reason, 'food_not_eaten') <> 'food_not_eaten'
  then
    raise exception
      'protocol_events: a quick_tap may only toggle disqualified_reason between '
      'NULL and food_not_eaten (got %)', new.disqualified_reason;
  end if;

  return new;
end;
$$;

drop trigger if exists protocol_events_quick_tap_untick_only on public.protocol_events;

create trigger protocol_events_quick_tap_untick_only
  before update on public.protocol_events
  for each row
  execute function public.protocol_events_quick_tap_untick_only();

-- ----------------------------------------------------------------------------
-- CONTRÔLE FINAL — on rejoue les gestes, on n'inspecte pas du texte.
-- ----------------------------------------------------------------------------

do $$
declare
  probe_user uuid;
  probe_id uuid;
  blocked int := 0;
begin
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'meal_tick_untick: aucun utilisateur, contrôle sauté';
    return;
  end if;

  insert into public.protocol_events
    (user_id, occurred_at, local_date, source, content_locale, evidence_weight,
     source_message_id)
  values
    (probe_user, now(), current_date, 'quick_tap', 'en-GB', 0.4,
     'meal_tick:probe:0')
  returning id into probe_id;

  -- (a) décocher passe, et la ligne SURVIT.
  update public.protocol_events
     set disqualified_reason = 'food_not_eaten' where id = probe_id;
  if (select disqualified_reason from public.protocol_events where id = probe_id)
     is distinct from 'food_not_eaten' then
    raise exception 'meal_tick_untick: le décochage n''a pas pris';
  end if;

  -- (b) recocher passe.
  update public.protocol_events set disqualified_reason = null where id = probe_id;
  if (select disqualified_reason from public.protocol_events where id = probe_id)
     is not null then
    raise exception 'meal_tick_untick: le recochage n''a pas pris';
  end if;

  -- (c) réécrire le fait est refusé.
  begin
    update public.protocol_events set food_group_ref = 'poultry' where id = probe_id;
    raise exception 'meal_tick_untick: food_group_ref A PU être réécrit';
  exception when others then
    if sqlerrm like '%never rewritten%' then blocked := blocked + 1; else raise; end if;
  end;

  begin
    update public.protocol_events set local_date = current_date - 3 where id = probe_id;
    raise exception 'meal_tick_untick: local_date A PU être réécrite';
  exception when others then
    if sqlerrm like '%never rewritten%' then blocked := blocked + 1; else raise; end if;
  end;

  -- (d) un motif hors des deux valeurs est refusé.
  begin
    update public.protocol_events set disqualified_reason = 'not_food' where id = probe_id;
    raise exception 'meal_tick_untick: un motif arbitraire A PU être posé';
  exception when others then
    if sqlerrm like '%only toggle disqualified_reason%' then blocked := blocked + 1;
    else raise; end if;
  end;

  delete from public.protocol_events where id = probe_id;

  if blocked <> 3 then
    raise exception 'meal_tick_untick: % écritures interdites bloquées sur 3', blocked;
  end if;
  raise notice
    'meal_tick_untick: cocher/décocher/recocher OK, 3 réécritures bloquées';
end $$;
