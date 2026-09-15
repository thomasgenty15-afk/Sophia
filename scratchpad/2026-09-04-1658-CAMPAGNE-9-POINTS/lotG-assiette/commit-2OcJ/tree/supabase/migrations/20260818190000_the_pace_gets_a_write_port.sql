-- ═══════════════════════════════════════════════════════════════════════════
-- L5 · LE RYTHME ET LE POIDS VISÉ OBTIENNENT UNE PORTE D'ÉCRITURE.
--
-- Conception: `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §Bloc 2.
-- Socle: migration `20260818100000` (lot L1).
--
-- ⚠️ NUMÉRO NON RÉSERVÉ PAR L'ORCHESTRATION, ET IL A DÉJÀ ÉTÉ DÉPLACÉ UNE FOIS.
-- Le tableau de `2026-08-18-ORCHESTRATION-CHANTIER-OBJECTIFS.md` §1 met « — »
-- sur L5, parce qu'on supposait les colonnes du socle écrivables. Elles ne
-- l'étaient pas. Ce fichier a d'abord porté `…140000`; il a été renuméroté en
-- `…190000` quand `…160000` et `…180000` (lot L0) se sont inscrits au registre
-- pendant son écriture — une migration posée AVANT le dernier cran appliqué est
-- **sautée en silence** par `supabase migration up`. Les lots suivants partent
-- donc de `…200000`, et vérifient le registre avant de choisir.
--
-- ── LE TROU QUE CETTE MIGRATION FERME, ET CELUI QU'ELLE NE FERME PLUS ──────
-- Le lot socle a livré quatre colonnes en les annonçant à L5 comme « les
-- colonnes à écrire ». Mesuré sur la base locale (`has_table_privilege`) avant
-- d'écrire une ligne — aucune des trois de foyer n'avait d'écrivain:
--
--   profiles.activity_level                    UPDATE à `authenticated`   ✅
--   household_member_bodies.activity_level     aucun grant, aucune RPC    ❌
--   household_members.target_weight_kg         aucun grant, aucune RPC    ❌
--   household_members.target_pace_kg_per_week  aucun grant, aucune RPC    ❌
--   student_goals.target_pace_kg_per_week      la colonne n'existait pas  ❌
--
-- ⚠️ LA LIGNE `activity_level` A ÉTÉ FERMÉE PAR LE LOT L0 PENDANT L'ÉCRITURE
-- DE CELLE-CI (`20260818160000`), et **mieux** que ce que ce fichier
-- proposait: il ajoutait une porte séparée pour éviter la surcharge, L0 a fait
-- un `drop` + `create` de `keel_household_set_member_body` — l'ancienne
-- signature disparaît, donc aucun appelant ne peut plus toucher la version qui
-- n'écrit rien. Ce bloc a été RETIRÉ d'ici plutôt que gardé en double: deux
-- portes pour une colonne, c'est la garantie qu'un écran en appellera une et un
-- autre l'autre.
--
-- Restent les DEUX que personne n'a prises: le poids visé et le rythme.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- Aucun vocabulaire neuf, aucune ligne réécrite, aucune garde levée. Une
-- colonne et une porte, calquées sur `keel_household_set_member_body` — mêmes
-- refus nommés, même `security definer`, même `search_path` vide, mêmes grants.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- ① LE RYTHME DE QUI A UN COMPTE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `student_goals` portait déjà `target_weight_kg`; il lui manquait le RYTHME,
-- alors que `household_members` a reçu les deux le matin même. L'asymétrie
-- donnait un curseur qui s'affiche pour tout le monde et ne se retient que
-- pour les bouches sans compte — c'est-à-dire, pour le compte maître, un
-- réglage qui revient à son défaut au rechargement.

alter table public.student_goals
  add column if not exists target_pace_kg_per_week numeric;

-- MÊME BORNE GROSSIÈRE QUE `household_members`, ET POUR LA MÊME RAISON: « une
-- limite d'UI n'est pas une limite ». Le plafond ADAPTÉ (le plus petit des
-- trois nombres de `weight_pace.ts`) dépend d'un corps qu'un CHECK ne peut pas
-- lire; celui-ci tient face à un appel direct de PostgREST.
alter table public.student_goals
  drop constraint if exists student_goals_target_pace_range_check;
alter table public.student_goals
  add constraint student_goals_target_pace_range_check
  check (target_pace_kg_per_week is null or (target_pace_kg_per_week > 0 and target_pace_kg_per_week <= 1));

-- ⚠️ ASYMÉTRIQUE AVEC `household_members_target_needs_direction_check`, ET
-- L'ÉCART EST VOULU. Là-bas, une CIBLE exige `fat_loss` ou `muscle_gain`. Ici,
-- `student_goals_target_weight_goal_check` autorise déjà les TROIS directions,
-- parce qu'un compte porte un point hebdo et qu'une `maintenance` y garde une
-- cible de RÉFÉRENCE (le centre d'une bande). Le RYTHME, lui, n'a de sens que
-- si la balance bouge: reprendre la règle de la cible ici laisserait quelqu'un
-- déclarer « je ne bouge pas, à 0,3 kg par semaine ».
alter table public.student_goals
  drop constraint if exists student_goals_target_pace_direction_check;
alter table public.student_goals
  add constraint student_goals_target_pace_direction_check
  check (target_pace_kg_per_week is null or goal in ('fat_loss', 'muscle_gain'));

comment on column public.student_goals.target_pace_kg_per_week is
  'Le rythme RÉGLÉ au curseur par quelqu''un qui a un compte, en kg/semaine. '
  'Jumeau de `household_members.target_pace_kg_per_week`, qui sert les bouches '
  'sans compte. Le plafond ici est la borne grossière (1 kg, décision du '
  '2026-08-18); le plafond RÉEL est le plus petit de trois nombres et se '
  'calcule sur le corps (`paceCeilingFor`). Écrit directement en PostgREST: '
  'RLS scope déjà la ligne au compte, et les deux CHECK tiennent la valeur.';

-- ══════════════════════════════════════════════════════════════════════════
-- ② LA CIBLE ET LE RYTHME D'UNE BOUCHE SANS COMPTE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LES DEUX ENSEMBLE, JAMAIS L'UN SANS L'AUTRE. Une cible sans rythme n'a
-- pas de date d'arrivée; un rythme sans cible ne mène nulle part. Deux portes
-- séparées auraient laissé un état où l'un est écrit et l'autre non, et c'est
-- l'écran qui aurait eu à s'en méfier.
--
-- ⚠️ ET `(null, null)` EFFACE — C'EST UNE DIFFÉRENCE ASSUMÉE AVEC LA PORTE DU
-- CRAN D'ACTIVITÉ, qui, elle, lit `null` comme « ne touche pas »
-- (`20260818160000`). Les deux règles sont justes parce que les deux champs ne
-- se dé-répondent pas de la même façon: il n'existe aucun écran pour retirer un
-- cran d'activité (pas de cinquième tuile « je ne sais pas »), alors que
-- repasser en `maintenance` RETIRE la cible par construction — le CHECK
-- `household_members_target_needs_direction_check` l'exige. Sans effacement, ce
-- basculement rendrait la ligne inécrivable.

create or replace function public.keel_household_set_member_target(
  p_member uuid,
  p_target_weight_kg numeric,
  p_pace_kg_per_week numeric
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
  v_target_member uuid;
  v_goal text;
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
  -- COMPTE MAÎTRE SEUL, comme le corps. Le poids visé de quelqu'un qui a un
  -- compte vit dans SA ligne `student_goals`, et un secondaire n'a rien à
  -- poser sur la ligne d'un enfant.
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select hm.member_id, hm.goal into v_target_member, v_goal
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target_member is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- LES DEUX, OU AUCUN.
  if (p_target_weight_kg is null) <> (p_pace_kg_per_week is null) then
    return jsonb_build_object('ok', false, 'reason', 'target_incomplete');
  end if;

  if p_target_weight_kg is not null then
    if p_target_weight_kg < 25 or p_target_weight_kg > 400 then
      return jsonb_build_object('ok', false, 'reason', 'bad_target_weight');
    end if;
    if p_pace_kg_per_week <= 0 or p_pace_kg_per_week > 1 then
      return jsonb_build_object('ok', false, 'reason', 'bad_pace');
    end if;
    -- MIROIR DU CHECK, ET REFUS NOMMÉ PLUTÔT QUE VIOLATION DE CONTRAINTE. Sans
    -- ce test, `household_members_target_needs_direction_check` remonterait une
    -- erreur PostgreSQL brute à l'écran; ici l'écran reçoit un jeton qu'il sait
    -- traduire, et il peut le dire À CÔTÉ du champ.
    if v_goal is null or v_goal not in ('fat_loss', 'muscle_gain') then
      return jsonb_build_object('ok', false, 'reason', 'target_needs_direction');
    end if;
  end if;

  update public.household_members
     set target_weight_kg = p_target_weight_kg,
         target_pace_kg_per_week = p_pace_kg_per_week
   where member_id = p_member;

  return jsonb_build_object('ok', true, 'member_id', p_member);
end;
$function$;

comment on function public.keel_household_set_member_target(uuid, numeric, numeric) is
  'Le poids visé ET le rythme d''une bouche SANS COMPTE — les deux ensemble, '
  'ou les deux à NULL (ce qui EFFACE, et c''est nécessaire: repasser en '
  '`maintenance` rend la ligne inécrivable tant que la cible est là). '
  '`target_needs_direction` est le miroir NOMMÉ du CHECK: sans lui, une cible '
  'posée sur `maintenance` remonterait une violation de contrainte PostgreSQL '
  'au milieu d''un entonnoir d''accueil. Le plafond ADAPTÉ à la personne (le '
  'plus petit des trois nombres de `weight_pace.ts`) ne peut pas s''écrire ici '
  '— il dépend d''un corps que cette porte ne lit pas; c''est `paceCeilingFor` '
  'qui décide du cran affiché, et ce plafond-ci est la borne grossière qui '
  'tient face à un appel direct.';

-- ⚠️ `from public, anon` — ET LES DEUX SONT NÉCESSAIRES, C'EST MESURÉ.
-- `pg_default_acl` de ce projet porte, pour les FONCTIONS du schéma `public`:
--   {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- Autrement dit `anon` reçoit un GRANT NOMMÉ sur toute fonction neuve, et un
-- `revoke … from public` ne le voit même pas — il retire le pseudo-rôle
-- `PUBLIC`, pas le rôle `anon`. La première application de ce fichier a échoué
-- sur la garde ③ ci-dessous, exactement là-dessus. La garde avait raison; c'est
-- cette ligne qui était incomplète. Même forme que `20260818160000` (lot L0).
revoke all on function public.keel_household_set_member_target(uuid, numeric, numeric) from public, anon;
grant execute on function public.keel_household_set_member_target(uuid, numeric, numeric) to authenticated;
grant execute on function public.keel_household_set_member_target(uuid, numeric, numeric) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- ③ LA PORTE EST-ELLE VRAIMENT FERMÉE À `anon` ?
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `revoke … from public` NE RETIRE PAS `anon`: si un `grant to anon`
-- traînait, il survivrait au revoke ci-dessus. Cicatrice mesurée
-- (`revoke-from-public-leaves-anon`), et une garde qui ne vérifie pas est une
-- garde qu'on croit avoir.
do $$
declare
  v_fn text := 'public.keel_household_set_member_target(uuid, numeric, numeric)';
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'MIGRATION 20260818190000: % est exécutable par anon', v_fn;
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'MIGRATION 20260818190000: % n''est PAS exécutable par authenticated', v_fn;
  end if;
end;
$$;
