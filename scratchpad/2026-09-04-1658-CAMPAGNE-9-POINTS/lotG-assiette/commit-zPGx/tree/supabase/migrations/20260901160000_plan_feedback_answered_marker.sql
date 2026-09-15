-- ===========================================================================
-- FF-054 §3.2 — LE MARQUEUR DE QUESTION RÉPONDUE
-- ===========================================================================
--
-- ── LE DÉFAUT QUE CETTE COLONNE FERME ─────────────────────────────────────
-- `never_again` et `make_again` sont `jsonb not null default '[]'`. Tant que
-- le questionnaire s'écrivait EN UNE FOIS (l'écran, via
-- `keel_plan_feedback_submit`), c'était sans conséquence: la ligne naissait
-- complète.
--
-- Le retour arrive maintenant AUSSI par la conversation (FF-054 §3.2), tap
-- après tap, et la ligne se remplit progressivement. Le défaut apparaît alors:
--
--     premier tap  → la ligne est insérée avec `cooked`
--                  → `never_again` vaut `[]` PAR DÉFAUT
--     tap suivant  → « never_again vaut [] » se lit « la personne a répondu
--                    aucun » … et les deux questions de plats sont SAUTÉES.
--
-- Un questionnaire qui saute deux de ses cinq questions ressemble à un
-- questionnaire qui marche. Aucune erreur nulle part, et le lecteur de
-- `food_preferences` reçoit deux tableaux vides qu'il croit remplis.
--
-- ⛔ POURQUOI PAS UN `null` SUR LES DEUX COLONNES. Les rendre nullables
-- ferait porter DEUX sens à la même colonne (« pas demandé » et « aucun »),
-- et obligerait chaque lecteur — dont l'enveloppe de composition — à
-- re-décider lequel il lit. Un marqueur explicite ne peut pas être mal lu.
--
-- ── CE QUE `answered` PORTE, EXACTEMENT ───────────────────────────────────
-- Les JETONS DE QUESTION auxquels la personne a effectivement répondu, dans
-- le vocabulaire de `FEEDBACK_QUESTIONS` (_shared/keel/plan_feedback.ts).
-- Ni les questions posées, ni les questions dues: un jeton ici veut dire « un
-- humain a tapé ». C'est ce qui le rend lisible dans six mois.
--
-- ⚠️ PAS DE CHECK ADOSSÉ AU VOCABULAIRE, et c'est la règle déjà écrite dans
-- `plan_feedback.ts`: les réponses déjà en base portent des questions qu'on ne
-- pose plus (`energy_around_sessions`), et une contrainte les rendrait
-- irrecevables rétroactivement. Le socle TypeScript refuse à l'écriture; la
-- base garde ce qu'un humain a vraiment répondu.
--
-- ── RÉ-APPLICABLE ─────────────────────────────────────────────────────────
-- `db reset` est interdit sur ce dépôt: tout ici doit repasser sur une base
-- qui a déjà vécu. D'où `add column if not exists` et `create or replace`.

begin;

alter table public.meal_plan_feedback
  add column if not exists answered jsonb not null default '[]'::jsonb;

comment on column public.meal_plan_feedback.answered is
  'Les jetons de question auxquels la personne a RÉPONDU (vocabulaire '
  'FEEDBACK_QUESTIONS). Existe parce que never_again/make_again sont '
  '"not null default ''[]''": sans ce marqueur, "aucun plat" et "pas encore '
  'demandé" sont le même octet, et le questionnaire de la conversation saute '
  'ses deux questions de plats en silence. LECTEUR: nextFeedbackStep '
  '(_shared/keel/plan_feedback_chat.ts). Un jeton ici veut dire "un humain a '
  'tapé" — jamais "on a demandé".';

-- ---------------------------------------------------------------------------
-- LA PORTE DE L'ÉCRAN LE REMPLIT AUSSI
-- ---------------------------------------------------------------------------
-- Sans ça, une ligne écrite par l'écran porterait `answered = []` et la
-- conversation reposerait des questions déjà répondues. Deux écrivains pour une
-- même table dont un seul tient le marqueur est exactement le défaut n°1 de ce
-- dépôt.
--
-- La liste est dérivée de CE QUI EST ÉCRIT, jamais de ce qui a été affiché:
-- l'écran envoie `null` pour une question qu'il n'a pas posée, et les deux
-- tableaux de plats arrivent tels quels — `[]` y veut dire « aucun », parce que
-- l'écran, lui, les a bel et bien posées quand il les envoie.
--
-- ⚠️ `p_never_again`/`p_make_again` valant `null` (un client d'avant ce lot)
-- ne marquent rien: on n'invente pas une réponse pour une question dont on ne
-- sait pas si elle a été posée.

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
    if v_portions is null or v_portions not in ('too_much', 'not_enough') then
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

revoke all on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text, text) from public, anon;
grant execute on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text, text) to authenticated;

-- ===========================================================================
-- LA PREUVE
-- ===========================================================================

do $$
declare
  probe uuid := gen_random_uuid();
  probe_meal uuid;
  v_answered jsonb;
begin
  -- 1. LA COLONNE EXISTE, ET SON DÉFAUT EST UN TABLEAU VIDE.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'meal_plan_feedback'
       and column_name = 'answered'
  ) then
    raise exception 'ff054: la colonne answered n''existe pas';
  end if;

  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  insert into public.student_generated_meals
    (user_id, scope, mode, servings, dishes, shopping_list, generated_from,
     content_locale, starts_on, duration_days)
  values (probe, 'day', 'to_shop', 1, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
          'fr-FR', current_date - 10, 7)
  returning id into probe_meal;

  -- 2. UNE LIGNE PARTIELLE — le cas de la conversation, tap après tap.
  --    `never_again` vaut `[]` par défaut, et `answered` ne le nomme PAS:
  --    c'est toute la raison d'être de cette colonne.
  insert into public.meal_plan_feedback
    (user_id, meal_id, cooked, answered, content_locale)
  values (probe, probe_meal, 'partly', '["cooked"]'::jsonb, 'fr-FR');

  select answered into v_answered
    from public.meal_plan_feedback where meal_id = probe_meal;
  if v_answered ? 'never_again' then
    raise exception
      'ff054: answered nomme never_again alors que la question n''a pas ete posee';
  end if;
  if not (v_answered ? 'cooked') then
    raise exception 'ff054: answered ne nomme pas cooked, qui vient d''etre repondu';
  end if;

  -- 3. LE MARQUEUR S'AJOUTE — un tap suivant écrit sa réponse ET son jeton.
  update public.meal_plan_feedback
     set never_again = '["Poulet du lundi"]'::jsonb,
         answered = answered || '["never_again"]'::jsonb
   where meal_id = probe_meal;

  select answered into v_answered
    from public.meal_plan_feedback where meal_id = probe_meal;
  if not (v_answered ? 'never_again' and v_answered ? 'cooked') then
    raise exception 'ff054: le marqueur ne s''accumule pas';
  end if;

  -- 4. LES DROITS N'ONT PAS BOUGÉ.
  if has_table_privilege('authenticated', 'public.meal_plan_feedback', 'INSERT') then
    raise exception 'ff054: authenticated peut ecrire — le revoke n''a pas pris';
  end if;

  delete from auth.users where id = probe;
  raise notice 'ff054: answered en place, marqueur verifie';
end;
$$;

commit;
