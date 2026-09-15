-- ═══════════════════════════════════════════════════════════════════════════
-- LE BILAN DEMANDE CE QU'IL DEVINAIT — lot B du chantier « la mémoire à trois
-- destinations » (2026-09-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Autorité produit : `docs/keel/NOMENCLATURE-MEMOIRE.md` §2.1 ②, §2.4 (les
-- quatre indices), §8.2 (les cas du banc). Conception :
-- `scratchpad/2026-09-03-1530-B-questionnaire-indices.md`.
--
-- ── LE DÉFAUT QUE ÇA FERME ────────────────────────────────────────────────
-- `cooked = no | partly` déplaçait DEUX réglages tout seul : le temps de
-- session (−15 ou −10 minutes) ET la difficulté des recettes (un cran plus
-- simple). Une réponse unique, deux déductions — le produit décidait lequel des
-- deux problèmes la personne avait eu, et bougeait les deux pour être sûr. Et
-- le delta de minutes écrivait des valeurs que l'écran ne propose pas (45 − 10
-- = 35, absent de `COOKING_SESSION_MINUTES`), c'est-à-dire un réglage que la
-- personne ne retrouve plus dans son propre formulaire.
--
-- Deux questions le demandent désormais (`difficulty`, `speed`), une troisième
-- est posée à tout le monde au lieu d'une dynamique sur trois (`variety`), et
-- les deux questions de plat deviennent des ALIMENTS avec leur personne.
--
-- ── CE QUI N'EST PAS RÉÉCRIT, ET C'EST LE POINT ───────────────────────────
-- ⛔ `never_again` / `make_again` GARDENT LEURS COLONNES ET LEUR CONTENU. Elles
-- portent des TITRES DE PLATS (15 lignes en base locale au 2026-09-03), et
-- « Poulet rôti au citron » ne dit pas si c'est le poulet, le citron ou le
-- rôtissage qu'on ne veut plus. Les remapper en aliments serait deviner à la
-- place de gens qui ont répondu pour de vrai. Les aliments arrivent dans DEUX
-- COLONNES NEUVES ; le lecteur lit les deux formes.
-- ⛔ `axis_question` / `axis_answer` restent, et restent LUES. Le producteur est
-- retiré (deux des trois axes n'avaient aucun lecteur), pas le passé — même
-- doctrine que `canHold` face à `canProduce`.
--
-- ⚠️ « APPLIQUÉE EN LOCAL » ≠ LE CONTRÔLE A TOURNÉ : le `db push` distant est le
-- premier vrai run du bloc `do $$` de fin de fichier.

-- ── LES CINQ COLONNES NEUVES ───────────────────────────────────────────────
--
-- ⚠️ TOUTES NULLABLES, ET `null` N'EST PAS `[]`. `null` dit « la question n'a
-- pas été posée » (un plan non cuisiné ne reçoit pas les deux questions de
-- cuisine), `[]` dit « posée, aucun aliment coché ». Les confondre ferait
-- sauter des questions en silence à un formulaire rempli tap par tap —
-- cicatrice `jsonb default '[]' cache « répondu » vs « pas demandé »`.
alter table public.meal_plan_feedback
  add column if not exists difficulty text,
  add column if not exists speed text,
  add column if not exists variety text,
  add column if not exists never_again_foods jsonb,
  add column if not exists make_again_foods jsonb,
  add column if not exists anything_else text;

comment on column public.meal_plan_feedback.difficulty is
  'Lot B — « Les recettes du plan étaient : » too_hard | fine | could_do_more. '
  'Un cran de RECIPE_DIFFICULTIES, écrit dans practical_constraints.recipe_difficulty '
  'avec sa ligne de journal. NULL = question non posée (plan non cuisiné).';
comment on column public.meal_plan_feedback.speed is
  'Lot B — « Le temps qu''elles ont pris était : » too_long | fine | had_more_time. '
  'Un BARREAU de COOKING_SESSION_MINUTES (30/45/60/90/120/180), jamais un delta '
  'de minutes. NULL = question non posée.';
comment on column public.meal_plan_feedback.variety is
  'Lot B — « Assez de variété ? » yes | sometimes | no, posée à TOUT LE MONDE. '
  'Remplace la quatrième question par dynamique (axis_question/axis_answer), '
  'dont deux des trois axes n''avaient aucun lecteur.';
comment on column public.meal_plan_feedback.never_again_foods is
  'Lot B — des ALIMENTS du plan avec leur personne : [{"food":"saumon",'
  '"subject":"member:<uuid>"}]. NULL = pas posée, [] = posée sans réponse. '
  'La colonne never_again garde les TITRES d''avant le lot B, et reste lue.';
comment on column public.meal_plan_feedback.make_again_foods is
  'Lot B — l''inverse, même forme, même canal (food.prefer).';
comment on column public.meal_plan_feedback.anything_else is
  'Lot B — le champ libre, en dernier et facultatif. Renverse FF-054 §3.2 '
  '(« aucun champ libre ») de façon bornée : il demande une consigne pour les '
  'plans suivants, pas un récit de la semaine. Lu par le classifieur du lot A.';

-- ── LES VOCABULAIRES, EN CONTRAINTE ────────────────────────────────────────
--
-- ⚠️ `not valid` N'EST PAS UTILISÉ, ET C'EST VOULU : les colonnes sont neuves,
-- donc toutes les lignes existantes y portent `null`, que le CHECK accepte. Une
-- contrainte non validée serait une contrainte dont personne ne sait si elle
-- tient.
alter table public.meal_plan_feedback
  drop constraint if exists meal_plan_feedback_difficulty_check,
  add constraint meal_plan_feedback_difficulty_check
    check (difficulty is null or difficulty in ('too_hard', 'fine', 'could_do_more'));

alter table public.meal_plan_feedback
  drop constraint if exists meal_plan_feedback_speed_check,
  add constraint meal_plan_feedback_speed_check
    check (speed is null or speed in ('too_long', 'fine', 'had_more_time'));

alter table public.meal_plan_feedback
  drop constraint if exists meal_plan_feedback_variety_check,
  add constraint meal_plan_feedback_variety_check
    check (variety is null or variety in ('yes', 'sometimes', 'no'));

-- ⛔ LA FORME DES DEUX COLONNES D'ALIMENTS — une LISTE, jamais un objet.
-- Un objet casserait la lecture en silence, et le seul symptôme serait une
-- question qui a l'air non posée.
alter table public.meal_plan_feedback
  drop constraint if exists meal_plan_feedback_foods_shape,
  add constraint meal_plan_feedback_foods_shape
    check (
      (never_again_foods is null or jsonb_typeof(never_again_foods) = 'array')
      and (make_again_foods is null or jsonb_typeof(make_again_foods) = 'array')
    );

-- ⛔ LES DEUX QUESTIONS DE CUISINE N'EXISTENT QUE SI ON A CUISINÉ.
-- Le jumeau exact de `portions_subject_needs_measure` : une réponse dont la
-- prémisse est absente est un défaut de client, et un défaut qu'on nettoie est
-- un défaut qu'on ne voit jamais. La RPC rend le refus NOMMÉ
-- (`cooking_answer_without_cooking`) avant d'arriver ici ; ce CHECK est la
-- ceinture, pour tout écrivain qui ne passerait pas par elle.
alter table public.meal_plan_feedback
  drop constraint if exists meal_plan_feedback_cooking_answers_need_cooking,
  add constraint meal_plan_feedback_cooking_answers_need_cooking
    check (
      (difficulty is null and speed is null)
      or cooked in ('yes', 'partly')
    );

-- ⛔ L'ANCIENNE SIGNATURE À HUIT ARGUMENTS EST SUPPRIMÉE, PAS LAISSÉE À CÔTÉ.
-- `create or replace` avec six paramètres de plus crée une SECONDE surcharge:
-- PostgREST choisirait alors sur les noms de paramètres du corps de requête, et
-- un appelant resté à huit continuerait d'écrire — sans les indices, sans
-- qu'aucun compteur ne le dise. Même geste que le port du lot A
-- (`20260903120000`), et le contrôle ⑤ en fin de fichier compte les surcharges.
drop function if exists public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text, text
);

CREATE OR REPLACE FUNCTION public.keel_plan_feedback_submit(
  p_meal_id uuid,
  p_cooked text,
  p_portions text,
  p_never_again jsonb,
  p_make_again jsonb,
  p_axis_question text,
  p_axis_answer text,
  p_portions_subject text,
  p_difficulty text default null,
  p_speed text default null,
  p_variety text default null,
  p_never_again_foods jsonb default null,
  p_make_again_foods jsonb default null,
  p_anything_else text default null
)
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
  -- LOT B — les trois réponses neuves, nettoyées une fois.
  v_difficulty text := nullif(btrim(coalesce(p_difficulty, '')), '');
  v_speed text := nullif(btrim(coalesce(p_speed, '')), '');
  v_variety text := nullif(btrim(coalesce(p_variety, '')), '');
  v_anything text := nullif(btrim(coalesce(p_anything_else, '')), '');
  v_cooked text := nullif(btrim(coalesce(p_cooked, '')), '');
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

  -- ── LOT B · LES DEUX QUESTIONS DE CUISINE NE SE POSENT QU'À QUI A CUISINÉ
  --
  -- ⛔ MÊME FORME QUE « UN SUJET SANS MESURE »: refusé fort, pas nettoyé en
  -- silence. Une réponse à « c'était trop long ? » arrivée sans que `cooked`
  -- l'autorise vient d'un client cassé ou d'une charge forgée — et elle
  -- déplacerait un réglage RÉEL, dans le sens que la déduction d'avant le lot B
  -- prenait toute seule. Un défaut qu'on nettoie est un défaut qu'on ne voit
  -- jamais.
  --
  -- ⛔ LA LISTE DOIT RESTER ÉGALE À CELLE DE `cookingQuestionsAreAsked`
  -- (`_shared/keel/plan_feedback.ts`). Le bloc de contrôle en fin de migration
  -- le vérifie sur les TROIS jetons de `cooked`.
  if (v_difficulty is not null or v_speed is not null)
     and (v_cooked is null or v_cooked not in ('yes', 'partly'))
  then
    return jsonb_build_object('ok', false, 'reason', 'cooking_answer_without_cooking');
  end if;

  -- ── LE MARQUEUR, DÉRIVÉ DE CE QUI EST ÉCRIT ──────────────────────────
  if v_cooked is not null then
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
  -- LOT B — les quatre questions neuves, chacune sous SON nom.
  -- ⚠️ LE MARQUEUR PORTE LE NOM DE LA QUESTION, PAS « il y a une réponse ».
  -- C'est lui qui distingue « posée, répondue vide » de « jamais posée » —
  -- cicatrice `jsonb default '[]' cache répondu vs pas demandé`.
  if v_difficulty is not null then
    v_answered := v_answered || '["difficulty"]'::jsonb;
  end if;
  if v_speed is not null then
    v_answered := v_answered || '["speed"]'::jsonb;
  end if;
  if v_variety is not null then
    v_answered := v_answered || '["enough_variety"]'::jsonb;
  end if;
  if p_never_again_foods is not null then
    v_answered := v_answered || '["never_again"]'::jsonb;
  end if;
  if p_make_again_foods is not null then
    v_answered := v_answered || '["make_again"]'::jsonb;
  end if;
  if v_anything is not null then
    v_answered := v_answered || '["anything_else"]'::jsonb;
  end if;
  -- ⚠️ HÉRITÉ, ET IL RESTE: la question d'axe portait SON jeton. Une ligne
  -- écrite avant le lot B en porte un, et un lecteur doit le retrouver.
  if nullif(btrim(coalesce(p_axis_question, '')), '') is not null
     and nullif(btrim(coalesce(p_axis_answer, '')), '') is not null then
    v_answered := v_answered
      || jsonb_build_array(btrim(p_axis_question));
  end if;

  insert into public.meal_plan_feedback
    (user_id, meal_id, cooked, portions, portions_subject, never_again,
     make_again, axis_question, axis_answer, answered, content_locale,
     difficulty, speed, variety, never_again_foods, make_again_foods,
     anything_else)
  values
    (v_user, p_meal_id,
     v_cooked,
     v_portions,
     v_subject,
     coalesce(p_never_again, '[]'::jsonb),
     coalesce(p_make_again, '[]'::jsonb),
     nullif(btrim(coalesce(p_axis_question, '')), ''),
     nullif(btrim(coalesce(p_axis_answer, '')), ''),
     v_answered,
     v_locale,
     v_difficulty,
     v_speed,
     v_variety,
     -- ⚠️ `null` RESTE `null`, ET C'EST LA MOITIÉ QUI COMPTE. Les deux
     -- colonnes héritées reçoivent `coalesce(…, '[]')` parce qu'elles sont
     -- `not null` depuis leur migration; les neuves ne le sont pas, et la
     -- différence est le sujet: `[]` dit « posée, aucun aliment coché »,
     -- `null` dit « jamais posée ». Les confondre ferait sauter des questions
     -- en silence à un formulaire rempli tap par tap.
     p_never_again_foods,
     p_make_again_foods,
     v_anything)
  on conflict (meal_id) do nothing;

  get diagnostics v_written = row_count;
  if v_written = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_answered');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- LE CONTRÔLE — les listes qui disent la même règle doivent dire la même chose
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ IL COMPARE, IL NE RECOPIE PAS. Une troisième liste écrite ici serait la
-- prochaine à vieillir. Défaut ⑥ du 2026-09-01 : le CHECK d'une colonne avait
-- gagné deux jetons et la garde écrite à la main dans le corps de la fonction
-- ne les avait pas suivis — le bilan ENTIER était perdu, sous un motif faux.
do $control$
declare
  v_token   text;
  v_col     text;
  v_expect  boolean;
  v_got     boolean;
  v_def     text;
  v_count   int;
begin
  -- ① LES TROIS VOCABULAIRES NEUFS, MESURÉS PAR L'ÉCRITURE.
  --
  -- ⚠️ SUR UNE COPIE TEMPORAIRE, ET C'EST LA MOITIÉ QUI REND LA MESURE VRAIE.
  -- La première version de ce bloc insérait dans la vraie table et attrapait
  -- `when others` : la violation de clé étrangère sur `user_id` arrivait AVANT
  -- le CHECK, et un jeton forgé se lisait donc « accepté ». La mesure disait
  -- l'inverse de la vérité, et c'est exactement le défaut que ce bloc existe
  -- pour empêcher — un contrôle qui se trompe est pire que pas de contrôle.
  --
  -- `like … including constraints` recopie les CHECK et pas les clés
  -- étrangères : ce qui échoue ici échoue POUR NOTRE RAISON.
  -- ⚠️ `including defaults` AUSSI, et pas par confort: `never_again` et
  -- `make_again` sont `not null default '[]'`, et `like` sans les défauts
  -- recopie le `not null` sans sa valeur — chaque sonde échouerait alors sur
  -- une colonne qui n'est pas son sujet, en se lisant « refusé par le CHECK ».
  create temp table b_probe (
    like public.meal_plan_feedback including constraints including defaults
  ) on commit drop;

  for v_col, v_token, v_expect in
    select * from (values
      ('difficulty', 'too_hard',      true),
      ('difficulty', 'fine',          true),
      ('difficulty', 'could_do_more', true),
      ('difficulty', 'too_short',     false),
      ('difficulty', 'no',            false),
      ('speed',      'too_long',      true),
      ('speed',      'fine',          true),
      ('speed',      'had_more_time', true),
      ('speed',      'too_hard',      false),
      ('variety',    'yes',           true),
      ('variety',    'sometimes',     true),
      ('variety',    'no',            true),
      ('variety',    'often',         false)
    ) as t(col, token, expected)
  loop
    begin
      execute format(
        'insert into b_probe (id, user_id, meal_id, content_locale, cooked, %I) '
        'values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '
        '''fr-FR'', %L, %L)',
        v_col, 'yes', v_token
      );
      v_got := true;
    exception when check_violation then
      v_got := false;
    end;
    if v_got <> v_expect then
      raise exception
        'meal_plan_feedback.%: le jeton « % » est %, attendu % — le CHECK et le '
        'vocabulaire de plan_feedback.ts ont divergé',
        v_col, v_token, v_got, v_expect;
    end if;
  end loop;

  -- ② LA PRÉMISSE DE CUISINE MORD, ET SON CAS PASSANT PASSE.
  --    Une garde sans cas qui passe est une garde cassée qui ressemble à une
  --    garde qui marche.
  begin
    insert into b_probe (id, user_id, meal_id, content_locale, cooked, speed)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'fr-FR', 'no', 'too_long');
    raise exception
      'meal_plan_feedback: « trop long » est accepté sur un plan NON cuisiné — '
      'on déplacerait un réglage réel sur une supposition';
  exception when check_violation then
    null; -- attendu
  end;
  insert into b_probe (id, user_id, meal_id, content_locale, cooked, speed, difficulty)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'fr-FR', 'partly', 'too_long', 'too_hard');
  insert into b_probe (id, user_id, meal_id, content_locale, cooked)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'fr-FR', 'no');

  -- ③ `null` ET `[]` RESTENT DISTINCTS SUR LES DEUX COLONNES D'ALIMENTS.
  --    Un `default '[]'` posé par mégarde ferait sauter des questions en
  --    silence à un formulaire rempli tap par tap.
  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public' and table_name = 'meal_plan_feedback'
     and column_name in ('never_again_foods', 'make_again_foods', 'difficulty',
                         'speed', 'variety', 'anything_else')
     and (column_default is not null or is_nullable = 'NO');
  if v_count <> 0 then
    raise exception
      'meal_plan_feedback: % colonne(s) neuve(s) portent un défaut ou un NOT NULL '
      '— « posée sans réponse » et « jamais posée » deviennent indiscernables',
      v_count;
  end if;

  -- ④ LA FORME DES ALIMENTS: une liste, jamais un objet.
  begin
    insert into b_probe (id, user_id, meal_id, content_locale, never_again_foods)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'fr-FR', '{}'::jsonb);
    raise exception 'meal_plan_feedback: un objet passe pour une liste d''aliments';
  exception when check_violation then
    null; -- attendu
  end;

  -- ⑤ LA RPC PORTE LES SIX PARAMÈTRES NEUFS, ET UNE SEULE SURCHARGE EXISTE.
  --    Deux surcharges laisseraient PostgREST choisir sur les noms, et un
  --    appelant resté sur huit paramètres écrirait toujours — sans les indices,
  --    sans qu'aucun compteur ne le dise.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'keel_plan_feedback_submit';
  if v_count <> 1 then
    raise exception 'keel_plan_feedback_submit: % surcharges, attendu 1', v_count;
  end if;
  select pg_get_function_arguments(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'keel_plan_feedback_submit';
  foreach v_token in array array[
    'p_difficulty', 'p_speed', 'p_variety',
    'p_never_again_foods', 'p_make_again_foods', 'p_anything_else'
  ] loop
    if position(v_token in v_def) = 0 then
      raise exception 'keel_plan_feedback_submit: le paramètre % manque (%)', v_token, v_def;
    end if;
  end loop;

  -- ⑥ LE REFUS NOMMÉ DE LA RPC EXISTE, ET IL EST CELUI DE LA PRÉMISSE.
  --    Le CHECK est la ceinture; le refus nommé est ce que l'écran lit. Sans
  --    lui, un client cassé recevrait un `check_violation` brut — c'est-à-dire
  --    une panne là où il y a une règle.
  select prosrc into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'keel_plan_feedback_submit';
  if position('cooking_answer_without_cooking' in v_def) = 0 then
    raise exception
      'keel_plan_feedback_submit: le refus « cooking_answer_without_cooking » '
      'n''existe pas — l''écran lirait un check_violation brut';
  end if;
end $control$;
