-- ============================================================================
-- D1 — L'« ABOUT YOU » FAIT AUTORITÉ POUR TOUTE BOUCHE QUI A UN COMPTE
--
-- Décidé le 2026-08-11 (docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md).
--
-- LE PROBLÈME QU'ON FERME
--   L'objectif d'une personne pouvait vivre à DEUX endroits: `household_members
--   .goal`, posé par `keel_household_set_member_goal`, et `student_goals.goal`,
--   rempli par la personne elle-même dans son « about you ». Deux sources de
--   vérité qui peuvent diverger, et rien ne disait laquelle gagne. C'est le
--   genre de doublon qui ne se voit pas et qui produit un bug six mois plus
--   tard — quand quelqu'un change son objectif dans son profil et que son
--   assiette ne bouge pas.
--
-- LA RÈGLE
--   Bouche AVEC compte  → `student_goals.goal`, et lui seul.
--   Bouche SANS compte  → `household_members.goal`, posé par le maître.
--
--   Un titulaire qui n'a jamais rempli son « about you » n'a donc AUCUN
--   objectif — pas un objectif de repli. C'est voulu: sa direction de service
--   retombe sur « part équilibrée », exactement comme s'il n'avait rien
--   déclaré, et l'écran doit le lui dire.
--
-- CE QU'ON NE FAIT PAS, ET POURQUOI
--   Aucun rattrapage de données. Mesuré au moment d'écrire: zéro bouche avec
--   compte porte un `household_members.goal`, et les migrations du foyer n'ont
--   jamais été poussées. Écrire une recopie ici serait du code mort qui
--   prétendrait avoir servi.
-- ============================================================================

-- ── 1. LA LECTURE ───────────────────────────────────────────────────────────
-- Le roster est le SEUL endroit à changer: `keel_household_roster()` délègue à
-- `_for`, et les trois lecteurs (le générateur, le contexte de tour du chat,
-- l'écran du foyer) passent tous par l'un des deux. Résoudre ici, c'est
-- résoudre pour tout le monde — et aucun appelant ne peut oublier la règle.
--
-- ⚠️ `language sql` crée une DÉPENDANCE sur les colonnes citées: cette fonction
-- dépend désormais de `public.student_goals.goal`. Toute migration future qui
-- voudra la modifier devra dropper cette fonction d'abord.
create or replace function public.keel_household_roster_for(p_user uuid)
returns table (
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text
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
    end as goal
  from public.household_members hm
  left join public.student_goals sg on sg.user_id = hm.user_id
  -- LA GARDE, portée par l'ARGUMENT. Un `p_user` nul rend zéro ligne:
  -- `keel_household_of(null)` est nul, et `= null` n'est jamais vrai.
  where hm.household_id = public.keel_household_of(p_user)
  order by (hm.role = 'owner') desc, hm.joined_at;
$function$;

-- ── 2. L'ÉCRITURE ───────────────────────────────────────────────────────────
-- La RPC refuse désormais toute bouche qui a un compte — y compris le maître
-- pour lui-même. Sans ce refus, elle écrirait un champ que plus personne ne
-- lit: une écriture qui rend `ok: true` et ne change rien à l'assiette est
-- pire qu'une erreur, elle se croit faite.
create or replace function public.keel_household_set_member_goal(
  p_member uuid,
  p_goal text
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

  update public.household_members
     set goal = p_goal
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_roster_for(uuid) is
  'Le roster du foyer de p_user, pour les appelants SERVEUR (service_role), où '
  'auth.uid() est NULL. Le prénom et l''âge viennent de la LIGNE MEMBRE. '
  'L''OBJECTIF, lui, vient de `student_goals` dès que la bouche a un compte '
  '(D1, 2026-08-11): son « about you » fait autorité, et `household_members'
  '.goal` ne vaut plus que pour les bouches sans compte. Un titulaire sans '
  'ligne `student_goals` rend un objectif NUL — pas un repli.';

comment on function public.keel_household_set_member_goal(uuid, text) is
  'Pose l''objectif d''une bouche SANS COMPTE. Refuse `has_account` dès que la '
  'bouche en a un — y compris le maître pour lui-même: l''objectif d''un '
  'titulaire se change dans son « about you » (D1, 2026-08-11). Refuse '
  '`not_your_line` avant, pour qu''un secondaire visant la ligne d''un enfant '
  's''entende dire la bonne chose.';
