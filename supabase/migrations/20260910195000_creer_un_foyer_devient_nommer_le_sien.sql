-- ===========================================================================
-- LOT 1 · « CRÉER UN FOYER » DEVIENT « NOMMER LE SIEN »
--
-- Plan: docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md, lot 1.
-- Amont: 20260910194000 (le déclencheur qui provisionne tout profil neuf).
-- Définition reprise de la fonction VIVANTE.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.keel_household_create(p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_member uuid;
  v_first text;
  v_birth date;
  v_current uuid;
  v_current_role text;
  v_members integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  -- ══════════════════════════════════════════════════════════════════════
  -- LOT 1 · ON NE CRÉE PLUS UN FOYER — ON NOMME LE SIEN
  -- ══════════════════════════════════════════════════════════════════════
  --
  -- ⛔ CE REFUS AURAIT CASSÉ L'ENTONNOIR ENTIER. Depuis 20260910194000, chaque
  -- profil neuf reçoit un foyer personnel: `already_in_household` serait donc
  -- vrai de TOUT LE MONDE, et « créer mon foyer » échouerait toujours.
  --
  -- Sous le modèle « une personne seule est un foyer d'une personne », créer
  -- n'a plus de sens: on NOMME celui qu'on a, et on commence à y ajouter des
  -- bouches. La fonction rend donc le foyer existant, renommé, avec
  -- `created: false` — l'appelant voit un identifiant de foyer, comme avant.
  --
  -- ⚠️ ET SEULEMENT S'IL EST RÉELLEMENT PERSONNEL. Un foyer où quelqu'un
  -- d'autre vit ne se renomme pas par cette porte: la question « qui décide du
  -- nom d'un foyer partagé » n'est pas tranchée ici, et le refus reste.
  v_current := public.keel_household_of(v_user);
  if v_current is not null then
    select count(*) into v_members
    from public.household_members hm where hm.household_id = v_current;

    select hm.role into v_current_role
    from public.household_members hm
    where hm.household_id = v_current and hm.user_id = v_user;

    if v_members <> 1 or coalesce(v_current_role, '') <> 'owner' then
      return jsonb_build_object('ok', false, 'reason', 'already_in_household');
    end if;

    update public.households set name = v_name where id = v_current;
    select hm.member_id into v_member
    from public.household_members hm
    where hm.household_id = v_current and hm.user_id = v_user;

    -- ⛔ AUCUNE ÉCHÉANCE TOUCHÉE. Renommer n'est pas souscrire: `free_until`
    -- reste ce qu'il était, et c'est ce qui empêche « créer/renommer » de
    -- devenir une seconde façon de rejouer l'essai.
    return jsonb_build_object(
      'ok', true, 'created', false,
      'household_id', v_current, 'member_id', v_member);
  end if;

  -- LA LIGNE DU MAÎTRE EST RECOPIÉE UNE FOIS, puis elle vit sa vie.
  -- Arbitrage explicite du chantier: pas de repli « la ligne, sinon profiles ».
  -- Conséquence assumée — s'il renomme son profil plus tard, son prénom au
  -- foyer ne suit pas; il le change au foyer. Le prix d'un repli serait de
  -- rendre le roster conditionnel, et de ramener le bug du prénom vide.
  select
    coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Me'),
    p.birth_date
    into v_first, v_birth
  from public.profiles p where p.id = v_user;

  insert into public.households (name, created_by)
  values (v_name, v_user)
  returning id into v_id;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values
    (v_id, v_user, 'owner', coalesce(v_first, 'Me'), v_birth)
  returning member_id into v_member;

  return jsonb_build_object(
    'ok', true, 'household_id', v_id, 'member_id', v_member
  );
end;
$function$

;
