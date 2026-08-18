-- ============================================================================
-- LA DÉCOCHE DIT POURQUOI — FF-057 §3.A, et seulement §3.A
--
-- LE TROU MESURÉ
-- --------------
-- Décocher un repas prévu écrivait UN SEUL motif, `food_not_eaten`
-- (`_shared/keel/meal_tick.ts:94`). Le produit ne savait donc pas distinguer
-- « j'ai commandé », « je n'ai pas eu le temps » et « j'ai mangé autre chose »:
-- trois situations qui appellent trois suites différentes, écrasées sur une
-- seule valeur. Le formulaire de FF-057 pose déjà la question dans la
-- conversation (`_shared/chat/accident_tap.ts`) — et jetait la réponse: ses
-- trois boutons décochaient tous avec le même `food_not_eaten`.
--
-- Cette migration ouvre le vocabulaire aux trois motifs de la fiche. RIEN
-- D'AUTRE ne change: ni ce que la décoche vaut pour un lecteur (toute valeur
-- non NULLE reste « ce fait ne compte pas »), ni qui a le droit d'écrire, ni la
-- portée du trigger.
--
-- ⛔ CE QUE CETTE MIGRATION NE LIVRE PAS, ET IL FAUT LE LIRE AVANT DE CROIRE
--    FF-057 CLOSE
-- ---------------------------------------------------------------------------
--   · le fait `off_plan` de FF-009 depuis l'ÉCRAN. La conversation l'écrit déjà
--     (`writeOffPlanTapFact`); l'écran, non. Une décoche motivée `ordered` ou
--     `ate_other` posée depuis `/app/today` ou `/app/plan` n'écrit à ce jour
--     QUE son motif. Arbitrage du 2026-08-18 (option a du plan L1): le motif
--     seul ferme déjà le trou du suivi, le fait hors plan attend son lot.
--   · la partie B (le réalignement du plan) et la partie C (les courses et le
--     décalage temporel) DEPUIS L'ÉCRAN. Elles existent côté conversation.
--   · la question « la session de cuisine a-t-elle eu lieu ? » depuis l'écran.
--
-- LE VERROU EST UN TRIGGER, PAS UNE CONTRAINTE DE COLONNE
-- ------------------------------------------------------
-- Et les deux comptent, pour deux raisons différentes:
--
--   · la CHECK dit quelles valeurs la COLONNE accepte, toutes sources
--     confondues — elle porte aussi `not_food` et `unreadable`, qui sont des
--     verdicts de PHOTO (`meal_analysis.ts`) et n'ont aucun sens sur une coche;
--   · le TRIGGER dit ce qu'une ligne `source='quick_tap'` a le droit de
--     devenir. C'est lui qui interdit à un élève de réécrire l'identité d'un
--     fait (`food_group_ref`, `local_date`, `evidence_weight`…) à travers la
--     policy UPDATE que la décoche a ouverte. Cette partie-là ne bouge pas
--     d'un caractère.
--
-- Élargir l'une sans l'autre ne donne rien: la CHECK seule laisserait le
-- trigger refuser, le trigger seul laisserait la CHECK refuser.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LA COLONNE — trois valeurs de plus, aucune retirée
--
-- ⚠️ `food_not_eaten` RESTE, ET CE N'EST PAS DE LA COMPATIBILITÉ POLIE. C'est
-- la DÉCOCHE NUE: celle qui est écrite AVANT que le formulaire s'ouvre, et qui
-- reste seule quand la personne l'ignore. La fiche l'exige (§7: « la décoche
-- reste écrite — elle précède le formulaire »), et c'est ce qui rend le
-- formulaire gratuit à ignorer. C'est aussi le verdict de photo « de la
-- nourriture, mais pas une assiette servie », qu'`analyze-meal-photo-v1` écrit
-- sur ses propres lignes.
-- ----------------------------------------------------------------------------

alter table public.protocol_events
  drop constraint if exists protocol_events_disqualified_reason_check;

alter table public.protocol_events
  add constraint protocol_events_disqualified_reason_check
  check (
    disqualified_reason is null
    or disqualified_reason in (
      -- Verdicts de PHOTO (20260804160000).
      'not_food',
      'unreadable',
      -- La décoche nue, et les trois motifs du formulaire accident.
      'food_not_eaten',
      'ordered',
      'no_time',
      'ate_other'
    )
  );

comment on column public.protocol_events.disqualified_reason is
  'NULL = ce fait compte. Sinon: pourquoi il ne compte pas. Deux familles, et '
  'elles ne se mélangent pas. PHOTO (analyze-meal-photo-v1): not_food | '
  'unreadable | food_not_eaten. COCHE RETIRÉE (FF-057 §3.A, source=quick_tap): '
  'food_not_eaten (la décoche NUE, celle qui précède le formulaire) | ordered '
  '(commandé ou mangé dehors) | no_time (pas eu le temps) | ate_other (mangé '
  'autre chose, AUCUN aliment inventé). La liste vit dans '
  '_shared/keel/meal_tick.ts (MEAL_UNTICK_REASONS) et le front la mire dans '
  'frontend/src/keel/api/mealTicks.ts; un test relit les trois. La ligne est '
  'CONSERVÉE — on marque, on ne supprime pas. Tout lecteur qui COMPTE des repas '
  'filtre sur NULL, donc les trois motifs neufs sont exclus du comptage sans '
  'qu''aucun lecteur change; les lecteurs de SAFETY (restriction_runtime) ne '
  'filtrent PAS.';

-- ----------------------------------------------------------------------------
-- 2. LE TRIGGER — une seule colonne bouge, et seulement entre QUATRE valeurs
--
-- ⚠️ LA PARTIE « L'IDENTITÉ NE SE RÉÉCRIT JAMAIS » EST REPRISE MOT POUR MOT.
-- C'est elle qui empêche de fabriquer des faits à travers la policy UPDATE, et
-- c'est la porte la plus large du produit si on la desserre: la table nourrit
-- l'évaluateur et la couverture que le coach lit.
-- ----------------------------------------------------------------------------

create or replace function public.protocol_events_quick_tap_untick_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- ⚠️ LA MÊME LISTE QUE `MEAL_UNTICK_REASONS`, ET C'EST LE SEUL ENDROIT OÙ
  -- ELLE EST ÉCRITE EN SQL. Le TypeScript la porte pour le front et pour les
  -- lanes edge; `frontend/src/keel/api/mealTicks.int.test.ts` relit CE FICHIER
  -- et fait rougir si les trois copies divergent.
  allowed constant text[] := array[
    'food_not_eaten', 'ordered', 'no_time', 'ate_other'
  ];
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

  -- La seule bascule autorisée: NULL (coché) ou l'un des quatre motifs.
  --
  -- ⚠️ `not_food` ET `unreadable` SONT REFUSÉS ICI ALORS QUE LA CHECK LES
  -- ACCEPTE, et c'est voulu: ce sont des verdicts portés sur une IMAGE, ils
  -- n'ont pas de sens sur une case cochée à la main, et les laisser passer
  -- ferait d'une coche retirée un « la photo était illisible ».
  if new.disqualified_reason is distinct from old.disqualified_reason
     and new.disqualified_reason is not null
     and not (new.disqualified_reason = any (allowed))
  then
    raise exception
      'protocol_events: a quick_tap may only toggle disqualified_reason between '
      'NULL and one of (%) (got %)',
      array_to_string(allowed, ', '), new.disqualified_reason;
  end if;

  return new;
end;
$$;

-- Le trigger lui-même n'a pas bougé; on le repose pour que la migration soit
-- vraie même sur une base où il aurait été retiré à la main.
drop trigger if exists protocol_events_quick_tap_untick_only on public.protocol_events;

create trigger protocol_events_quick_tap_untick_only
  before update on public.protocol_events
  for each row
  execute function public.protocol_events_quick_tap_untick_only();

-- ----------------------------------------------------------------------------
-- CONTRÔLE FINAL — on rejoue les gestes, on n'inspecte pas du texte.
--
-- Trois épreuves, et la troisième est celle qui compte le plus:
--   (a) les QUATRE motifs passent, et la ligne survit à chaque aller-retour;
--   (b) une décoche ne réécrit AUCUN autre champ — prouvé sur la LIGNE ENTIÈRE
--       (`to_jsonb`), pas colonne par colonne: une colonne ajoutée demain
--       entrerait dans l'épreuve toute seule;
--   (c) ce qui n'est pas dans la liste est REFUSÉ — y compris un verdict de
--       photo que la CHECK, elle, accepterait. Un test qui ne prouve pas le
--       refus ne prouve rien.
-- ----------------------------------------------------------------------------

do $$
declare
  probe_user uuid;
  probe_id uuid;
  motif text;
  before_row jsonb;
  after_row jsonb;
  drifted text;
  accepted int := 0;
  blocked int := 0;
begin
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'untick_says_why: aucun utilisateur, contrôle sauté';
    return;
  end if;

  insert into public.protocol_events
    (user_id, occurred_at, local_date, source, content_locale, evidence_weight,
     slot_key, student_note, plan_relation, source_message_id)
  values
    (probe_user, now(), current_date, 'quick_tap', 'en-GB', 0.4,
     null, 'probe dish', 'as_planned', 'meal_tick:probe-untick-why:0')
  returning id into probe_id;

  -- (a) LES QUATRE MOTIFS PASSENT, un par un, et le retour à NULL reste ouvert.
  foreach motif in array array['food_not_eaten', 'ordered', 'no_time', 'ate_other']
  loop
    update public.protocol_events
       set disqualified_reason = motif where id = probe_id;
    if (select disqualified_reason from public.protocol_events where id = probe_id)
       is distinct from motif then
      raise exception 'untick_says_why: le motif % n''a pas pris', motif;
    end if;
    accepted := accepted + 1;

    -- Recocher: la ligne SURVIT à l'aller-retour, elle n'est jamais supprimée.
    update public.protocol_events
       set disqualified_reason = null where id = probe_id;
    if (select disqualified_reason from public.protocol_events where id = probe_id)
       is not null then
      raise exception 'untick_says_why: le recochage après % n''a pas pris', motif;
    end if;
  end loop;

  -- (b) UNE DÉCOCHE NE RÉÉCRIT AUCUN AUTRE CHAMP DE LA LIGNE.
  select to_jsonb(e) into before_row
    from public.protocol_events e where e.id = probe_id;
  update public.protocol_events
     set disqualified_reason = 'no_time' where id = probe_id;
  select to_jsonb(e) into after_row
    from public.protocol_events e where e.id = probe_id;

  select string_agg(d.key, ', ' order by d.key) into drifted
  from (
    (select key, value from jsonb_each(before_row)
     except
     select key, value from jsonb_each(after_row))
    union
    (select key, value from jsonb_each(after_row)
     except
     select key, value from jsonb_each(before_row))
  ) d
  where d.key <> 'disqualified_reason';

  if drifted is not null then
    raise exception
      'untick_says_why: la décoche a réécrit d''autres champs: %', drifted;
  end if;

  -- (c) TOUT LE RESTE EST REFUSÉ.
  --     `not_food` est le cas piégeux: la CHECK l'accepte (c'est un verdict de
  --     photo), et seul le trigger sait qu'il n'a rien à faire sur une coche.
  foreach motif in array array['not_food', 'unreadable', 'not_hungry', 'cheat_meal']
  loop
    begin
      update public.protocol_events
         set disqualified_reason = motif where id = probe_id;
      raise exception 'untick_says_why: le motif % A PU être posé', motif;
    exception when others then
      if sqlerrm like '%only toggle disqualified_reason%' then
        blocked := blocked + 1;
      else
        raise;
      end if;
    end;
  end loop;

  -- (d) RÉÉCRIRE L'IDENTITÉ DU FAIT RESTE REFUSÉ — la garde qu'on n'a pas
  --     touchée, reprouvée plutôt que supposée intacte.
  begin
    update public.protocol_events set food_group_ref = 'poultry' where id = probe_id;
    raise exception 'untick_says_why: food_group_ref A PU être réécrit';
  exception when others then
    if sqlerrm like '%never rewritten%' then blocked := blocked + 1; else raise; end if;
  end;

  begin
    update public.protocol_events set local_date = current_date - 3 where id = probe_id;
    raise exception 'untick_says_why: local_date A PU être réécrite';
  exception when others then
    if sqlerrm like '%never rewritten%' then blocked := blocked + 1; else raise; end if;
  end;

  begin
    update public.protocol_events set evidence_weight = 1.0 where id = probe_id;
    raise exception 'untick_says_why: evidence_weight A PU être réécrit';
  exception when others then
    if sqlerrm like '%never rewritten%' then blocked := blocked + 1; else raise; end if;
  end;

  delete from public.protocol_events where id = probe_id;

  if accepted <> 4 then
    raise exception 'untick_says_why: % motifs acceptés sur 4', accepted;
  end if;
  if blocked <> 7 then
    raise exception 'untick_says_why: % écritures interdites bloquées sur 7', blocked;
  end if;
  raise notice
    'untick_says_why: 4 motifs acceptés, ligne intacte hors disqualified_reason, '
    '7 écritures interdites bloquées';
end $$;
