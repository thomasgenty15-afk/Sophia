-- KEEL — UN ENFANT PEUT PORTER UNE DIRECTION. PAS N'IMPORTE LAQUELLE.
--
-- ── CE QUE CETTE MIGRATION RENVERSE, ET AVEC QUELLE AUTORITÉ ───────────────
-- `docs/keel/PIVOT-FOYER.md` §8.4 porte, en encadré, une « conséquence
-- structurelle »:
--
--   « un membre mineur du foyer n'a JAMAIS d'objectif nutritionnel individuel.
--     Il est un mangeur — allergies, goûts, restrictions parentales, portions
--     adaptées à l'âge — jamais une cible. […] la base doit rendre l'erreur
--     INCONSTRUCTIBLE plutôt que la corriger après coup. »
--
-- Décision humaine du 2026-08-13: un enfant PEUT porter une direction. La règle
-- était plus large que sa propre raison.
--
-- Relire le paragraphe qui la justifie, mot pour mot: « avec un mineur, le
-- registre est éducatif — jamais CORRECTIF SUR LE CORPS. Expliquer à un enfant
-- que son choix "ne va pas" est à une phrase de distance d'un dégât réel. Aucune
-- mention de poids, de silhouette, de restriction. On parle de ce que l'aliment
-- APPORTE, pas de ce qu'il fait grossir. »
--
-- La raison n'a jamais été « pas de direction ». Elle a toujours été « pas de
-- direction qui fasse d'un enfant une cible de poids ». « Manger mieux » et
-- « mieux s'entraîner » sont exactement ce que l'aliment APPORTE; les interdire
-- ne protégeait personne, et privait un adolescent qui s'entraîne d'une
-- composition qui tient compte de ce qu'il fait.
--
-- ── CE QUI RESTE INCONSTRUCTIBLE, ET C'EST LA MOITIÉ QUI COMPTE ───────────
-- `fat_loss` et `recomposition`. Ce sont les deux directions du registre qui
-- RETIRE — celui qui parle de silhouette et de poids. La phrase de §8.4 sur le
-- dégât réel les vise, et elles restent refusées À L'ÉCRITURE: le mot
-- « inconstructible » de l'encadré est tenu là où il était déjà tenu.
--
-- ── DEUX PORTES, UNE SEULE RÈGLE ──────────────────────────────────────────
-- `keel_household_set_member_goal` (poser la direction d'une bouche existante)
-- et `keel_household_add_member` (l'ajouter avec sa direction). Les deux
-- écrivent la même colonne; une garde sur une seule laisserait l'autre ouverte,
-- et c'est toujours celle qu'on n'a pas regardée qui sert.
--
-- ⚠️ L'ÂGE EST RELU À CHAQUE APPEL, jamais figé. `keel_age_state` existe pour
-- ça — un enfant grandit. Un `unknown` (date absente, illisible,
-- future, aberrante) n'est PAS un mineur: on ne refuse rien à quelqu'un dont on
-- ignore l'âge, parce qu'il peut être adulte. C'est la LECTURE (`goalApplies`)
-- qui n'applique aucune direction à un âge inconnu, et elle ne bouge pas.
--
-- ── CE QUI N'EST PAS TOUCHÉ ICI ───────────────────────────────────────────
-- Les faits CORPORELS d'un mineur (FF-047): un enfant ne reçoit toujours ni
-- taille ni poids à côté de son prénom dans le prompt. Une direction dit ce
-- qu'on ajoute; une taille et une pesée posées à côté du prénom d'un enfant
-- rendent `fat_loss` DÉRIVABLE sans qu'on l'ait demandé. Les deux gardes sont
-- indépendantes, et celle-là reste fermée.
--
-- Les lignes déjà écrites ne sont pas nettoyées: un `fat_loss` posé sur un
-- mineur avant aujourd'hui reste en colonne et reste SANS EFFET — `goalApplies`
-- le refuse à la lecture. Une garde qui dépendrait d'un nettoyage n'est pas une
-- garde.

CREATE OR REPLACE FUNCTION public.keel_household_set_member_goal(p_member uuid, p_goal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_goal is not null and p_goal not in (
    'fat_loss', 'muscle_gain', 'recomposition',
    'performance', 'health', 'maintenance'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- L'ORDRE DES DEUX REFUS EST LA RÈGLE. `not_your_line` d'abord: un secondaire
  -- qui vise la ligne d'un enfant doit s'entendre dire qu'il n'est pas chez lui,
  -- pas qu'il faudrait passer par un « about you » que l'enfant n'a pas.
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  -- D1. La bouche a un compte: son objectif vit dans SON « about you ».
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;


  -- ⛔ LE REGISTRE CORRECTIF SUR LE CORPS RESTE INCONSTRUCTIBLE POUR UN MINEUR.
  -- Voir l'en-tête de la migration. L'âge est RELU ici (`keel_age_state`, la
  -- seule borne des dix-huit ans du dépôt), jamais figé: un enfant grandit, et
  -- la direction qu'on lui refuse aujourd'hui s'écrira toute seule le jour de
  -- ses dix-huit ans.
  --
  -- ⚠️ UN ÂGE INCONNU N'EST PAS REFUSÉ ICI. Il peut être celui d'un adulte, et
  -- refuser sur « je ne sais pas » bloquerait un majeur sans date. C'est la
  -- LECTURE (`goalApplies`) qui n'applique aucune direction à un âge inconnu.
  if p_goal in ('fat_loss', 'recomposition')
     and public.keel_age_state(
           (select hm.birth_date from public.household_members hm
             where hm.member_id = p_member)
         ) = 'minor' then
    return jsonb_build_object('ok', false, 'reason', 'goal_not_for_minor');
  end if;

  update public.household_members
     set goal = p_goal
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.keel_household_add_member(p_first_name text, p_birth_date date DEFAULT NULL::date, p_goal text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_count integer;
  v_member uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
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
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_first_name');
  end if;
  if p_goal is not null and p_goal not in (
    'fat_loss', 'muscle_gain', 'recomposition',
    'performance', 'health', 'maintenance'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date');
  end if;

  -- ⛔ LE REGISTRE CORRECTIF SUR LE CORPS RESTE INCONSTRUCTIBLE POUR UN MINEUR.
  -- Voir l'en-tête de la migration: c'est la moitié de §8.4 que la décision du
  -- 2026-08-13 ne touche pas.
  --
  -- ⚠️ L'ÂGE SE LIT SUR `p_birth_date`, pas sur la ligne: elle n'existe pas
  -- encore. Mais par LA MÊME fonction que partout ailleurs — `keel_age_state`,
  -- qui porte la borne des dix-huit ans et le traitement de l'illisible. Une
  -- arithmétique de dates recopiée ici serait une seconde borne, et c'est
  -- toujours la copie qu'on oublie d'ajuster qui décide.
  if p_goal in ('fat_loss', 'recomposition')
     and public.keel_age_state(p_birth_date) = 'minor' then
    return jsonb_build_object('ok', false, 'reason', 'goal_not_for_minor');
  end if;

  -- LE PLAFOND, EN BASE ET PAS À L'ÉCRAN (lot 7). « Une limite d'UI n'est pas
  -- une limite »: il doit tenir face à un appel direct de la RPC. Il compte les
  -- BOUCHES — toutes, comptes ou pas — et n'a rien à voir avec ce qui est
  -- facturé (section 3).
  select count(*) into v_count
  from public.household_members hm
  where hm.household_id = v_household;

  if v_count >= public.keel_household_max_mouths() then
    return jsonb_build_object('ok', false, 'reason', 'household_full');
  end if;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values
    (v_household, null, 'member', v_first, p_birth_date, p_goal)
  returning member_id into v_member;

  return jsonb_build_object('ok', true, 'member_id', v_member);
end;
$function$;

comment on function public.keel_household_set_member_goal(uuid, text) is
  'Pose la direction nutritionnelle d''une bouche SANS COMPTE. Le maître écrit '
  'celle de n''importe laquelle de son foyer; une bouche qui a réclamé son '
  'profil passe par son « about you » (refus `has_account`). Depuis le '
  '2026-08-13 un MINEUR peut porter une direction — mais jamais `fat_loss` ni '
  '`recomposition` (refus `goal_not_for_minor`): PIVOT-FOYER §8.4 interdit le '
  'registre correctif sur le corps d''un enfant, pas la direction elle-même. '
  'L''âge est relu à chaque appel; un âge INCONNU n''est pas refusé ici (il peut '
  'être adulte) — c''est `goalApplies` qui ne lui applique aucune direction.';

comment on function public.keel_household_add_member(text, date, text) is
  'Ajoute une bouche SANS COMPTE au foyer du maître. Refuse `not_owner`, '
  '`household_full` (plafond en base), `bad_first_name`, `bad_birth_date`, '
  '`bad_goal`, et depuis le 2026-08-13 `goal_not_for_minor` — mêmes deux '
  'directions interdites que `keel_household_set_member_goal`, lues ici sur '
  '`p_birth_date` puisque la ligne n''existe pas encore.';
