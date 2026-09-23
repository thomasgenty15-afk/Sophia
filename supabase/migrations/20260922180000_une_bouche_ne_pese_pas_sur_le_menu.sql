-- ══════════════════════════════════════════════════════════════════════════
-- UNE BOUCHE NE PÈSE PAS SUR LE MENU — 2026-09-22, lot D
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── L'AUTORITÉ PRODUIT, MOT POUR MOT ──────────────────────────────────────
-- `docs/fonctionnalites/le-foyer/README.md` :
--
--   « Réclamer son profil n'est PAS une entrée dans le produit : c'est
--     l'attachement d'un compte à une ligne qui existe déjà. Ça donne la
--     lecture du plan, son propre objectif, et une part qui tient compte de
--     son corps. Ça ne donne JAMAIS le droit de composer, d'ajouter, de
--     retirer ou de restreindre. »
--
--   « Un produit qui donne à chaque bouche le droit de peser sur le menu met
--     Sophia en arbitre d'un conflit familial — et le premier arbitrage rendu
--     contre un parent est le dernier repas composé. »
--
-- ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL EST PIRE QU'UN TROU ────────────
-- `keel_write_retained_items` n'est gatée que sur `auth.uid()`. Un membre
-- SECONDAIRE peut donc écrire une exclusion — c'est-à-dire une RESTRICTION —
-- depuis sa carte. Mesuré en base le 2026-09-22 : 17 comptes de rôle `member`,
-- 13 foyers à deux comptes ou plus, et une ligne déjà écrite par un compte
-- secondaire.
--
-- ⛔ ET CETTE LIGNE N'ATTEINT AUCUN PLAN. `resolveGenerationAdmission` refuse
-- `not_owner` : seul le titulaire compose, et il lit SON magasin. La ligne du
-- membre secondaire est donc écrite, affichée sur sa carte sous la promesse
-- « rien ici n'est caché, rien ici n'est figé »… et sans le moindre effet.
--
-- C'est un écran qui ment, pas un trou : la personne croit avoir changé le
-- menu. Refuser DIT la règle ; se taire la laisse croire.
--
-- ── ⚠️ LA GARDE MORD EXACTEMENT SUR LES 17, ET SUR PERSONNE D'AUTRE ───────
-- **1 437 comptes n'ont AUCUNE ligne de foyer** (coachs, comptes d'avant le
-- foyer, fixtures). Gater sur `role = 'owner'` les refuserait tous — une
-- régression massive sur un chemin qui marche aujourd'hui. La condition est
-- donc : *le rôle décide SEULEMENT quand il existe*.
--
--   rôle absent  ⇒ passe (comportement d'avant, inchangé)
--   rôle 'owner' ⇒ passe
--   rôle autre   ⇒ `not_owner`
--
-- ── ⛔ CE QUI N'EST PAS TOUCHÉ, ET POURQUOI ───────────────────────────────
-- La LECTURE. Un membre secondaire continue de voir sa carte, ses lignes
-- existantes et son objectif : c'est ce que la réclamation lui donne. On ferme
-- l'écriture qui RESTREINT, pas la lecture qui informe. Et les lignes déjà en
-- base restent : les effacer serait retirer à quelqu'un ce qu'il a écrit de
-- bonne foi, en plus de le lui avoir laissé écrire.

create or replace function public.keel_write_retained_items(
  p_expected jsonb,
  p_items jsonb,
  p_expected_next jsonb,
  p_next jsonb,
  p_expected_notes jsonb,
  p_notes jsonb,
  p_origins jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid;
  v_role text;
  v_rows integer;
  v_touches_next boolean;
  v_touches_notes boolean;
begin
  -- ⚠️ `auth.uid()` ET PAS UN PARAMÈTRE. Cette fonction est appelée par le
  -- NAVIGATEUR de la personne, avec son jeton: son identité est dans la
  -- session, jamais dans un argument qu'on pourrait lui substituer.
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- ── ⟳ 2026-09-22 · LOT D — UNE BOUCHE NE RESTREINT PAS ──────────────────
  --
  -- ⛔ AVANT LA FORME, ET AVANT TOUT LE RESTE. Un membre secondaire doit lire
  -- `not_owner` avant d'apprendre quoi que ce soit du magasin — même ordre que
  -- `resolveGenerationAdmission`, et pour la même raison.
  --
  -- ⚠️ `v_role is not null` EST LA MOITIÉ QUI PROTÈGE: 1 437 comptes n'ont
  -- aucune ligne de foyer, et les refuser serait une régression massive sur un
  -- chemin qui marche. Le rôle décide SEULEMENT quand il existe.
  select hm.role into v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_role is not null and v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- LA FORME EST EXIGÉE, jamais devinée. Les deux magasins sont des LISTES;
  -- y écrire un objet casserait la lecture en silence, et le seul symptôme
  -- serait un magasin qui a l'air vide.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_items');
  end if;

  v_touches_next := p_next is not null or p_expected_next is not null;
  if v_touches_next and (p_next is null or jsonb_typeof(p_next) <> 'array') then
    return jsonb_build_object('ok', false, 'reason', 'bad_next_plan');
  end if;

  -- LE COUPLE DES NOTES EST ENTIER, OU IL N'EST PAS.
  v_touches_notes := p_notes is not null or p_origins is not null
    or p_expected_notes is not null;
  if v_touches_notes then
    if p_notes is null or jsonb_typeof(p_notes) <> 'array'
       or p_origins is null or jsonb_typeof(p_origins) <> 'object'
       or (p_expected_notes is not null
           and jsonb_typeof(p_expected_notes) <> 'array')
    then
      return jsonb_build_object('ok', false, 'reason', 'bad_notes');
    end if;
  end if;

  -- ⚠️ LES QUATRE CLÉS SONT ÉCRITES EN DUR ICI ET DÉCLARÉES EN CONSTANTES CÔTÉ
  -- FRONT. Un test compose les chaînes attendues À PARTIR DES CONSTANTES et
  -- exige de les trouver dans l'écriture ET dans le prédicat.
  update public.student_goals sg
     set practical_constraints = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 coalesce(sg.practical_constraints, '{}'::jsonb),
                 array['retained_items'], p_items, true
               ),
               array['retained_next_plan'],
               coalesce(p_next, sg.practical_constraints -> 'retained_next_plan', '[]'::jsonb),
               v_touches_next
             ),
             array['food_preferences'],
             coalesce(p_notes, sg.practical_constraints -> 'food_preferences', '[]'::jsonb),
             v_touches_notes
           ),
           array['food_preference_origin'],
           coalesce(p_origins, sg.practical_constraints -> 'food_preference_origin', '{}'::jsonb),
           v_touches_notes
         )
   where sg.user_id = v_user
     and (sg.practical_constraints -> 'retained_items') is not distinct from p_expected
     and (
       not v_touches_next
       or (sg.practical_constraints -> 'retained_next_plan') is not distinct from p_expected_next
     )
     and (
       not v_touches_notes
       or (sg.practical_constraints -> 'food_preferences') is not distinct from p_expected_notes
     );

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    if not exists (select 1 from public.student_goals where user_id = v_user) then
      return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'stale_snapshot');
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_write_retained_items(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Le port d''écriture de « Ce que Sophia sait », appelé par le NAVIGATEUR '
  '(auth.uid(), jamais un paramètre). ⟳ 2026-09-22 : refuse `not_owner` à un '
  'membre SECONDAIRE — « réclamer son profil ne donne jamais le droit '
  'd''ajouter, de retirer ou de restreindre » (le-foyer/README). La garde ne '
  'mord que si le rôle EXISTE : 1 437 comptes n''ont aucune ligne de foyer et '
  'passent comme avant. La LECTURE n''est pas touchée. '
  'Motifs: no_user | not_owner | bad_items | bad_next_plan | bad_notes | '
  'no_goal_row | stale_snapshot.';
