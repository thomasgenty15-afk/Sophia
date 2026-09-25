-- ===========================================================================
-- « DEHORS » DEVIENT « ABSENT » — 2026-09-24
--
-- Décision du propriétaire: l'état de présence « je mange dehors »
-- (`away_days[].kind = 'eating_out'`, 20260818120000) est retiré. Plus aucun
-- écran ne l'écrit: la grille à trois états n'a aucun appelant, et le
-- formulaire « déjeuner au travail » est parti avec 11cd1862.
--
-- 1. Les cases existantes deviennent des absences (`kind: 'away'`). Le plan ne
--    les composait déjà pas: un « dehors » était une absence de la table. Seul
--    le conseil chiffré du midi, retiré du code, les distinguait.
-- 2. La base refuse désormais `eating_out`, à l'écriture comme en contrainte.
-- 3. La porte du « déjeuner au travail » (`keel_household_set_member_work_lunch`)
--    et son aide (`keel_away_with_work_lunch`) sont supprimées: aucun appelant,
--    et c'était le seul écrivain SQL capable de remettre un « dehors ». La
--    colonne `household_members.work_lunch` et ses réponses restent: une
--    gamelle déclarée continue de rendre le déjeuner transportable.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LES DONNÉES, AVANT LA GARDE — la contrainte resserrée plus bas refuserait
--    sinon les lignes qu'on est en train de corriger.
-- ---------------------------------------------------------------------------

update public.household_members hm
   set away_days = (
     select coalesce(
       jsonb_agg(
         case
           when jsonb_typeof(t.e) = 'object' and (t.e ->> 'kind') = 'eating_out'
             then jsonb_set(t.e, '{kind}', '"away"'::jsonb)
           else t.e
         end
         order by t.ord
       ),
       '[]'::jsonb
     )
     from jsonb_array_elements(hm.away_days) with ordinality as t(e, ord)
   )
 where jsonb_typeof(hm.away_days) = 'array'
   and exists (
     select 1
     from jsonb_array_elements(hm.away_days) as e
     where jsonb_typeof(e) = 'object' and (e ->> 'kind') = 'eating_out'
   );

-- Les cases que la personne a écrites pour elle-même. Aucune contrainte ne
-- porte `kind` sur cette colonne; la conversion est la même.
update public.student_goals sg
   set practical_constraints = jsonb_set(
     sg.practical_constraints,
     '{away_days}',
     (
       select coalesce(
         jsonb_agg(
           case
             when jsonb_typeof(t.e) = 'object' and (t.e ->> 'kind') = 'eating_out'
               then jsonb_set(t.e, '{kind}', '"away"'::jsonb)
             else t.e
           end
           order by t.ord
         ),
         '[]'::jsonb
       )
       from jsonb_array_elements(sg.practical_constraints -> 'away_days')
         with ordinality as t(e, ord)
     )
   )
 where jsonb_typeof(sg.practical_constraints -> 'away_days') = 'array'
   and exists (
     select 1
     from jsonb_array_elements(sg.practical_constraints -> 'away_days') as e
     where jsonb_typeof(e) = 'object' and (e ->> 'kind') = 'eating_out'
   );

-- ---------------------------------------------------------------------------
-- 2. LA GARDE — un seul jeton `kind` reste admis: `away`. Une entrée sans
--    `kind` vaut toujours `away`.
-- ---------------------------------------------------------------------------

create or replace function public.keel_away_kinds_ok(p_away jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select coalesce(
    bool_and(
      jsonb_typeof(e) <> 'object'
      or not (e ? 'kind')
      or (e ->> 'kind') = 'away'
    ),
    -- UN TABLEAU VIDE EST VALIDE, et c'est le cas nominal: `bool_and` sur zéro
    -- ligne rend NULL. On le dit plutôt que de s'en remettre à la lecture
    -- qu'une contrainte `check` fait d'un NULL.
    true
  )
  from jsonb_array_elements(
    case when jsonb_typeof(p_away) = 'array' then p_away else '[]'::jsonb end
  ) as e;
$function$;

comment on function public.keel_away_kinds_ok(jsonb) is
  'Le jeton `kind` d''une entrée d''absence: `away` seul (2026-09-24 — '
  '`eating_out` retiré). Une entrée SANS `kind` est valide et vaut `away`.';

create or replace function public.keel_household_set_member_away(
  p_member uuid,
  p_away jsonb
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
  v_entry jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- LA FORME EST REFUSÉE ICI, LE CONTENU NE L'EST PAS. Un tableau dont une
  -- entrée nomme un jour inconnu est ACCEPTÉ: `parseAwayDays` l'écartera à la
  -- lecture et gardera les autres (FF-002 §7).
  if p_away is null or jsonb_typeof(p_away) <> 'array'
     or jsonb_array_length(p_away) > 42 then
    return jsonb_build_object('ok', false, 'reason', 'bad_away');
  end if;

  -- LE VOCABULAIRE DE `kind` EST FERMÉ: `away` seul depuis le 2026-09-24.
  -- Un jeton qui ne se voit pas à la lecture (il est lu `away`) doit être
  -- refusé à l'écriture, sans quoi il dort en base jusqu'à ce que quelqu'un
  -- le prenne pour un état supporté — c'est exactement ce que `eating_out`
  -- serait devenu.
  for v_entry in select * from jsonb_array_elements(p_away) loop
    if jsonb_typeof(v_entry) = 'object'
       and v_entry ? 'kind'
       and (v_entry ->> 'kind') is distinct from 'away' then
      return jsonb_build_object('ok', false, 'reason', 'bad_away_kind');
    end if;
  end loop;

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

  update public.household_members
     set away_days = p_away
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_away(uuid, jsonb) is
  'Marque les moments où une bouche n''est pas là (D14, 2026-08-12). Chaque '
  'entrée peut porter `kind` = away (seul jeton admis depuis le 2026-09-24, '
  '`eating_out` retiré). Un `kind` hors vocabulaire est refusé '
  '(`bad_away_kind`) parce qu''il serait lu `away` sans bruit. Le maître peut '
  'viser N''IMPORTE QUELLE bouche de son foyer, Y COMPRIS une qui a un compte. '
  'Motifs: not_authenticated | bad_away | bad_away_kind | no_household | '
  'not_a_member | not_your_line.';

-- ---------------------------------------------------------------------------
-- 3. LA PORTE DU « DÉJEUNER AU TRAVAIL » — sans appelant, seul écrivain restant
--    de `eating_out`.
-- ---------------------------------------------------------------------------

drop function if exists public.keel_household_set_member_work_lunch(uuid, jsonb);
drop function if exists public.keel_away_with_work_lunch(jsonb, text);

comment on table public.household_traditions is
  'Les jours que le foyer NE DÉPLACE PAS (③, 2026-08-20). Un fait PERMANENT, '
  'claveté sur un jour de SEMAINE et un moment — pas une envie datée '
  '(`household_envy_submissions`, clavetée sur `week_start`, n''est pas le bon '
  'support). ⛔ Ne porte QUE la forme positive (« dimanche rôti »): « samedi on '
  'commande » s''écrit comme une absence sur `away_days` (l''état « dehors » a '
  'été retiré le 2026-09-24), et en faire une seconde écriture donnerait deux '
  'magasins pour un même fait. ⛔ AUCUN privilège à `anon` ni `authenticated`, '
  'et RLS armée sans policy (`20260820161000`): les privilèges par défaut de '
  'Supabase les avaient tous donnés, TRUNCATE compris, et TRUNCATE échappe à '
  'RLS. La lecture passe par `keel_household_traditions()` (navigateur) ou '
  '`keel_household_traditions_for(uuid)` (serveur).';

-- ---------------------------------------------------------------------------
-- 4. LE CONTRÔLE — il échoue la migration plutôt que de la laisser à moitié.
-- ---------------------------------------------------------------------------

do $$
declare
  v_left int;
begin
  select count(*) into v_left
  from public.household_members hm,
       jsonb_array_elements(
         case when jsonb_typeof(hm.away_days) = 'array' then hm.away_days
              else '[]'::jsonb end
       ) as e
  where jsonb_typeof(e) = 'object' and (e ->> 'kind') = 'eating_out';
  if v_left > 0 then
    raise exception 'dehors_devient_absent: % entrée(s) eating_out restent sur household_members', v_left;
  end if;

  select count(*) into v_left
  from public.student_goals sg,
       jsonb_array_elements(
         case when jsonb_typeof(sg.practical_constraints -> 'away_days') = 'array'
              then sg.practical_constraints -> 'away_days' else '[]'::jsonb end
       ) as e
  where jsonb_typeof(e) = 'object' and (e ->> 'kind') = 'eating_out';
  if v_left > 0 then
    raise exception 'dehors_devient_absent: % entrée(s) eating_out restent sur student_goals', v_left;
  end if;

  -- LA GARDE A UN CAS QUI PASSE ET UN CAS QUI REFUSE.
  if not public.keel_away_kinds_ok('[{"day":"tue","slots":["lunch"],"kind":"away"},{"day":"wed"}]'::jsonb) then
    raise exception 'dehors_devient_absent: la garde refuse une absence valide';
  end if;
  if public.keel_away_kinds_ok('[{"day":"tue","slots":["lunch"],"kind":"eating_out"}]'::jsonb) then
    raise exception 'dehors_devient_absent: la garde accepte encore eating_out';
  end if;

  if to_regprocedure('public.keel_household_set_member_work_lunch(uuid,jsonb)') is not null
     or to_regprocedure('public.keel_away_with_work_lunch(jsonb,text)') is not null then
    raise exception 'dehors_devient_absent: la porte du déjeuner au travail existe encore';
  end if;
end;
$$;
