-- ============================================================================
-- L'APPORT FIXE DU TITULAIRE VA DANS SA SOURCE — ÉTAPE C1 DU 2026-09-12
--
-- ── LE DÉFAUT, MESURÉ, AVEC SON CHIFFRE ────────────────────────────────────
-- Tir n° 5 de la campagne des six tirs (2026-09-11, addendum C0 § A7 ⓐ) :
--
--   household_members.fixed_intakes              = [{breakfast, 200 g, greek_yogurt}]
--   student_goals.practical_constraints
--     -> 'fixed_intakes'                          = []
--   cible du petit-déjeuner servie                = 613,50 kcal
--   cible d'un tir SANS apport fixe               = 613,50 kcal  ← les mêmes
--
-- Le journal `keel.household_meal.fixed_intakes` n'est pas sorti, et le prompt
-- n'a jamais nommé le yaourt. La déclaration a été ACCEPTÉE par cette porte,
-- rangée dans une colonne que le moteur ne lit pas pour cette bouche-là, et
-- perdue en silence.
--
-- LA CAUSE EST ICI, PAS DANS LE LECTEUR. `household_fixed_intakes.ts` ~243 lit
-- `household_members.fixed_intakes` UNIQUEMENT pour une bouche SANS compte —
-- et il a raison : la source canonique d'un titulaire est
-- `student_goals.practical_constraints.fixed_intakes`, c'est celle que
-- l'entonnoir écrit et celle que la lane individuelle relit. C'est cette
-- PORTE-CI qui écrivait à côté.
--
-- ⚠️ ET LA PORTE SŒUR NE SE COMPORTAIT DÉJÀ PAS PAREIL.
-- `keel_household_set_member_rhythm` (migration 20260814120000) REFUSE un
-- titulaire : `has_account`, « son rythme vit dans SON "about you" ». Deux
-- portes jumelles, deux comportements sur la même question — et c'est celle
-- qui ACCEPTE qui a coûté le tir 5, parce qu'un refus se voit et qu'une
-- écriture orpheline ne se voit pas.
--
-- ── CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS ────────────────
-- ① La porte ROUTE au lieu d'écrire toujours au même endroit :
--      · bouche AVEC compte  → student_goals.practical_constraints.fixed_intakes
--      · bouche SANS compte  → household_members.fixed_intakes  (inchangé)
--    ⛔ Pas un refus `has_account` comme la sœur du rythme : l'appelant qui a
--    le `member_id` sous la main (la fiche du foyer, le banc) n'a pas
--    forcément le `user_id`, et lui rendre un refus l'obligerait à refaire ici
--    l'arbitrage que cette fonction est la seule à pouvoir trancher. La
--    réponse porte donc `wrote`, pour qu'aucun appelant n'ait à le deviner.
--
-- ② Elle RECOPIE les valeurs orphelines déjà écrites, et SEULEMENT quand la
--    source canonique est vide. ⛔ Jamais une addition : deux déclarations du
--    même pot compteraient le même yaourt deux fois, dans le sens qui fait
--    maigrir un plan. La colonne orpheline n'est PAS effacée — un `update` de
--    masse sur la ligne de gens réels pour du confort de forme coûte plus que
--    la clé morte qu'il retire, et le lecteur donne désormais la priorité à la
--    source canonique de toute façon.
--
-- ③ Elle ne touche AUCUNE migration historique, ni la colonne
--    `household_members.fixed_intakes`, qui reste le stock légitime d'une
--    bouche sans compte.
--
-- IDEMPOTENTE, REJOUABLE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. LA PORTE — elle route, et elle dit où elle a écrit
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
  v_target_user uuid;
  v_payload jsonb;
  v_touched int;
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

  select hm.household_id, hm.user_id into v_target_household, v_target_user
  from public.household_members hm
  where hm.member_id = p_member;

  if v_target_household is null or v_target_household <> v_household then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- ⛔ `null` EFFACE, ET C'EST UNE RÉPONSE — la règle de 20260819170000, gardée
  -- mot pour mot. Retirer son shaker doit rester possible des deux côtés.
  if p_intakes is null then
    v_payload := '[]'::jsonb;
  elsif jsonb_typeof(p_intakes) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_intakes');
  else
    v_payload := p_intakes;
  end if;

  -- ── ① LA BOUCHE A UN COMPTE : SA SOURCE EST `student_goals` ────────────
  if v_target_user is not null then
    -- ⚠️ `||` ET PAS UN `jsonb_build_object` SEUL. `practical_constraints`
    -- porte AUSSI le rythme, la capacité de cuisine et les goûts : écrire un
    -- objet neuf effacerait tout ce que cette porte ne connaît pas. C'est la
    -- cicatrice « `current` périmé efface l'écriture d'avant », payée deux fois
    -- sur cette colonne exacte.
    update public.student_goals sg
       set practical_constraints =
             coalesce(sg.practical_constraints, '{}'::jsonb)
             || jsonb_build_object('fixed_intakes', v_payload)
     where sg.user_id = v_target_user;
    get diagnostics v_touched = row_count;
    if v_touched = 0 then
      -- ⛔ PAS DE LIGNE = REFUS NOMMÉ, JAMAIS UN SUCCÈS. Même motif que
      -- `ownShakerWriter` côté écran (`no_goal_row`) : un `insert` d'office
      -- créerait une ligne d'objectif que personne n'a demandée, et un `ok`
      -- muet rendrait exactement le silence que cette migration ferme.
      return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
    end if;
    return jsonb_build_object('ok', true, 'wrote', 'student_goals');
  end if;

  -- ── ② LA BOUCHE N'A PAS DE COMPTE : SA LIGNE EST SON SEUL SUPPORT ──────
  update public.household_members
     set fixed_intakes = v_payload
   where member_id = p_member;
  return jsonb_build_object('ok', true, 'wrote', 'household_members');
end;
$function$;

comment on function public.keel_household_set_member_fixed_intakes(uuid, jsonb) is
  'Pose les apports chiffrés d''une bouche. Réservée au MAÎTRE de son foyer. '
  'ROUTE selon la bouche: AVEC compte -> '
  '`student_goals.practical_constraints.fixed_intakes` (la source canonique, '
  'celle que le moteur lit pour un titulaire); SANS compte -> '
  '`household_members.fixed_intakes`. La réponse porte `wrote` pour que '
  'l''appelant n''ait pas à deviner. `null` efface. Motifs: not_authenticated, '
  'no_household, not_owner, not_a_member, bad_intakes, no_goal_row (compte sans '
  'ligne `student_goals`).';

revoke all on function public.keel_household_set_member_fixed_intakes(uuid, jsonb)
  from public, anon;
grant execute on function public.keel_household_set_member_fixed_intakes(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. LES VALEURS ORPHELINES DÉJÀ ÉCRITES — recopiées, jamais additionnées
-- ---------------------------------------------------------------------------
--
-- ⚠️ LA CONDITION EST « LA SOURCE CANONIQUE EST VIDE », et rien d'autre. Une
-- source canonique déjà renseignée GAGNE : c'est elle que l'entonnoir et la
-- lane individuelle écrivent, et écraser une déclaration vivante par une
-- déclaration orpheline remplacerait le pot d'aujourd'hui par celui d'avant.
--
-- ⚠️ ET LA COLONNE ORPHELINE RESTE. Le lecteur lui donne désormais un rôle
-- explicite (repli documenté quand la source canonique est vide); l'effacer
-- ici ferait une écriture de masse sur des lignes réelles pour retirer une
-- valeur devenue inoffensive.

do $do$
declare
  v_moved int := 0;
begin
  with orphelines as (
    select hm.user_id, hm.fixed_intakes
      from public.household_members hm
      join public.student_goals sg on sg.user_id = hm.user_id
     where hm.user_id is not null
       and jsonb_typeof(hm.fixed_intakes) = 'array'
       and jsonb_array_length(hm.fixed_intakes) > 0
       and coalesce(
             jsonb_array_length(
               case
                 when jsonb_typeof(sg.practical_constraints -> 'fixed_intakes') = 'array'
                   then sg.practical_constraints -> 'fixed_intakes'
                 else '[]'::jsonb
               end
             ),
             0
           ) = 0
  )
  update public.student_goals sg
     set practical_constraints =
           coalesce(sg.practical_constraints, '{}'::jsonb)
           || jsonb_build_object('fixed_intakes', o.fixed_intakes)
    from orphelines o
   where sg.user_id = o.user_id;
  get diagnostics v_moved = row_count;
  raise notice 'apports fixes orphelins recopiés vers la source canonique: %', v_moved;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. LE CONTRÔLE — un cas qui MORD et un cas qui PASSE, puis `rollback`
-- ---------------------------------------------------------------------------
--
-- ⚠️ IL SE DONNE UNE IDENTITÉ. Sans `request.jwt.claims`, `auth.uid()` est nul
-- et TOUS les appels rendraient `not_authenticated`: le bloc serait vert en ne
-- prouvant rien. Même garde que le contrôle de `set_member_rhythm`.
--
-- ⚠️ ET IL PROUVE LES DEUX ROUTES. « Une garde qu'on n'a vue que refuser n'est
-- pas vérifiée »: le titulaire écrit POUR DE BON dans `student_goals`, la
-- bouche sans compte POUR DE BON sur sa ligne, et les deux sont relues avant
-- le `rollback`.

do $do$
declare
  v_owner uuid;
  v_owner_member uuid;
  v_household uuid;
  v_mouth uuid;
  v_res jsonb;
  v_canonique jsonb;
  v_orpheline jsonb;
  v_ligne jsonb;
begin
  select hm.household_id, hm.user_id, hm.member_id
    into v_household, v_owner, v_owner_member
    from public.household_members hm
   where hm.role = 'owner' and hm.user_id is not null
     and exists (select 1 from public.student_goals sg where sg.user_id = hm.user_id)
     and exists (
       select 1 from public.household_members o
        where o.household_id = hm.household_id and o.user_id is null
     )
   limit 1;
  if v_household is null then
    raise notice 'keel_household_set_member_fixed_intakes: aucun foyer avec un titulaire à objectif ET une bouche sans compte — contrôle SAUTÉ';
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

  -- ① LE CAS QUI MORD — le titulaire. AVANT cette migration, cette écriture
  --    partait dans `household_members.fixed_intakes` et le moteur ne la
  --    lisait jamais.
  v_res := public.keel_household_set_member_fixed_intakes(
    v_owner_member,
    '[{"food_ref":"greek_yogurt","label":"yaourt","amount":200,"unit":"g","days":[],"slot":"breakfast","replaces_meal":false}]'::jsonb
  );
  if (v_res ->> 'ok') <> 'true' or (v_res ->> 'wrote') <> 'student_goals' then
    raise exception 'titulaire: attendu ok+student_goals, reçu %', v_res;
  end if;
  select sg.practical_constraints -> 'fixed_intakes' into v_canonique
    from public.student_goals sg where sg.user_id = v_owner;
  if coalesce(jsonb_array_length(v_canonique), 0) <> 1 then
    raise exception 'titulaire: la source canonique devait porter 1 apport, elle porte %', v_canonique;
  end if;
  select hm.fixed_intakes into v_orpheline
    from public.household_members hm where hm.member_id = v_owner_member;
  if coalesce(jsonb_array_length(v_orpheline), 0) <> 0 then
    raise exception 'titulaire: la colonne orpheline ne doit RIEN recevoir, elle porte %', v_orpheline;
  end if;

  -- ② LE CAS QUI PASSE — une bouche sans compte garde son stock.
  v_res := public.keel_household_set_member_fixed_intakes(
    v_mouth,
    '[{"food_ref":"milk","label":"lait","amount":150,"unit":"ml","days":[]}]'::jsonb
  );
  if (v_res ->> 'ok') <> 'true' or (v_res ->> 'wrote') <> 'household_members' then
    raise exception 'bouche sans compte: attendu ok+household_members, reçu %', v_res;
  end if;
  select hm.fixed_intakes into v_ligne
    from public.household_members hm where hm.member_id = v_mouth;
  if coalesce(jsonb_array_length(v_ligne), 0) <> 1 then
    raise exception 'bouche sans compte: sa ligne devait porter 1 apport, elle porte %', v_ligne;
  end if;

  -- ③ ET UN JETON HORS FORME RESTE REFUSÉ, par la même porte.
  v_res := public.keel_household_set_member_fixed_intakes(v_mouth, '{"pas":"un tableau"}'::jsonb);
  if (v_res ->> 'reason') <> 'bad_intakes' then
    raise exception 'un objet n''est pas un tableau: attendu bad_intakes, reçu %', v_res;
  end if;

  raise notice 'keel_household_set_member_fixed_intakes: les deux routes vérifiées, écritures annulées';
  -- ⚠️ UN CODE D'ERREUR À PART, PAS UN MESSAGE. C'est le patron du contrôle de
  -- `set_member_rhythm`: `raise exception '…'` rend P0001, exactement comme les
  -- échecs de contrôle ci-dessus — les distinguer par leur texte ferait avaler
  -- un vrai rouge le jour où quelqu'un reformule une phrase.
  raise exception using errcode = 'triggered_action_exception',
    message = 'ROLLBACK_DU_CONTROLE';
exception
  when triggered_action_exception then
    if sqlerrm <> 'ROLLBACK_DU_CONTROLE' then raise; end if;
end
$do$;
