-- LOT 4C — L'ÉCHELLE DES PORTIONS PASSE À CINQ CRANS.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CE QUE ÇA FERME — UN PRODUIT BLOQUÉ À −5 %, POUR TOUT LE MONDE
-- ══════════════════════════════════════════════════════════════════════════
-- Le questionnaire de fin de plan est le SEUL producteur de `portion.adjust`
-- (`docs/keel/NOMENCLATURE-MEMOIRE.md` §5, ligne ②), et il ne connaissait
-- qu'UN cran par sens: `too_much` / `not_enough`, traduits en `slight`.
--
-- Or un nouvel ajustement REMPLACE le précédent — il ne s'y ajoute jamais
-- (`winningPortionAdjust`, `_shared/keel/meal_envelope.ts`: « le cumul est
-- refusé », parce que `portion.adjust` est `durable` LITTÉRAL et n'expire
-- jamais). Conséquence mesurée: quelqu'un dont les parts sont énormément trop
-- grosses cochait « trop », recevait −5 %, recochait « trop » au bilan
-- suivant, recevait ENCORE −5 % — et restait là pour toujours. Le second cran
-- du moteur (`PORTION_ADJUST_STEP.clear` = −10 %) était INATTEIGNABLE par
-- tout le produit: aucune surface ne pouvait l'écrire.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ DEUX JETONS **NEUFS**. AUCUN JETON EXISTANT NE CHANGE DE SENS.
-- ══════════════════════════════════════════════════════════════════════════
--   `way_too_much`   NEUF      →  down / clear
--   `too_much`       existant  →  down / slight   (inchangé)
--   `right`          existant  →  aucun ajustement (inchangé)
--   `not_enough`     existant  →  up   / slight   (inchangé)
--   `way_not_enough` NEUF      →  up   / clear
--
-- Des réponses sont DÉJÀ ÉCRITES en base sous les trois anciens jetons, et
-- cette table n'a jamais réécrit une ligne d'hier — c'est la doctrine de
-- `_shared/keel/plan_feedback.ts`, écrite noir sur blanc sur la question
-- retirée `energy_around_sessions: « ce sont des RÉPONSES d'une personne à
-- une question qu'on lui a vraiment posée, et les traduire falsifierait ce
-- qu'elle a dit ». Remapper `too_much` vers `clear` retirerait de la
-- nourriture, RÉTROACTIVEMENT, à des gens qui n'ont jamais dit « vraiment
-- trop ». Aucun `update` sur les lignes existantes n'est donc fait ici, et
-- il ne faut pas en ajouter un.
--
-- ⚠️ LES LIBELLÉS À L'ÉCRAN, EUX, CHANGENT (« Trop » devient « Un peu trop »),
-- ET CE N'EST PAS UNE FALSIFICATION: le libellé décrit la POSITION sur une
-- échelle qui porte maintenant cinq crans, le jeton porte le sens archivé.
-- Ils vivent dans `OPTION_LABELS` (module partagé), jamais en base.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠️ LA SIGNATURE DE LA RPC NE BOUGE PAS — ET C'EST OBLIGATOIRE
-- ══════════════════════════════════════════════════════════════════════════
-- `create or replace function` avec une liste d'arguments DIFFÉRENTE ne
-- remplace rien: il crée une SURCHARGE, et PostgREST devant deux candidates
-- rend `PGRST203` — c'est-à-dire un questionnaire qui n'écrit plus rien, pour
-- tout le monde, sans qu'un seul test de code ne rougisse. Le lot 2A a déjà
-- payé ce piège (`20260818260000`), et il l'a fermé en DÉPOSANT l'ancienne
-- signature. Ici il n'y a rien à déposer: on remplace la fonction à
-- l'IDENTIQUE sur ses huit paramètres, seul le corps change.
--
-- ── RÉ-APPLICABLE ────────────────────────────────────────────────────────
-- `db reset` est interdit sur ce dépôt: tout ici doit repasser sur une base
-- qui a déjà vécu. D'où `drop constraint if exists` avant chaque `add`.

begin;

-- ---------------------------------------------------------------------------
-- 1. LA LISTE FERMÉE DE LA COLONNE
-- ---------------------------------------------------------------------------
-- ⚠️ ON DÉPOSE PUIS ON REPOSE, sans garde `if not exists`: la contrainte
-- EXISTE déjà (créée en ligne par `20260811090000`, donc nommée
-- `meal_plan_feedback_portions_check`), et une garde « si elle n'existe pas »
-- l'aurait laissée telle quelle — c'est-à-dire un élargissement qui ne
-- s'applique jamais, et deux jetons refusés par la base pendant que l'écran
-- les propose.

alter table public.meal_plan_feedback
  drop constraint if exists meal_plan_feedback_portions_check;

alter table public.meal_plan_feedback
  add constraint meal_plan_feedback_portions_check
  check (
    portions in (
      'way_too_much', 'too_much', 'right', 'not_enough', 'way_not_enough'
    )
  );

comment on column public.meal_plan_feedback.portions is
  'LECTEUR: le ré-ancrage de l''enveloppe de composition. C''est LA vérité '
  'terrain que le moteur n''a pas — il sait ce qu''il a composé, pas ce qui a '
  'suffi. NULL sous restriction_flag: la question n''est alors jamais posée. '
  'CINQ CRANS depuis le 2026-08-19: way_too_much (down/clear), too_much '
  '(down/slight), right (aucun ajustement), not_enough (up/slight), '
  'way_not_enough (up/clear). ⛔ LES TROIS ANCIENS JETONS GARDENT LEUR SENS: '
  'des réponses déjà écrites les portent, et les retraduire falsifierait ce '
  'qu''une personne a dit. La traduction jeton → cran vit dans '
  '`_shared/keel/plan_feedback.ts` (PORTION_ANSWER_ADJUST), et le cran devient '
  'une fraction de bande dans `meal_envelope.ts` (PORTION_ADJUST_STEP), en '
  'aval, là où le plancher A1 écrête.';

-- ---------------------------------------------------------------------------
-- 2. UN SUJET SANS MESURE N'EXISTE TOUJOURS PAS — SUR LES QUATRE RÉPONSES
-- ---------------------------------------------------------------------------
-- La contrainte du lot 2A ne connaissait que deux réponses non neutres. Ne pas
-- l'élargir aurait refusé la ligne de quelqu'un qui coche « vraiment trop »
-- PUIS nomme une bouche — c'est-à-dire, très exactement, un questionnaire qui
-- perd tout le retour de la personne la plus concernée par ce lot.

alter table public.meal_plan_feedback
  drop constraint if exists meal_plan_feedback_portions_subject_needs_measure;

alter table public.meal_plan_feedback
  add constraint meal_plan_feedback_portions_subject_needs_measure
  check (
    portions_subject is null
    or portions in (
      'way_too_much', 'too_much', 'not_enough', 'way_not_enough'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. L'ÉCRIVAIN — MÊME SIGNATURE, MÊME CORPS, QUATRE JETONS AU LIEU DE DEUX
-- ---------------------------------------------------------------------------
-- ⚠️ LA SEULE DIFFÉRENCE AVEC `20260818260000` EST LA LISTE DU `not in`. Le
-- corps est recopié en entier parce que `create or replace` remplace la
-- fonction ENTIÈRE: en garder une moitié était impossible, et écrire un
-- second écrivain à côté serait « le défaut n°1 de ce dépôt ».

create or replace function public.keel_plan_feedback_submit(
  p_meal_id uuid,
  p_cooked text,
  p_portions text,
  p_never_again jsonb,
  p_make_again jsonb,
  p_axis_question text,
  p_axis_answer text,
  p_portions_subject text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_locale text;
  v_written int;
  v_portions text := nullif(btrim(coalesce(p_portions, '')), '');
  v_subject text := nullif(btrim(coalesce(p_portions_subject, '')), '');
  v_member uuid;
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
    --
    -- ⚠️ QUATRE JETONS DEPUIS LE 2026-08-19, et cette liste est le JUMEAU de
    -- `PORTION_ANSWER_ADJUST` (_shared/keel/plan_feedback.ts) et de la
    -- contrainte `…_portions_subject_needs_measure` ci-dessus. En laisser une
    -- à deux jetons rendrait `subject_without_measure` à quelqu'un qui vient
    -- de cocher « vraiment trop » et de nommer une bouche: tout son retour
    -- perdu, pour la réponse que ce lot existe pour rendre possible.
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

  insert into public.meal_plan_feedback
    (user_id, meal_id, cooked, portions, portions_subject, never_again,
     make_again, axis_question, axis_answer, content_locale)
  values
    (v_user, p_meal_id,
     nullif(btrim(coalesce(p_cooked, '')), ''),
     v_portions,
     v_subject,
     coalesce(p_never_again, '[]'::jsonb),
     coalesce(p_make_again, '[]'::jsonb),
     nullif(btrim(coalesce(p_axis_question, '')), ''),
     nullif(btrim(coalesce(p_axis_answer, '')), ''),
     v_locale)
  on conflict (meal_id) do nothing;

  get diagnostics v_written = row_count;
  if v_written = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_answered');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. LES DROITS — RÉAFFIRMÉS, PAS SUPPOSÉS
-- ---------------------------------------------------------------------------
-- `create or replace` PRÉSERVE les privilèges — mais « préserve » est une
-- propriété d'un autre fichier que rien ici n'épingle, et la preuve du bas
-- l'exige. On les repose: c'est idempotent, et `revoke from public` ne retire
-- pas `anon` (leçon déjà payée par ce dépôt).

revoke all on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text, text) from public, anon;

grant execute on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. LA PREUVE
-- ---------------------------------------------------------------------------

do $$
declare
  probe uuid := gen_random_uuid();
  probe_meal uuid;
  -- ⚠️ UNE BOUCHE FICTIVE SUFFIT, ET C'EST VOULU. La contrainte de forme du
  -- lot 2A ne vérifie que la FORME du sujet (`household` ou `member:<uuid>`);
  -- l'appartenance au foyer n'est pas une propriété de la ligne — une `check`
  -- ne peut pas faire de sous-requête, et c'est la RPC qui la vérifie. Monter
  -- un vrai foyer ici prouverait donc quelque chose que ce bloc ne teste pas,
  -- au prix de deux tables de plus à garder en état.
  probe_member uuid := gen_random_uuid();
  fndef text;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  insert into public.student_generated_meals
    (user_id, scope, mode, servings, dishes, shopping_list, generated_from,
     content_locale, starts_on, duration_days)
  values (probe, 'day', 'to_shop', 1, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
          'fr-FR', current_date - 10, 7)
  returning id into probe_meal;

  -- ── LES CINQ CRANS PASSENT ────────────────────────────────────────────
  -- ⚠️ LES TROIS ANCIENS SONT DANS CETTE BOUCLE, ET C'EST LA MOITIÉ QU'ON
  -- OUBLIE: élargir une liste peut se faire en la RÉÉCRIVANT, et une liste
  -- réécrite qui aurait perdu `right` refuserait la réponse neutre — la plus
  -- fréquente des cinq — sans qu'aucun test de code ne le voie.
  for i in 1..5 loop
    insert into public.meal_plan_feedback
      (user_id, meal_id, portions, content_locale)
    values (probe, probe_meal,
            (array['way_too_much','too_much','right','not_enough','way_not_enough'])[i],
            'fr-FR');
    delete from public.meal_plan_feedback where meal_id = probe_meal;
  end loop;

  -- ── ET UNE VALEUR HORS LISTE EST TOUJOURS REFUSÉE ─────────────────────
  -- Sans ce cas, « la liste a été élargie » serait indiscernable de « la
  -- contrainte a été déposée et jamais reposée ».
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, portions, content_locale)
    values (probe, probe_meal, 'way_way_too_much', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: un jeton hors liste a été accepté';
  exception when check_violation then null;
  end;

  -- ── LE SUJET SUIT LES QUATRE RÉPONSES NON NEUTRES ─────────────────────
  insert into public.meal_plan_feedback
    (user_id, meal_id, portions, portions_subject, content_locale)
  values (probe, probe_meal, 'way_too_much', 'household', 'fr-FR');
  delete from public.meal_plan_feedback where meal_id = probe_meal;

  insert into public.meal_plan_feedback
    (user_id, meal_id, portions, portions_subject, content_locale)
  values (probe, probe_meal, 'way_not_enough',
          'member:' || probe_member::text, 'fr-FR');
  delete from public.meal_plan_feedback where meal_id = probe_meal;

  -- Et les deux anciens n'ont rien perdu.
  insert into public.meal_plan_feedback
    (user_id, meal_id, portions, portions_subject, content_locale)
  values (probe, probe_meal, 'too_much', 'household', 'fr-FR');
  delete from public.meal_plan_feedback where meal_id = probe_meal;

  -- ⛔ UN SUJET SANS MESURE N'EXISTE TOUJOURS PAS.
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, portions, portions_subject, content_locale)
    values (probe, probe_meal, 'right', 'household', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: un sujet sur une réponse neutre';
  exception when check_violation then null;
  end;

  -- ⛔ ET UN PRÉNOM N'EST TOUJOURS PAS UN SUJET (la contrainte de forme du
  -- lot 2A n'a pas été touchée — on le vérifie plutôt que de le supposer).
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, portions, portions_subject, content_locale)
    values (probe, probe_meal, 'way_too_much', 'member:marc', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: « member:marc » a été accepté';
  exception when check_violation then null;
  end;

  -- ── LA RPC CONNAÎT LES QUATRE JETONS ──────────────────────────────────
  -- Elle ne peut pas être appelée ici (`auth.uid()` est NULL hors session),
  -- alors on lit sa DÉFINITION. Sans ça, la base accepterait « vraiment
  -- trop » + une bouche pendant que la seule porte d'écriture le refuse en
  -- `subject_without_measure` — un questionnaire qui perd tout le retour.
  fndef := pg_get_functiondef(
    'public.keel_plan_feedback_submit(uuid, text, text, jsonb, jsonb, text, text, text)'::regprocedure);
  if position('way_too_much' in fndef) = 0
     or position('way_not_enough' in fndef) = 0 then
    raise exception 'la RPC ignore le second cran: un sujet sur « vraiment trop » serait refusé';
  end if;
  if position('too_much' in fndef) = 0 or position('not_enough' in fndef) = 0 then
    raise exception 'la RPC a PERDU les jetons d''origine en gagnant les neufs';
  end if;

  -- ⛔ ET IL N'Y A TOUJOURS QU'UNE CANDIDATE: deux signatures = `PGRST203`,
  -- c'est-à-dire un questionnaire qui n'écrit plus rien, en silence.
  if to_regprocedure(
       'public.keel_plan_feedback_submit(uuid, text, text, jsonb, jsonb, text, text)'
     ) is not null then
    raise exception 'la surcharge à 7 paramètres est revenue: PostgREST ne saura plus choisir';
  end if;

  -- Les droits n'ont pas bougé: la table reste fermée, la porte reste la RPC.
  if has_table_privilege('authenticated', 'public.meal_plan_feedback', 'INSERT') then
    raise exception 'authenticated peut écrire en direct — le revoke a sauté';
  end if;
  if has_function_privilege('anon',
       'public.keel_plan_feedback_submit(uuid, text, text, jsonb, jsonb, text, text, text)',
       'EXECUTE') then
    raise exception 'anon peut poser un retour';
  end if;
  if not has_function_privilege('authenticated',
       'public.keel_plan_feedback_submit(uuid, text, text, jsonb, jsonb, text, text, text)',
       'EXECUTE') then
    raise exception 'authenticated ne peut plus poser un retour: le grant a sauté';
  end if;

  delete from auth.users where id = probe;
end;
$$;

commit;
