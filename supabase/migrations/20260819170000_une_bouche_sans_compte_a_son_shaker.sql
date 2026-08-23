-- ============================================================================
-- UNE BOUCHE SANS COMPTE A DROIT À SON SHAKER
--
-- ── LE FAIT ────────────────────────────────────────────────────────────────
-- Demandé quatre fois le 2026-08-19. Le bloc « son shaker ou sa collation »
-- n'existait QUE pour une bouche ayant un compte, et ce n'était pas un `if`
-- d'écran à retirer: `fixed_intakes` vit dans
-- `student_goals.practical_constraints`, donc sur `user_id`. Une bouche sans
-- compte — un conjoint qu'on saisit, un enfant, le cas NOMINAL du foyer —
-- n'avait littéralement nulle part où le ranger, et afficher le champ aurait
-- écrit le shaker de quelqu'un d'autre sur la ligne du maître.
--
-- Le lecteur du moteur le disait déjà, en une ligne
-- (`household_fixed_intakes.ts`): `if (!mouth.userId) return empty;`
--
-- ── CE QUE CETTE MIGRATION POSE ────────────────────────────────────────────
-- Une colonne sur la LIGNE MEMBRE, exactement comme le régime et le rythme y
-- ont atterri avant elle, et pour la même raison: c'est la seule clé qu'une
-- bouche sans compte possède.
--
-- ⚠️ MÊME FORME QUE `practical_constraints.fixed_intakes`, AU JETON PRÈS.
-- `parseFixedIntakes` est l'unique lecteur du produit et il est tout-ou-rien
-- sur la composition déclarée; deux formes différentes pour la même chose
-- auraient forcé un second parseur, qui aurait divergé au premier ajustement.
-- Ce qui est stocké ici est donc CE QUE CE PARSEUR SAIT LIRE, et rien d'autre.
--
-- ⛔ LE PLAFOND N'EST PAS REDÉCLARÉ EN SQL. `MAX_FIXED_INTAKES` vit dans le
-- module moteur, et `parseFixedIntakes` écarte le surplus en le COMPTANT. Une
-- seconde borne ici refuserait l'écriture au lieu de l'écarter à la lecture —
-- deux comportements pour une même limite, et c'est celui qui refuse qui
-- surprendrait, parce qu'il n'a pas de mots à l'écran.
-- ============================================================================

alter table public.household_members
  add column if not exists fixed_intakes jsonb not null default '[]'::jsonb;

alter table public.household_members
  drop constraint if exists household_members_fixed_intakes_check;
alter table public.household_members
  add constraint household_members_fixed_intakes_check
  check (jsonb_typeof(fixed_intakes) = 'array');

comment on column public.household_members.fixed_intakes is
  'Les apports chiffrés d''une bouche — shaker, collation pesée. MÊME FORME que '
  '`student_goals.practical_constraints.fixed_intakes`, parce que '
  '`parseFixedIntakes` est le seul lecteur du produit. Existe parce qu''une '
  'bouche SANS COMPTE n''a pas de ligne `student_goals`: c''est le cas nominal '
  'du foyer (un enfant, un conjoint saisi), et il n''avait aucun endroit où '
  'poser un shaker.';

-- ---------------------------------------------------------------------------
-- LA PORTE
-- ---------------------------------------------------------------------------

create or replace function public.keel_household_set_member_fixed_intakes(
  p_member uuid,
  p_intakes jsonb
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
  v_target_household uuid;
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

  select hm.household_id into v_target_household
  from public.household_members hm
  where hm.member_id = p_member;

  if v_target_household is null or v_target_household <> v_household then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- ⛔ `null` EFFACE, ET C'EST UNE RÉPONSE. Retirer son shaker doit être
  -- possible; sans ce chemin, le bouton « Retirer » de l'écran ne pourrait que
  -- vider un brouillon, jamais la ligne.
  if p_intakes is null then
    update public.household_members set fixed_intakes = '[]'::jsonb
    where member_id = p_member;
    return jsonb_build_object('ok', true);
  end if;

  if jsonb_typeof(p_intakes) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_intakes');
  end if;

  update public.household_members set fixed_intakes = p_intakes
  where member_id = p_member;
  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_fixed_intakes(uuid, jsonb) is
  'Pose les apports chiffrés d''une bouche. Réservée au MAÎTRE de son foyer — '
  'c''est lui qui saisit pour une bouche sans compte. `null` efface. Motifs: '
  'not_authenticated, no_household, not_owner, not_a_member, bad_intakes.';

-- `revoke from public` NE RETIRE PAS `anon` — cicatrice 20260818200000.
revoke all on function public.keel_household_set_member_fixed_intakes(uuid, jsonb)
  from public, anon;
grant execute on function public.keel_household_set_member_fixed_intakes(uuid, jsonb)
  to authenticated;
