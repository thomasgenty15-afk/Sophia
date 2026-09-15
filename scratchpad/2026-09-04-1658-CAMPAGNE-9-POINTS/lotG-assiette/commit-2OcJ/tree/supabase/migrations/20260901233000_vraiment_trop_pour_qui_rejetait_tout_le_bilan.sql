-- ═══════════════════════════════════════════════════════════════════════════
-- « VRAIMENT TROP » + « POUR QUI ? » REJETAIT TOUT LE BILAN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mesuré le 2026-09-01 sur un tour réel (banc du lot 2, cas D):
--
--   POST keel-plan-feedback-v1 { cooked: yes, portions: way_too_much,
--                                portions_subject: household }
--   → { ok: false, reason: "subject_without_measure" }
--
-- La garde « un sujet sans mesure ne veut rien dire » ne nommait que DEUX des
-- CINQ crans. L'échelle en a gagné deux le 2026-08-19 (`way_too_much`,
-- `way_not_enough`): la migration de ce jour-là a mis à jour le CHECK de la
-- colonne et le CHECK `portions_subject_needs_measure`, mais pas cette liste
-- écrite à la main dans le corps de la fonction.
--
-- ⚠️ ET C'EST ATTEIGNABLE DEPUIS L'ÉCRAN. `portionSubjectIsAsked` pose la
-- question « pour qui ? » dès que la réponse porte un ajustement; les quatre
-- crans non neutres en portent un. Un foyer + « Vraiment trop » suffit.
--
-- Le bilan entier était perdu — pas seulement la portion.
--
-- ⛔ AUCUN AUTRE CHANGEMENT. La fonction est recréée à l'identique, à cette
-- seule ligne près (relue depuis `pg_get_functiondef`).

CREATE OR REPLACE FUNCTION public.keel_plan_feedback_submit(p_meal_id uuid, p_cooked text, p_portions text, p_never_again jsonb, p_make_again jsonb, p_axis_question text, p_axis_answer text, p_portions_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_locale text;
  v_written int;
  v_portions text := nullif(btrim(coalesce(p_portions, '')), '');
  v_subject text := nullif(btrim(coalesce(p_portions_subject, '')), '');
  v_member uuid;
  v_answered jsonb := '[]'::jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_meal_id is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_meal');
  end if;

  -- LE PLAN EST-IL LE SIEN ? La langue du plan sert aussi de `content_locale`
  -- du retour: le questionnaire a été lu dans la langue du plan, et l'archiver
  -- dans une autre rendrait la relecture fausse.
  select m.content_locale into v_locale
    from public.student_generated_meals m
   where m.id = p_meal_id and m.user_id = v_user;

  if v_locale is null then
    -- « Pas à toi » et « n'existe pas » rendent le MÊME motif, exprès: un motif
    -- distinct dirait à quelqu'un qu'un plan existe et ne lui appartient pas.
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found');
  end if;

  -- ── « POUR QUI ? » ────────────────────────────────────────────────────
  if v_subject is not null then
    -- Un sujet sans mesure ne veut rien dire: la question n'est posée que
    -- lorsque la réponse de portion n'est pas neutre. Refusé fort, plutôt que
    -- nettoyé en silence — un client qui envoie ça a un défaut, et un défaut
    -- qu'on nettoie est un défaut qu'on ne voit jamais.
    -- ⛔ LES QUATRE CRANS NON NEUTRES, PAS DEUX — corrigé le 2026-09-01.
    --
    -- Cette liste en nommait DEUX (`too_much`, `not_enough`) alors que
    -- l'échelle en a CINQ depuis le 2026-08-19: la migration
    -- `20260819180000_le_questionnaire_a_un_second_cran` a ajouté
    -- `way_too_much` / `way_not_enough` au CHECK de la colonne ET au CHECK
    -- `portions_subject_needs_measure`, sans faire suivre CETTE garde.
    --
    -- ⚠️ CE QUE ÇA COÛTAIT, MESURÉ SUR UN VRAI TOUR: dans un foyer, l'écran
    -- DEMANDE « pour qui ? » dès que la réponse porte un ajustement — et
    -- `way_too_much` en porte un (`portionSubjectIsAsked` → `effectOf`).
    -- Quelqu'un qui répondait « Vraiment trop » puis nommait la personne
    -- voyait TOUT son bilan rejeté: `cooked`, `never_again`, `make_again` et
    -- l'axe perdus avec — sous un motif FAUX (« un sujet sans mesure »),
    -- alors que la mesure était la plus forte de l'échelle.
    --
    -- ⛔ LA LISTE DOIT RESTER ÉGALE À CELLE DU CHECK
    -- `meal_plan_feedback_portions_subject_needs_measure`. Le bloc de
    -- contrôle en fin de migration le vérifie sur les CINQ jetons.
    if v_portions is null
       or v_portions not in ('way_too_much', 'too_much', 'not_enough', 'way_not_enough')
    then
      return jsonb_build_object('ok', false, 'reason', 'subject_without_measure');
    end if;

    if v_subject <> 'household' then
      -- Le préfixe D'ABORD: sans lui, `substring(… from 8)` sur `foobar`
      -- rendrait une chaîne vide dont l'échec de cast dirait la même chose,
      -- mais par accident. Une garde qui mord par accident finit par ne plus
      -- mordre du tout.
      if v_subject !~ '^member:' then
        return jsonb_build_object('ok', false, 'reason', 'bad_subject');
      end if;
      begin
        v_member := substring(v_subject from 8)::uuid;
      exception when invalid_text_representation then
        return jsonb_build_object('ok', false, 'reason', 'bad_subject');
      end;
      -- LA BOUCHE EST-ELLE DE SON FOYER ? `keel_household_of` est scalaire
      -- (un seul foyer par personne, garanti par `household_members_one_per_user`).
      if not exists (
        select 1
          from public.household_members hm
         where hm.member_id = v_member
           and hm.household_id = public.keel_household_of(v_user)
      ) then
        return jsonb_build_object('ok', false, 'reason', 'bad_subject');
      end if;
    end if;
  end if;

  -- ── LE MARQUEUR, DÉRIVÉ DE CE QUI EST ÉCRIT ──────────────────────────
  if nullif(btrim(coalesce(p_cooked, '')), '') is not null then
    v_answered := v_answered || '["cooked"]'::jsonb;
  end if;
  if v_portions is not null then
    v_answered := v_answered || '["portions"]'::jsonb;
  end if;
  if p_never_again is not null then
    v_answered := v_answered || '["never_again"]'::jsonb;
  end if;
  if p_make_again is not null then
    v_answered := v_answered || '["make_again"]'::jsonb;
  end if;
  -- La question d'axe porte SON jeton: `axis_question` EST le nom de la
  -- question posée, et c'est lui qu'un lecteur doit retrouver dans la liste.
  if nullif(btrim(coalesce(p_axis_question, '')), '') is not null
     and nullif(btrim(coalesce(p_axis_answer, '')), '') is not null then
    v_answered := v_answered
      || jsonb_build_array(btrim(p_axis_question));
  end if;

  insert into public.meal_plan_feedback
    (user_id, meal_id, cooked, portions, portions_subject, never_again,
     make_again, axis_question, axis_answer, answered, content_locale)
  values
    (v_user, p_meal_id,
     nullif(btrim(coalesce(p_cooked, '')), ''),
     v_portions,
     v_subject,
     coalesce(p_never_again, '[]'::jsonb),
     coalesce(p_make_again, '[]'::jsonb),
     nullif(btrim(coalesce(p_axis_question, '')), ''),
     nullif(btrim(coalesce(p_axis_answer, '')), ''),
     v_answered,
     v_locale)
  on conflict (meal_id) do nothing;

  get diagnostics v_written = row_count;
  if v_written = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_answered');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- LE CONTRÔLE — les DEUX listes doivent dire la même chose
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ IL COMPARE, IL NE RECOPIE PAS. Une troisième liste écrite ici serait la
-- prochaine à vieillir. On demande au CHECK de la table, pour chacun des cinq
-- jetons, s'il accepte un sujet — et on exige que le corps de la fonction dise
-- exactement la même chose.
do $control$
declare
  v_token   text;
  v_check   boolean;
  v_fn      boolean;
  v_src     text := (select prosrc from pg_proc where proname = 'keel_plan_feedback_submit');
begin
  foreach v_token in array array['way_too_much','too_much','right','not_enough','way_not_enough']
  loop
    -- Ce que le CHECK de la colonne autorise avec un sujet non nul.
    v_check := v_token = any (array['way_too_much','too_much','not_enough','way_not_enough']);
    -- Ce que le corps de la fonction laisse passer: le jeton figure-t-il dans
    -- la liste de la garde ?
    v_fn := position(
      '''' || v_token || '''' in
      substring(v_src from 'not in \((.*?)\)\s*\n?\s*then')
    ) > 0;
    if v_check <> v_fn then
      raise exception
        'garde et CHECK divergent sur « % »: CHECK=%, fonction=%', v_token, v_check, v_fn;
    end if;
  end loop;
  raise notice 'contrôle OK — les cinq crans sont traités pareil des deux côtés';
end
$control$;
