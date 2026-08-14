-- KEEL — LA TAILLE D'UN MOMENT, POUR UNE BOUCHE SANS COMPTE.
--
-- ── LE DÉFAUT, ET IL EST EXACTEMENT CELUI QU'ON VIENT DE FERMER DEUX FOIS ──
-- `student_goals.practical_constraints.eating_rhythm` porte `{slot, size}`
-- depuis le 2026-08-07: un compte peut dire « petit-déjeuner léger, gros
-- dîner », et `rhythmLines` (`meal_generation.ts`) le met dans la consigne.
-- `household_members.eating_rhythm`, posée le 2026-08-13, porte `{slot, at}` —
-- une clé MORTE (les deux `parseEatingRhythm` l'ignorent exprès) et PAS la
-- taille. Une bouche sans compte pouvait donc dire QUAND elle mange et jamais
-- COMBIEN, alors que la moitié de la table le pouvait.
--
-- ⚠️ CE N'EST PAS UNE COLONNE QUI CHANGE DE TYPE. Le jsonb accepte déjà
-- `{slot, size}` et le parseur le lit déjà: ce qui manquait est la GARDE. La
-- porte d'écriture ne validait QUE `slot`, donc `{"slot":"lunch","size":"huge"}`
-- entrait en base, y restait, et le parseur le rendait `size: null` — un no-op
-- silencieux, c'est-à-dire le mode d'échec que ce dépôt documente le plus. Une
-- valeur qu'on accepte sans la lire est une valeur qu'on n'a pas demandée.
--
-- ── R1 · LA LISTE EST FERMÉE, ET ELLE EST CELLE DU MOTEUR ─────────────────
-- `small` · `medium` · `large` — `MEAL_SIZES` (`_shared/keel/meal_generation.ts`).
-- `null` reste une valeur pleine: « il n'a pas dit », et le modèle compose ce
-- moment comme il l'entend. Exiger la taille ferait inventer une précision que
-- personne n'a — et le moteur la traiterait comme une contrainte.
--
-- ── R2 · LES LIGNES DÉJÀ ÉCRITES NE SONT PAS MIGRÉES ──────────────────────
-- `{"slot":"lunch","at":null}` reste valide et se lit `size: null`, c'est-à-dire
-- « personne n'a dit la taille » — ce qui est exact. Réécrire ces lignes pour y
-- poser une taille serait écrire un fait que personne n'a énoncé (« coche
-- automatique = faits faux indémentables »). `at` n'est pas non plus retiré:
-- une clé morte que les deux parseurs ignorent ne coûte rien, et un `update`
-- de masse sur la ligne de gens réels pour du confort de forme en coûterait.
--
-- ── R3 · PAS DE MOTIF NEUF ────────────────────────────────────────────────
-- Une taille hors liste rend `bad_rhythm`, le motif que la même fonction rend
-- déjà pour un moment hors liste. Un `bad_size` serait un mot de plus à
-- traduire pour une distinction que l'écran ne peut pas produire: les trois
-- valeurs y sont des boutons, pas un champ.
--
-- IDEMPOTENTE, REJOUABLE.

-- ---------------------------------------------------------------------------
-- 1. Ce que la colonne porte — dit dans son commentaire
-- ---------------------------------------------------------------------------

comment on column public.household_members.eating_rhythm is
  'Les moments où CETTE bouche mange, avec leur taille: '
  '`[{"slot":"breakfast","size":"small"}]` — la même forme que '
  '`student_goals.practical_constraints.eating_rhythm`, parce que le même '
  'parseur (`parseEatingRhythm`) lit les deux et que deux formes divergeraient. '
  '`size` est dans `small` | `medium` | `large` (`MEAL_SIZES`) ou absent/`null` '
  '= « personne n''a dit la taille », ce qui laisse le moment libre. La vieille '
  'clé `at` reste tolérée en LECTURE et n''est pas migrée: les deux parseurs '
  'l''ignorent depuis le 2026-08-07. `null` sur la colonne = personne ne l''a '
  'dit, la bouche mange aux moments de la maison; le tableau VIDE est refusé à '
  'l''écriture (`empty_rhythm`) parce qu''il dirait « elle ne mange jamais ». '
  'N''est lu que pour une bouche SANS compte: dès qu''elle en a un, son rythme '
  'vit dans son « about you », et c''est `keel_household_roster_for` qui tranche.';

-- ---------------------------------------------------------------------------
-- 2. La porte d'écriture — le vocabulaire de la TAILLE y entre
-- ---------------------------------------------------------------------------

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
  v_entry jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- LE VOCABULAIRE EST FERMÉ, ET IL EST VÉRIFIÉ ICI — LES DEUX CLÉS. Le parseur
  -- du moteur ignore en silence un moment ET une taille qu'il ne connaît pas:
  -- parfait pour lire, mais une écriture qui accepte n'importe quoi laisse une
  -- ligne dont personne ne voit qu'elle ne dit rien.
  if p_rhythm is not null then
    if jsonb_typeof(p_rhythm) <> 'array' then
      return jsonb_build_object('ok', false, 'reason', 'bad_rhythm');
    end if;
    if jsonb_array_length(p_rhythm) = 0 then
      -- « Elle ne mange jamais » n'est pas une réponse. Effacer se fait avec
      -- `null`, qui veut dire « comme la maison ».
      return jsonb_build_object('ok', false, 'reason', 'empty_rhythm');
    end if;
    for v_entry in select * from jsonb_array_elements(p_rhythm) loop
      if (v_entry ->> 'slot') is null or (v_entry ->> 'slot') not in (
        'breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'before_bed'
      ) then
        return jsonb_build_object('ok', false, 'reason', 'bad_rhythm');
      end if;
      -- ABSENTE OU `null` EST UNE VALEUR, et c'est la plus fréquente: « il n'a
      -- pas dit ». Les deux passent par le même test — `->>` rend NULL dans les
      -- deux cas, et c'est exactement la lecture qu'on veut.
      if (v_entry ->> 'size') is not null
         and (v_entry ->> 'size') not in ('small', 'medium', 'large') then
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
  'Pose les moments où une bouche SANS COMPTE mange, AVEC leur taille '
  '(`small` | `medium` | `large`, ou absente = « il n''a pas dit »). `null` '
  'efface (la bouche revient aux moments de la maison); le tableau vide est '
  'refusé (`empty_rhythm`) parce qu''il dirait « elle ne mange jamais ». Refuse '
  '`not_your_line`, `has_account` (son rythme est dans son « about you »), et '
  '`bad_rhythm` sur un moment hors des six OU une taille hors des trois.';

revoke all on function public.keel_household_set_member_rhythm(uuid, jsonb)
  from public, anon;
grant execute on function public.keel_household_set_member_rhythm(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le contrôle — les gestes rejoués, puis annulés
-- ---------------------------------------------------------------------------
--
-- ⚠️ IL SE DONNE UNE IDENTITÉ. Sans `request.jwt.claims`, `auth.uid()` est nul
-- et TOUS les appels rendraient `not_authenticated`: le bloc serait vert en ne
-- prouvant rien.
--
-- ⚠️ ET IL PROUVE UN CAS QUI PASSE. « Une garde qu'on n'a vue que refuser n'est
-- pas vérifiée »: le bloc écrit une taille pour de bon, la relit PAR LE ROSTER
-- — le seul lecteur qui compte — et rend la main par `rollback`.

do $do$
declare
  v_owner uuid;
  v_household uuid;
  v_mouth uuid;
  v_res jsonb;
  v_read jsonb;
begin
  select hm.household_id, hm.user_id into v_household, v_owner
    from public.household_members hm
   where hm.role = 'owner' and hm.user_id is not null
     and exists (
       select 1 from public.household_members o
        where o.household_id = hm.household_id and o.user_id is null
     )
   limit 1;
  if v_household is null then
    raise notice 'keel_household_set_member_rhythm: aucun foyer avec une bouche sans compte — contrôle SAUTÉ';
    return;
  end if;
  select hm.member_id into v_mouth
    from public.household_members hm
   where hm.household_id = v_household and hm.user_id is null
   limit 1;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );

  -- ① UNE TAILLE HORS DES TROIS EST REFUSÉE — la garde que cette migration pose.
  v_res := public.keel_household_set_member_rhythm(
    v_mouth, '[{"slot":"lunch","size":"enormous"}]'::jsonb);
  if v_res ->> 'reason' is distinct from 'bad_rhythm' then
    raise exception 'attendu bad_rhythm sur une taille hors liste, reçu %', v_res;
  end if;

  -- ② UN MOMENT HORS DES SIX RESTE REFUSÉ — la garde d'avant n'a pas bougé.
  v_res := public.keel_household_set_member_rhythm(
    v_mouth, '[{"slot":"brunch","size":"large"}]'::jsonb);
  if v_res ->> 'reason' is distinct from 'bad_rhythm' then
    raise exception 'attendu bad_rhythm sur un moment hors liste, reçu %', v_res;
  end if;

  -- ③ LE TABLEAU VIDE RESTE REFUSÉ.
  v_res := public.keel_household_set_member_rhythm(v_mouth, '[]'::jsonb);
  if v_res ->> 'reason' is distinct from 'empty_rhythm' then
    raise exception 'attendu empty_rhythm, reçu %', v_res;
  end if;

  -- ④ LE CAS QUI PASSE, AVEC TAILLE — et relu par le roster.
  v_res := public.keel_household_set_member_rhythm(
    v_mouth,
    '[{"slot":"breakfast","size":"small"},{"slot":"dinner","size":"large"}]'::jsonb);
  if v_res ->> 'ok' is distinct from 'true' then
    raise exception 'attendu ok, reçu %', v_res;
  end if;
  select r.eating_rhythm into v_read
    from public.keel_household_roster_for(v_owner) r
   where r.member_id = v_mouth;
  if v_read -> 0 ->> 'size' is distinct from 'small'
     or v_read -> 1 ->> 'size' is distinct from 'large' then
    raise exception 'le roster ne rend pas les tailles posées, reçu %', v_read;
  end if;

  -- ⑤ LE CAS QUI PASSE SANS TAILLE — « il n'a pas dit » reste exprimable.
  v_res := public.keel_household_set_member_rhythm(
    v_mouth, '[{"slot":"lunch","size":null},{"slot":"dinner"}]'::jsonb);
  if v_res ->> 'ok' is distinct from 'true' then
    raise exception 'attendu ok sans taille, reçu %', v_res;
  end if;

  -- ⑥ LA VIEILLE FORME `at` RESTE ACCEPTÉE — les lignes d'avant ne sont pas
  --    migrées, donc l'écriture qui les reproduit ne doit pas être refusée.
  v_res := public.keel_household_set_member_rhythm(
    v_mouth, '[{"slot":"lunch","at":null}]'::jsonb);
  if v_res ->> 'ok' is distinct from 'true' then
    raise exception 'attendu ok sur la vieille forme `at`, reçu %', v_res;
  end if;

  raise notice 'keel_household_set_member_rhythm: contrôle VERT (bad size, bad slot, empty, ok+taille relue, ok sans taille, ok forme `at`)';
  raise exception using errcode = 'triggered_action_exception',
    message = 'ROLLBACK_DU_CONTROLE';
exception
  when triggered_action_exception then
    if sqlerrm <> 'ROLLBACK_DU_CONTROLE' then raise; end if;
end
$do$;
