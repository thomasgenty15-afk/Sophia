-- KEEL — QUAND CHAQUE BOUCHE MANGE, ET PLUS « QUAND LA MAISON MANGE ».
--
-- ── LE DÉFAUT, DIT PAR L'ÉCRAN LUI-MÊME ────────────────────────────────────
-- L'entonnoir affichait, au-dessus des six moments: « Demandé une fois, pour
-- toute la maison — ça appartient à qui cuisine. » C'était vrai du code, et
-- c'est faux de la vie: un ado qui saute le petit-déjeuner et un petit qui
-- goûte à 16 h ne mangent pas aux mêmes moments, et le foyer composait pour
-- eux un jour identique.
--
-- `practical_constraints.eating_rhythm` reste ce qu'il est — le rythme d'UN
-- compte. Ce qui manquait était le rythme d'une bouche SANS compte, et la
-- résolution des deux.
--
-- ── LA RÉSOLUTION EST CELLE DE L'OBJECTIF, À L'IDENTIQUE ──────────────────
-- Une bouche AVEC compte porte son rythme dans SON « about you »
-- (`student_goals.practical_constraints -> 'eating_rhythm'`); une bouche SANS
-- compte le porte sur sa ligne. Le roster tranche, une fois, comme il tranche
-- déjà `goal` (D1 du chantier foyer). Deux lecteurs qui trancheraient chacun
-- de leur côté finiraient par servir un petit-déjeuner à quelqu'un qui n'en
-- prend pas.
--
-- ── `null` N'EST PAS UN RYTHME VIDE, ET LA DIFFÉRENCE EST TOUT ────────────
-- `null` = « personne ne l'a dit » ⇒ cette bouche mange aux moments de la
-- maison. Un tableau VIDE serait « elle ne mange jamais », ce qui n'est pas une
-- réponse qu'un écran doit pouvoir produire par inadvertance — la RPC refuse
-- donc le tableau vide (`empty_rhythm`).
--
-- ⚠️ AUCUN PRÉ-REMPLISSAGE, ET C'EST UNE CICATRICE DU DÉPÔT. On serait tenté
-- de semer chaque bouche avec les moments de la maison pour que l'écran ait
-- quelque chose à cocher. Ce serait écrire, sur la ligne de quelqu'un, un fait
-- que personne n'a énoncé — « coche automatique = faits faux indémentables ».
-- Le repli non écrit dit exactement ce qu'on sait: rien.
--
-- ── POURQUOI LE ROSTER CHANGE DE SIGNATURE ────────────────────────────────
-- `RETURNS TABLE` fait partie du type de retour: Postgres refuse un
-- `create or replace` qui l'élargit. Les deux fonctions sont donc DROPPÉES et
-- recréées dans la même transaction, avec leurs droits reposés derrière —
-- `revoke ... from public, anon` compris, parce qu'un `revoke from public`
-- laisse `anon` armé (cicatrice du dépôt) et qu'une recréation repart des
-- privilèges par défaut, où `authenticated` a TOUT.

-- ---------------------------------------------------------------------------
-- 1. La colonne
-- ---------------------------------------------------------------------------

alter table public.household_members
  add column if not exists eating_rhythm jsonb;

comment on column public.household_members.eating_rhythm is
  'Les moments où CETTE bouche mange, forme `[{"slot":"breakfast","at":null}]` '
  '— la même que `student_goals.practical_constraints.eating_rhythm`, parce que '
  'le même parseur (`parseEatingRhythm`) lit les deux et que deux formes '
  'divergeraient. `null` = personne ne l''a dit, la bouche mange aux moments de '
  'la maison; le tableau VIDE est refusé à l''écriture (`empty_rhythm`) parce '
  'qu''il dirait « elle ne mange jamais ». N''est lu que pour une bouche SANS '
  'compte: dès qu''elle en a un, son rythme vit dans son « about you », et '
  'c''est `keel_household_roster_for` qui tranche.';

-- ---------------------------------------------------------------------------
-- 2. La porte d'écriture
-- ---------------------------------------------------------------------------
--
-- Mêmes refus que `keel_household_set_member_goal`, et dans le même ordre:
-- `not_your_line` avant `has_account`, parce qu'un secondaire qui vise la ligne
-- d'un enfant doit s'entendre dire qu'il n'est pas chez lui — pas qu'il
-- faudrait passer par un « about you » que l'enfant n'a pas.

create or replace function public.keel_household_set_member_rhythm(
  p_member uuid,
  p_rhythm jsonb
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
  v_target record;
  v_slot text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- LE VOCABULAIRE EST FERMÉ, ET IL EST VÉRIFIÉ ICI. Le parseur du moteur
  -- ignore en silence un moment qu'il ne connaît pas: parfait pour lire, mais
  -- une écriture qui accepte n'importe quoi laisse une ligne dont personne ne
  -- voit qu'elle ne dit rien.
  if p_rhythm is not null then
    if jsonb_typeof(p_rhythm) <> 'array' then
      return jsonb_build_object('ok', false, 'reason', 'bad_rhythm');
    end if;
    if jsonb_array_length(p_rhythm) = 0 then
      -- « Elle ne mange jamais » n'est pas une réponse. Effacer se fait avec
      -- `null`, qui veut dire « comme la maison ».
      return jsonb_build_object('ok', false, 'reason', 'empty_rhythm');
    end if;
    for v_slot in select jsonb_array_elements(p_rhythm) ->> 'slot' loop
      if v_slot is null or v_slot not in (
        'breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'before_bed'
      ) then
        return jsonb_build_object('ok', false, 'reason', 'bad_rhythm');
      end if;
    end loop;
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
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;
  -- D1. La bouche a un compte: son rythme vit dans SON « about you ».
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;

  update public.household_members
     set eating_rhythm = p_rhythm
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_rhythm(uuid, jsonb) is
  'Pose les moments où une bouche SANS COMPTE mange. `null` efface (la bouche '
  'revient aux moments de la maison); le tableau vide est refusé '
  '(`empty_rhythm`) parce qu''il dirait « elle ne mange jamais ». Refuse '
  '`not_your_line`, `has_account` (son rythme est dans son « about you ») et '
  '`bad_rhythm` sur un moment hors des six.';

revoke all on function public.keel_household_set_member_rhythm(uuid, jsonb)
  from public, anon;
grant execute on function public.keel_household_set_member_rhythm(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le résolveur — DROPPÉ et recréé, signature élargie
-- ---------------------------------------------------------------------------

drop function if exists public.keel_household_roster();
drop function if exists public.keel_household_roster_for(uuid);

create function public.keel_household_roster_for(p_user uuid)
returns table(
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text,
  away_days jsonb,
  own_plans jsonb,
  eating_rhythm jsonb
)
language sql
stable
security definer
set search_path to ''
as $function$
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
    end as eating_rhythm
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

create function public.keel_household_roster()
returns table(
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text,
  away_days jsonb,
  eating_rhythm jsonb
)
language sql
stable
security definer
set search_path to ''
as $function$
  select r.member_id, r.user_id, r.first_name, r.age_state, r.role, r.goal,
         r.away_days, r.eating_rhythm
    from public.keel_household_roster_for((select auth.uid())) r;
$function$;

comment on function public.keel_household_roster_for(uuid) is
  'LE résolveur du foyer: une ligne par bouche, avec l''objectif, les absences '
  'et le RYTHME déjà tranchés entre le compte et la ligne. Aucun appelant ne '
  'refait cette résolution — deux lectures divergeraient, et c''est un '
  'petit-déjeuner servi à quelqu''un qui n''en prend pas.';

-- ⚠️ LES DROITS SONT REPOSÉS, ET `anon` NOMMÉMENT. Une fonction recréée repart
-- des privilèges par défaut; `revoke from public` seul laisse `anon` armé
-- (cicatrice mesurée du dépôt).
revoke all on function public.keel_household_roster() from public, anon;
revoke all on function public.keel_household_roster_for(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_roster() to authenticated;
grant execute on function public.keel_household_roster_for(uuid) to service_role;
