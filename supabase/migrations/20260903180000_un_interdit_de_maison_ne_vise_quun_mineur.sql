-- ════════════════════════════════════════════════════════════════════════════
-- LOT C · UN INTERDIT DE MAISON NE VISE QU'UN MINEUR
--
-- Autorité: docs/keel/PIVOT-FOYER.md §8.5 règle 1 · chantier « la mémoire à
-- trois destinations » §6.1.
--
-- ── CE QUI ÉTAIT ÉCRIT, ET QUE RIEN N'ARMAIT ───────────────────────────────
-- §8.5 règle 1 dit, en toutes lettres et depuis le premier jour du foyer:
--
--   « Hors mode famille — couple, colocation, deux adultes — AUCUN
--     verrouillage du compte maître n'est possible. […] Le défaut doit être
--     RESTRICTION IMPOSSIBLE SUR UN MAJEUR, et l'exception doit demander
--     l'accord explicite du majeur concerné. »
--   « Un produit où un adulte peut contrôler en silence l'alimentation d'un
--     autre adulte est un outil de contrôle coercitif. »
--
-- `keel_household_add_restriction` ne regardait PAS l'âge de sa cible. Elle
-- vérifiait l'authentification, la longueur du libellé, le rôle `owner` et
-- l'appartenance au foyer — et posait ensuite l'interdit sur n'importe qui.
--
-- ── ET ÇA S'EST PRODUIT. MESURÉ, PAS SUPPOSÉ ───────────────────────────────
-- Base locale au 2026-09-03, `household_food_restrictions`: **7 lignes, dont 6
-- sur des bouches `adult`** (une seule sur une `minor`). Le champ qui les a
-- écrites s'appelait « Aliments refusés » et demandait un DÉGOÛT — c'est le
-- second défaut du lot C, réparé côté écran: un dégoût est une préférence, il
-- part maintenant dans `retained_items`.
--
-- ⛔ AUCUNE LIGNE N'EST SUPPRIMÉE ICI. Le sens d'une ligne existante (« goût »
-- ou « interdit ») n'est pas déductible d'un libellé, et le sort des sept est
-- une décision humaine, pas une migration. Cette migration ferme la PORTE.
--
-- ── `unknown` EST REFUSÉ COMME UN MAJEUR, ET C'EST L'ASYMÉTRIE DES DÉGÂTS ──
-- Une bouche sans date de naissance vaut `unknown` (`keel_age_state`). La
-- refuser coûte un message à un parent qui n'a pas tapé la date de son enfant;
-- l'accepter rouvre le contrôle coercitif sur un colocataire dont personne n'a
-- renseigné l'âge. Le refus est NOMMÉ (`not_a_minor`) pour que l'écran puisse
-- dire quoi faire.
--
-- ⏸ CE QUI N'EST PAS FAIT, ET QUI EST ÉCRIT: l'exception de §8.5 règle 1 —
-- l'accord explicite d'un majeur, révocable par lui, dont la révocation retire
-- les restrictions DÉJÀ POSÉES. Elle demande une table de consentement et un
-- écran; ce lot ne l'ouvre pas, il ferme le défaut.
-- ════════════════════════════════════════════════════════════════════════════

-- ── LA DÉCISION, ISOLÉE ET PURE ────────────────────────────────────────────
-- ⚠️ UNE FONCTION À PART, ET C'EST CE QUI REND LE BLOC DE CONTRÔLE POSSIBLE.
-- `keel_household_add_restriction` lit `auth.uid()`, NULL dans une migration:
-- l'appeler ici rendrait `not_authenticated` avant d'atteindre la règle, et le
-- contrôle mesurerait une authentification au lieu d'un âge. Sortir la
-- décision permet de la mesurer SUR LES VRAIES LIGNES, sans jeton.
create or replace function public.keel_restriction_target_ok(p_member uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when public.keel_household_member_age(p_member) = 'minor' then 'ok'
    else 'not_a_minor'
  end;
$function$;

comment on function public.keel_restriction_target_ok(uuid) is
  'PIVOT-FOYER §8.5 règle 1: un interdit de maison ne vise qu''un mineur. '
  '`unknown` est refusé comme un majeur (asymétrie des dégâts). Isolée pour '
  'être mesurable sans jeton — voir la migration 20260903180000.';

revoke all on function public.keel_restriction_target_ok(uuid) from public;
grant execute on function public.keel_restriction_target_ok(uuid) to authenticated;

create or replace function public.keel_household_add_restriction(
  p_member uuid,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_label text := btrim(coalesce(p_label, ''));
  v_target uuid;
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'bad_label');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select hm.member_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- ⚠️ APRÈS `not_a_member`, ET L'ORDRE EST LE SUJET. Poser cette garde avant
  -- ferait fuiter l'âge d'une bouche qui n'est pas dans ce foyer: un refus
  -- `not_a_minor` sur un `member_id` étranger dirait « cette personne est
  -- majeure », ce que l'appelant n'a pas le droit de savoir.
  if public.keel_restriction_target_ok(v_target) <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_minor');
  end if;

  insert into public.household_food_restrictions
    (household_id, member_id, label, created_by)
  values (v_household, v_target, v_label, v_user)
  on conflict (household_id, member_id, label) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'restriction_id', v_id);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- LE BLOC DE CONTRÔLE — il mesure la DÉCISION sur les LIGNES RÉELLES
--
-- ⛔ PAS UN `position('not_a_minor' in prosrc)`. Une garde peut être présente
-- dans le texte et inatteignable dans le flux (elle l'a déjà été dans ce
-- dépôt). On appelle donc la fonction de décision sur chaque bouche qui porte
-- DÉJÀ une restriction, et on exige que le compte tombe juste.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_adults integer;
  v_minors integer;
  v_unknown_state integer;
begin
  select
    count(*) filter (where public.keel_restriction_target_ok(r.member_id) = 'not_a_minor'),
    count(*) filter (where public.keel_restriction_target_ok(r.member_id) = 'ok'),
    count(*) filter (where public.keel_restriction_target_ok(r.member_id)
                       not in ('ok', 'not_a_minor'))
  into v_adults, v_minors, v_unknown_state
  from public.household_food_restrictions r;

  if v_unknown_state > 0 then
    raise exception
      'keel_restriction_target_ok rend un jeton hors vocabulaire sur % ligne(s)',
      v_unknown_state;
  end if;

  -- LE CAS QUI PASSE. Sans lui, une fonction qui rendrait `not_a_minor` pour
  -- TOUT LE MONDE passerait ce bloc — et le produit n'aurait plus d'interdit
  -- de maison du tout, ce qui est aussi faux que l'inverse.
  --
  -- ⚠️ CONDITIONNÉ À L'EXISTENCE D'UNE BOUCHE MINEURE, parce qu'une base neuve
  -- n'en a aucune: exiger `> 0` sans condition ferait échouer la migration sur
  -- une installation vierge, c'est-à-dire sur le cas nominal d'un déploiement.
  if exists (
    select 1 from public.household_members hm
    where public.keel_household_member_age(hm.member_id) = 'minor'
  ) then
    if (select count(*) from public.household_members hm
        where public.keel_household_member_age(hm.member_id) = 'minor'
          and public.keel_restriction_target_ok(hm.member_id) <> 'ok') > 0 then
      raise exception
        'keel_restriction_target_ok refuse une bouche MINEURE: la porte est '
        'fermée pour tout le monde, et le parent ne peut plus rien interdire';
    end if;
  end if;

  raise notice
    'restrictions existantes: % sur une bouche refusée désormais (majeure ou '
    'sans date), % sur une bouche mineure. AUCUNE n''est supprimée: leur sort '
    'est une décision humaine.',
    v_adults, v_minors;
end;
$$;
