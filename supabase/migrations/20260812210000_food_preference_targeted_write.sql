-- ============================================================================
-- C3 ② — LA RÉCONCILIATION N'ÉCRASE PLUS LA COLONNE D'UN TIERS
-- ============================================================================
--
-- Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, §L6
-- « Ce qui n'est pas prouvé » n°6, et §C3 ②.
--
-- ── LE DÉFAUT, MESURÉ ──────────────────────────────────────────────────────
--
-- `food_preference_promotion_io.ts` écrivait:
--
--     .update({ practical_constraints: result.constraints })
--     .eq("user_id", userId)
--
-- c'est-à-dire la colonne ENTIÈRE, reconstruite à partir d'une copie lue ~10 ms
-- plus tôt DANS LA REQUÊTE DE QUELQU'UN D'AUTRE. Depuis L6 (D4), le maître qui
-- compose déclenche cette réconciliation pour CHAQUE titulaire à sa table: on
-- est passé de « le maître écrit sur sa propre ligne » à « le maître écrit sur
-- celle de tout le monde ». Un secondaire qui enregistre son rythme de repas ou
-- sa capacité de cuisine dans cette fenêtre voit sa modification effacée sans
-- un mot — aucune version, aucun `updated_at` comparé, aucune écriture par clé.
--
-- ── CE QU'ON ÉCRIT À LA PLACE, ET POURQUOI LES DEUX MOITIÉS ────────────────
--
--   ① UNE ÉCRITURE CIBLÉE. `jsonb_set` sur les deux SEULES clés que la
--      réconciliation possède (`food_preferences`, `food_preferences_origin`).
--      Tout le reste de `practical_constraints` — rythme de repas, capacité de
--      cuisine, absences, budget — est celui de la ligne VIVANTE, jamais celui
--      d'une copie. Une modification concurrente sur une AUTRE clé survit par
--      construction, et pas par condition.
--
--   ② UNE CONCURRENCE OPTIMISTE DANS LE PRÉDICAT. La clause `where` compare la
--      valeur LIVE de `food_preferences` à celle qu'on a lue. Deux gestes qui
--      touchent LA MÊME clé ne peuvent donc pas se recouvrir en silence: le
--      second ne trouve pas sa ligne et rend `stale_snapshot`.
--
--      ⚠️ LA GARDE EST DANS LE PRÉDICAT D'UN SEUL ÉNONCÉ, et c'est la
--      cicatrice de ce dépôt: `keel_validate_meal_plan` a payé la
--      lecture-puis-écriture le 2026-08-11, et L7 l'a re-payée sur le plafond
--      de fusions. Une relecture juste avant d'écrire ne ferme pas la fenêtre,
--      elle la rétrécit — et elle ressemble alors trait pour trait à une garde
--      qui marche.
--
-- ── CE QUE CETTE MIGRATION NE FAIT **PAS**, ET C'EST DÉLIBÉRÉ ──────────────
--
-- Elle ne préserve pas `student_goals.updated_at`. Le trigger
-- `student_goals_set_updated_at` est INCONDITIONNEL (`new.updated_at = now()`)
-- et PARTAGÉ (`tg_set_updated_at` sert plusieurs tables); le contourner
-- demanderait soit de le rendre conditionnel pour tout le monde, soit un
-- `session_replication_role = replica` qui désarmerait EN SILENCE tout trigger
-- futur sur cette table. Les deux coûtent plus qu'ils ne rapportent, pour deux
-- raisons écrites ici plutôt que découvertes plus tard:
--
--   a) la réconciliation n'écrit QUE quand le contenu change vraiment
--      (`result.changed`), donc `updated_at` dit une vérité sur LA LIGNE — « ce
--      qui est déclaré ici a changé ». Ce qu'il ne dit pas, c'est « cette
--      personne a agi », et ce n'est pas la question que son nom pose;
--   b) vérifié le 2026-08-12: aucun lecteur ne l'INTERPRÈTE — ni fonction edge,
--      ni écran, ni SQL, ni `order by`. Le seul consommateur est l'export RGPD,
--      qui la DUMPE telle quelle (allowlist `studentGoals` de
--      `account-export-v1`), et un dump ne se trompe pas de personne: il rend
--      l'octet de la ligne. Inventer un mécanisme pour un lecteur qui n'existe
--      pas serait ajouter de la dette au nom d'une dette.
--
-- Le jour où un lecteur apparaît, la réponse est de le faire lire ce qui
-- l'intéresse (le geste), pas de faire mentir un horodatage de ligne.
-- ============================================================================

create or replace function public.keel_write_food_preferences(
  p_user uuid,
  p_expected jsonb,
  p_preferences jsonb,
  p_origins jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- LES DEUX FORMES SONT EXIGÉES, et pas devinées. `food_preferences` est une
  -- LISTE de phrases, `food_preferences_origin` un OBJET texte -> provenance:
  -- écrire l'une à la place de l'autre casserait silencieusement le pont, et le
  -- seul symptôme serait une préférence rétractée qui revient.
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_preferences');
  end if;
  if p_origins is null or jsonb_typeof(p_origins) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'bad_origins');
  end if;

  -- ── L'ÉCRITURE, EN UN SEUL ÉNONCÉ ────────────────────────────────────────
  --
  -- `is not distinct from` et pas `=`: la clé peut être ABSENTE (jsonb NULL en
  -- SQL), et `null = null` vaut NULL, donc le `where` ne tirerait jamais sur
  -- une ligne qui n'a encore aucune préférence. C'est le trou exact que L7 a
  -- trouvé dans son propre bloc de contrôle (« une garde a besoin d'un cas qui
  -- échoue autant que d'un cas qui passe »).
  update public.student_goals sg
     set practical_constraints = jsonb_set(
           jsonb_set(
             coalesce(sg.practical_constraints, '{}'::jsonb),
             '{food_preferences}', p_preferences, true
           ),
           '{food_preferences_origin}', p_origins, true
         )
   where sg.user_id = p_user
     and coalesce(sg.practical_constraints -> 'food_preferences', 'null'::jsonb)
         is not distinct from coalesce(p_expected, 'null'::jsonb);
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'written', true);
  end if;

  -- ── POURQUOI RIEN N'A ÉTÉ ÉCRIT ──────────────────────────────────────────
  -- Cette lecture arrive APRÈS l'écriture: elle NOMME l'échec, elle ne le
  -- décide pas. L'inverse — lire pour décider, puis écrire — est exactement la
  -- lecture-puis-écriture que le prédicat ci-dessus existe pour éviter.
  if not exists (select 1 from public.student_goals where user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'stale_snapshot');
end;
$function$;

comment on function public.keel_write_food_preferences(uuid, jsonb, jsonb, jsonb) is
  'C3 ② — écrit les DEUX clés de préférences alimentaires sur student_goals, '
  'et elles seules: le reste de practical_constraints reste celui de la ligne '
  'vivante. La concurrence optimiste est dans le PRÉDICAT (p_expected comparé '
  'à la valeur live), jamais dans une relecture: refuse stale_snapshot au lieu '
  'd''écraser le geste d''un tiers. Réservée au SERVEUR — la réconciliation est '
  'déclenchée par la composition de QUELQU''UN D''AUTRE (L6/D4), donc auth.uid() '
  'n''est pas la personne concernée et ne peut pas servir de garde.';

-- ---------------------------------------------------------------------------
-- LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT implicite,
-- et toute fonction neuve est exécutable par tout le monde par défaut.
-- Cicatrice mesurée du dépôt.
revoke all on function public.keel_write_food_preferences(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.keel_write_food_preferences(uuid, jsonb, jsonb, jsonb)
  to service_role;

-- ============================================================================
-- CONTRÔLE — rejoué puis ANNULÉ. Il monte deux gestes concurrents, comme la
-- vraie course: le maître compose avec une copie, le secondaire écrit son
-- rythme entre-temps.
-- ============================================================================
do $$
declare
  v_user uuid;
  v_res jsonb;
  v_pc jsonb;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'C3 ② — aucun compte en base: contrôle sauté.';
    return;
  end if;

  -- On travaille sur une ligne RÉELLE, et on la remet telle quelle à la fin.
  -- Un décor qui inventerait un uuid tomberait sur la FK vers auth.users.
  if not exists (select 1 from public.student_goals where user_id = v_user) then
    raise notice 'C3 ② — ce compte n''a pas de student_goals: contrôle sauté.';
    return;
  end if;
  select practical_constraints into v_pc
    from public.student_goals where user_id = v_user;

  update public.student_goals
     set practical_constraints = jsonb_build_object(
           'food_preferences', jsonb_build_array('aime le poisson', 'pas de porc'),
           'food_preferences_origin', jsonb_build_object('aime le poisson',
             jsonb_build_object('item', 'i1')),
           'eating_rhythm', jsonb_build_array('breakfast'))
   where user_id = v_user;

  -- ① LE CAS QUI PASSE: la copie est à jour, l'écriture a lieu.
  v_res := public.keel_write_food_preferences(
    v_user,
    jsonb_build_array('aime le poisson', 'pas de porc'),
    jsonb_build_array('aime le poisson'),
    jsonb_build_object('aime le poisson', jsonb_build_object('item', 'i1')));
  if coalesce(v_res ->> 'ok', 'false') <> 'true' then
    raise exception 'C3 ② — une copie à jour a été refusée: %', v_res;
  end if;
  select practical_constraints into v_pc from public.student_goals where user_id = v_user;
  if v_pc -> 'food_preferences' <> jsonb_build_array('aime le poisson') then
    raise exception 'C3 ② — la clé n''a pas été écrite: %', v_pc;
  end if;

  -- ② LA MOITIÉ QUI COMPTE: une AUTRE clé, écrite entre-temps par son
  --    titulaire, SURVIT. Avant ce lot, elle était écrasée par la copie.
  update public.student_goals
     set practical_constraints = jsonb_set(
           practical_constraints, '{cooking_time_min}', '20'::jsonb, true)
   where user_id = v_user;
  v_res := public.keel_write_food_preferences(
    v_user,
    jsonb_build_array('aime le poisson'),
    jsonb_build_array(),
    jsonb_build_object());
  if coalesce(v_res ->> 'ok', 'false') <> 'true' then
    raise exception 'C3 ② — écriture ciblée refusée à tort: %', v_res;
  end if;
  select practical_constraints into v_pc from public.student_goals where user_id = v_user;
  if v_pc -> 'cooking_time_min' is null then
    raise exception 'C3 ② — la clé d''un tiers a été écrasée: %', v_pc;
  end if;
  if v_pc -> 'eating_rhythm' is null then
    raise exception 'C3 ② — le rythme de repas a été écrasé: %', v_pc;
  end if;

  -- ③ LA GARDE MORD: une copie périmée de LA MÊME clé ne s'écrit pas.
  v_res := public.keel_write_food_preferences(
    v_user,
    jsonb_build_array('aime le poisson'),   -- ce qu'on croyait lire
    jsonb_build_array('inventé'),
    jsonb_build_object());
  if coalesce(v_res ->> 'reason', '') <> 'stale_snapshot' then
    raise exception 'C3 ② — une copie périmée est passée: %', v_res;
  end if;
  select practical_constraints into v_pc from public.student_goals where user_id = v_user;
  if v_pc -> 'food_preferences' <> jsonb_build_array() then
    raise exception 'C3 ② — la copie périmée a quand même écrit: %', v_pc;
  end if;

  -- ④ LES FORMES ILLÉGALES SONT NOMMÉES, jamais devinées.
  v_res := public.keel_write_food_preferences(
    v_user, jsonb_build_array(), jsonb_build_object(), jsonb_build_object());
  if coalesce(v_res ->> 'reason', '') <> 'bad_preferences' then
    raise exception 'C3 ② — un objet est passé pour une liste: %', v_res;
  end if;

  raise exception 'C3 ② — contrôle OK, on annule tout';
exception
  when others then
    if sqlerrm <> 'C3 ② — contrôle OK, on annule tout' then
      raise;
    end if;
    raise notice 'C3 ② — contrôle passé (4 cas), état restauré par le rollback';
end $$;
