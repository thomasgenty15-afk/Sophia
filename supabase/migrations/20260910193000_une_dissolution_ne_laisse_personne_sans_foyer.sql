-- ===========================================================================
-- LOT 1 · UNE DISSOLUTION NE LAISSE PERSONNE SANS FOYER, ET NE REJOUE PAS L'ESSAI
--
-- Plan: docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md, lot 1 (cycle de vie).
-- Amont: 20260910192000. Définition reprise de la fonction VIVANTE.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.keel_household_dissolve()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_member uuid;
  v_household uuid;
  v_role text;
  v_others bigint;
  v_plans bigint;
  v_free_before date;
  v_res jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select hm.member_id, hm.household_id, hm.role
    into v_member, v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- ON COMPTE PAR `member_id`, PAS PAR `user_id`. Une bouche sans compte porte
  -- `user_id is null`, et `null <> v_user` ne rend PAS `true` en SQL: compter
  -- sur cette colonne aurait rendu « il est seul » sur un foyer plein
  -- d'enfants, c'est-à-dire ouvert la suppression exactement là où elle est
  -- interdite.
  select count(*) into v_others
  from public.household_members hm
  where hm.household_id = v_household
    and hm.member_id <> v_member;

  if v_others > 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_alone', 'others', v_others);
  end if;

  select count(*) into v_plans
  from public.student_generated_meals m
  where m.household_id = v_household;

  if v_plans > 0 then
    return jsonb_build_object('ok', false, 'reason', 'household_has_plans');
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- LOT 1 · ON NE RESTE JAMAIS SANS FOYER — ET L'ESSAI NE SE REJOUE PAS
  -- ══════════════════════════════════════════════════════════════════════
  --
  -- ⛔ LE TROU QUE CE BLOC FERME, ET IL EST NÉ LE JOUR MÊME. Le propriétaire a
  -- décidé (2026-09-10) que le provisionnement laisse le DÉFAUT de `free_until`
  -- s'appliquer: sept jours. Sans ce qui suit, « dissoudre puis regénérer »
  -- rendrait sept jours neufs à chaque tour, indéfiniment. Une porte de
  -- facturation qu'un bouton rouvre n'est pas une porte.
  --
  -- On garde donc l'échéance du foyer dissous et on la REPOSE sur le foyer
  -- reconstitué. Le compte retrouve exactement le droit qu'il avait — ni plus,
  -- ni moins — et c'est la règle du plan: « reprendre l'échéance existante du
  -- compte ; sans droit existant, aucun nouveau droit ».
  select h.free_until into v_free_before from public.households h where h.id = v_household;

  delete from public.households where id = v_household;

  -- ⚠️ DANS LA MÊME TRANSACTION. Le plan interdit une boucle
  -- dissolution/recréation VISIBLE: du point de vue de l'appelant l'identifiant
  -- change, et à aucun instant le compte n'est sans rattachement.
  v_res := public.keel__ensure_personal_household(v_user);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'dissolution: reprovisionnement impossible (%)', v_res->>'reason';
  end if;

  update public.households
     set free_until = v_free_before
   where id = (v_res->>'household_id')::uuid;

  return jsonb_build_object(
    'ok', true,
    'household_id', v_res->>'household_id',
    'member_id', v_res->>'member_id',
    'free_until', v_free_before,
    'note', 'foyer personnel reconstitue, echeance reprise');
end;
$function$

;
