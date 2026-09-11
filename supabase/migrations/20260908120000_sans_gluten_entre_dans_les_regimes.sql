-- ═══════════════════════════════════════════════════════════════════════════
-- « SANS GLUTEN » ENTRE DANS LES RÉGIMES — 2026-09-08
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision produit: le sans-gluten concerne trop de monde pour n'exister que
-- comme ALLERGÈNE. Il devient un quatrième régime, proposé dans les
-- préférences alimentaires au même titre que végétarien / végane / pescétarien.
--
-- ── ⛔ CE QU'IL FAUT SAVOIR AVANT DE TOUCHER À CE VOCABULAIRE ──────────────
-- Les trois régimes d'avant sont EMBOÎTÉS: pescatarian ⊂ vegetarian ⊂ vegan.
-- Le code s'appuyait dessus pour décider qui reçoit un plat à soi, en comptant
-- les groupes alimentaires exclus. `gluten_free` n'exclut AUCUN groupe — le
-- riz, le maïs et le quinoa sont des céréales sans gluten, donc exclure
-- `whole_grain` interdirait le riz à un cœliaque. Compté, il valait zéro, et
-- une bouche sans gluten se serait vu servir le plat végétarien de sa case.
-- Le classement par comptage a donc été remplacé par une table de couverture
-- déclarée (`REGIME_COVERS`, `_shared/keel/household_diet.ts`). Cette
-- migration n'a de sens qu'avec ce code-là.
--
-- ── LES CINQ PORTES, ET LA CINQUIÈME EST LA TRAÎTRE ───────────────────────
-- Deux CHECK et trois fonctions portaient la liste en dur. Les quatre
-- premières REFUSENT (erreur visible). `keel_household_roster_for`, elle,
-- FILTRE: `sc.diet_ref in (...)`. Une déclaration `gluten_free` n'aurait pas
-- levé d'erreur — elle aurait simplement disparu du roster, donc du prompt,
-- donc de l'assiette. C'est le genre de porte qu'on ne trouve pas en testant
-- l'écriture.
--
-- ⚠️ LES TROIS FONCTIONS SONT RECRÉÉES DEPUIS `pg_get_functiondef`, donc avec
-- leur `security definer`, leur `search_path` et leurs droits d'origine. Rien
-- n'est réécrit à la main: seule la liste de jetons change.

-- ── 1. LES DEUX CONTRAINTES ────────────────────────────────────────────────
alter table public.student_safety_constraints
  drop constraint if exists student_safety_constraints_diet_ref_check;
alter table public.student_safety_constraints
  add constraint student_safety_constraints_diet_ref_check
  check (
    diet_ref is null
    or diet_ref in ('vegetarian', 'vegan', 'pescatarian', 'gluten_free')
  );

alter table public.household_members
  drop constraint if exists household_members_diet_check;
alter table public.household_members
  add constraint household_members_diet_check
  check (
    diet is null
    or diet in ('omnivore', 'vegetarian', 'vegan', 'pescatarian', 'gluten_free')
  );

-- ── 2. LES TROIS FONCTIONS ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.keel_household_set_member_diet(p_member uuid, p_diet text)
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

  -- R3. LE VOCABULAIRE EST FERMÉ, ET IL EST VÉRIFIÉ ICI AUSSI. Le CHECK de la
  -- colonne refuserait déjà, mais il refuserait en LEVANT: l'écran recevrait
  -- une erreur Postgres brute au lieu d'un motif que la copie sait rendre.
  if p_diet is not null and p_diet not in (
    'omnivore', 'vegetarian', 'vegan', 'pescatarian', 'gluten_free'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_diet');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;
  -- R2/D1. La bouche a un compte: son régime vit dans SON « about you ».
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;

  update public.household_members
     set diet = p_diet
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.keel_household_set_member_diet_for(p_user uuid, p_member uuid, p_diet text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_household uuid;
  v_role text;
  v_target record;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  if p_diet is not null and p_diet not in (
    'omnivore', 'vegetarian', 'vegan', 'pescatarian', 'gluten_free'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_diet');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = p_user;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_role <> 'owner' and v_target.user_id is distinct from p_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;

  update public.household_members
     set diet = p_diet
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.keel_household_roster_for(p_user uuid)
 RETURNS TABLE(member_id uuid, user_id uuid, first_name text, age_state text, role text, goal text, away_days jsonb, own_plans jsonb, eating_rhythm jsonb, diet text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    hm.member_id,
    hm.user_id,
    hm.first_name,
    public.keel_household_member_age(hm.member_id) as age_state,
    hm.role,
    -- D1. La jointure ne peut pas dupliquer une bouche: `student_goals.user_id`
    -- porte une contrainte UNIQUE (`student_goals_user_id_key`).
    case
      when hm.user_id is null then hm.goal
      else sg.goal
    end as goal,
    -- D14. L'UNION, DANS CET ORDRE: ce que la personne a déclaré d'abord, ce
    -- que le maître a marqué ensuite.
    public.keel_away_tagged(sg.practical_constraints -> 'away_days', 'self')
      || public.keel_away_tagged(hm.away_days, 'household') as away_days,
    -- D2/D7. LES PLANS QUI POURRAIENT RETIRER CETTE BOUCHE DE LA TABLE.
    --
    -- « Pourraient », pas « retirent »: la fenêtre décide, et elle est
    -- appliquée par `household_hand.ts`. Ce qui est rendu ici est la liste des
    -- CANDIDATS, déjà filtrée sur tout ce que la base peut voir seule.
    coalesce(op.plans, '[]'::jsonb) as own_plans,
    -- ── LE RYTHME, TRANCHÉ ICI ET NULLE PART AILLEURS ──────────────────────
    -- EXACTEMENT la règle de `goal` deux colonnes plus haut, et c'est
    -- volontaire: une bouche avec compte porte ses moments dans son « about
    -- you », une bouche sans compte les porte sur sa ligne. `null` traverse —
    -- il veut dire « personne ne l'a dit », et c'est l'appelant qui décide que
    -- ça signifie « aux moments de la maison ».
    case
      when hm.user_id is null then hm.eating_rhythm
      else sg.practical_constraints -> 'eating_rhythm'
    end as eating_rhythm,
    -- ── R2 · LE RÉGIME, TRANCHÉ ICI ET NULLE PART AILLEURS ─────────────────
    -- La MÊME règle que `goal` et que le rythme, avec une seule différence, et
    -- elle est dans la source: le régime d'un COMPTE ne vit pas sur une
    -- colonne de `student_goals`, il vit sur DEUX supports qui disent la même
    -- chose par deux moyens.
    --
    --   · une ligne `student_safety_constraints` ACTIVE de `kind='diet'` porte
    --     `vegetarian` / `vegan` / `pescatarian`. Le filtre `status='active'`
    --     est celui de `loadSafetyConstraints`, et il est ici pour la même
    --     raison qu'il y est: une contrainte RÉTRACTÉE reste en base pour
    --     l'audit et doit cesser de mordre partout à la fois.
    --   · `practical_constraints.diet_asked` porte l'omnivore, parce qu'« aucune
    --     restriction » n'a AUCUNE ligne à poser. Sans lui, un omnivore déclaré
    --     serait rendu `null`, c'est-à-dire « on n'a jamais demandé ».
    --
    -- `order by` + `limit 1` plutôt qu'un agrégat: la lane individuelle prend
    -- la PREMIÈRE ligne de régime qu'elle trouve (`readDietAnswer`,
    -- `generate-meal-v1`), donc ce qu'il faut ici est une valeur, stable. La
    -- plus récente gagne — c'est la seule réponse qui se défend quand deux
    -- lignes coexistent, et l'ordre est total (`id` départage).
    case
      when hm.user_id is null then hm.diet
      else coalesce(
        (
          select sc.diet_ref
            from public.student_safety_constraints sc
           where sc.user_id = hm.user_id
             and sc.kind = 'diet'
             and sc.status = 'active'
             and sc.diet_ref in ('vegetarian', 'vegan', 'pescatarian', 'gluten_free')
           order by sc.created_at desc, sc.id desc
           limit 1
        ),
        case
          when sg.practical_constraints -> 'diet_asked' = 'true'::jsonb
            then 'omnivore'
        end
      )
    end as diet
  from public.household_members hm
  left join public.student_goals sg on sg.user_id = hm.user_id
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'starts_on', p.starts_on,
               'duration_days', p.duration_days,
               'validated_at', p.validated_at
             )
             order by p.starts_on
           ) as plans
      from public.student_generated_meals p
     where p.user_id = hm.user_id
       and p.household_id = hm.household_id
       and p.plan_kind = 'personal'
       and p.validated_at is not null
       and p.retired_at is null
  ) op on true
  -- LA GARDE, portée par l'ARGUMENT. Un `p_user` nul rend zéro ligne:
  -- `keel_household_of(null)` est nul, et `= null` n'est jamais vrai.
  where hm.household_id = public.keel_household_of(p_user)
  order by (hm.role = 'owner') desc, hm.joined_at;
$function$;
