-- LOT 2A — « POUR QUI ? », LA QUESTION QUI MANQUAIT AU QUESTIONNAIRE.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CE QUE ÇA FERME
-- ══════════════════════════════════════════════════════════════════════════
-- `meal_plan_feedback.portions` porte la seule vérité terrain que le moteur
-- n'a pas: « trop » / « ce qu'il fallait » / « pas assez ». Et jusqu'ici elle
-- ne disait PAS POUR QUI.
--
-- Dans un foyer de quatre, « les portions étaient trop grosses » ne désigne
-- personne. C'est très exactement la raison pour laquelle la nomenclature fait
-- du questionnaire le SEUL producteur de `portion.adjust` (§5, ligne ②):
-- « une mesure a besoin d'un sujet, et la conversation ne sait pas
-- l'attribuer ». Le questionnaire, lui, pose la question avec la liste du
-- foyer sous les yeux — une question fermée, pas une inférence.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠️ POURQUOI LA QUESTION ENTRE DANS LA RPC, ET PAS À CÔTÉ
-- ══════════════════════════════════════════════════════════════════════════
-- `keel_plan_feedback_submit` est `on conflict (meal_id) do nothing`, et c'est
-- une RÈGLE PRODUIT — « une seule fois par fenêtre ». Un second envoi n'écrase
-- pas le premier, il rend `already_answered`.
--
-- Une réponse « pour qui » posée par un SECOND appel serait donc soit perdue
-- (le conflit l'avale), soit portée par un second écrivain pour une seule
-- intention — « le défaut n°1 de ce dépôt », dans les mots de la migration qui
-- a créé cette table. La question entre donc DANS la même écriture, par un
-- huitième paramètre.
--
-- ⛔ ET AUCUNE COLONNE D'ENVIE N'ENTRE ICI, toujours pas. Les envies ont
-- `household_envy_submissions`; ce lot ne rouvre pas ce débat.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠️ L'ANCIENNE SIGNATURE EST SUPPRIMÉE, ET C'EST OBLIGATOIRE
-- ══════════════════════════════════════════════════════════════════════════
-- `create or replace function` avec une liste d'arguments différente ne
-- remplace rien: il CRÉE UNE SURCHARGE. PostgREST, devant deux candidates,
-- rend `PGRST203` (« could not choose the best candidate function ») — c'est-
-- à-dire un questionnaire qui n'écrit plus rien, pour tout le monde, sans
-- qu'aucun test de code ne rougisse. On dépose donc l'ancienne, explicitement,
-- et la preuve en bas vérifie qu'elle n'est plus là.
--
-- ── RÉ-APPLICABLE ────────────────────────────────────────────────────────
-- `db reset` est interdit sur ce dépôt: tout ici doit repasser sur une base
-- qui a déjà vécu. D'où `add column if not exists`, les gardes `pg_constraint`
-- et `drop function if exists`.

begin;

-- ---------------------------------------------------------------------------
-- 1. LA COLONNE
-- ---------------------------------------------------------------------------

alter table public.meal_plan_feedback
  add column if not exists portions_subject text;

comment on column public.meal_plan_feedback.portions_subject is
  'POUR QUI la réponse `portions` vaut. `household` (tout le monde à table, le '
  'DÉFAUT) ou `member:<household_members.member_id>`. NULL = la question n''a '
  'pas été posée: une seule bouche, ou réponse neutre. '
  'LECTEUR: `retainedItemsFromPlanFeedback` (_shared/keel/'
  'plan_feedback_retained.ts), qui en fait le `subject` d''un `portion.adjust` '
  '— puis `subjectsForPortionAdjust`, qui retire les mineurs d''une baisse non '
  'attribuée, et l''enveloppe de composition. '
  '⛔ JAMAIS UN PRÉNOM: « Poulet pour Zoé et Marc » ne se résout pas par un '
  'prénom dans un texte (« laitue » ≠ « lait », 12 faux positifs sur 12 '
  'mesurés dans ce dépôt).';

-- LA FORME, EN BASE. Le socle TypeScript refuse déjà `member:marc` à la
-- lecture; cette contrainte empêche la ligne d'exister. Les deux sont
-- nécessaires: sans celle-ci une charge forgée s'archiverait quand même, et la
-- personne verrait un retour qui ne produit rien sans jamais savoir pourquoi.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_plan_feedback'::regclass
      and conname = 'meal_plan_feedback_portions_subject_shape'
  ) then
    alter table public.meal_plan_feedback
      add constraint meal_plan_feedback_portions_subject_shape
      check (
        portions_subject is null
        or portions_subject = 'household'
        or portions_subject ~
           '^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );
  end if;
end $$;

-- UN SUJET SANS MESURE N'EXISTE PAS.
--
-- La question « pour qui ? » n'est posée QUE si la réponse de portion n'est pas
-- neutre (`too_much` ou `not_enough`). Une ligne qui porterait un sujet avec
-- `right`, ou sans réponse du tout, décrirait une attribution de quelque chose
-- qui n'a pas été dit — et le lecteur en tirerait un `portion.adjust` sans
-- direction, c'est-à-dire rien, en silence.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_plan_feedback'::regclass
      and conname = 'meal_plan_feedback_portions_subject_needs_measure'
  ) then
    alter table public.meal_plan_feedback
      add constraint meal_plan_feedback_portions_subject_needs_measure
      check (
        portions_subject is null
        or portions in ('too_much', 'not_enough')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. L'ÉCRIVAIN — huit paramètres, et la bouche est VÉRIFIÉE
-- ---------------------------------------------------------------------------

drop function if exists public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text);

-- ⚠️ LA BOUCHE EST VÉRIFIÉE ICI, ET PAS DANS UNE CONTRAINTE: une `check` ne
-- peut pas faire de sous-requête, et l'appartenance au foyer n'est pas une
-- propriété de la ligne. Sans cette vérification, n'importe quel compte
-- connecté attribuerait une baisse de portion à la bouche de quelqu'un
-- d'autre — ce dépôt a déjà rendu la ligne d'un élève à son coach faute d'un
-- `.eq()`.
--
-- ⚠️ ET UN SUJET ILLISIBLE EST UN REFUS, PAS UN REPLI SUR `household`.
-- Replier appliquerait à TOUTE la table une mesure destinée à une bouche —
-- exactement ce que l'axe 3 de la nomenclature interdit. Le motif est rendu, la
-- personne peut renvoyer.
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
-- 3. LES DROITS — on révoque d'abord, on accorde ensuite
-- ---------------------------------------------------------------------------
-- `revoke from public` ne retire pas `anon`: leçon déjà payée par ce dépôt.

revoke all on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text, text) from public, anon;

grant execute on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. LA PREUVE
-- ---------------------------------------------------------------------------

do $$
declare
  probe uuid := gen_random_uuid();
  probe_meal uuid;
  probe_household uuid;
  probe_member uuid;
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

  -- ⚠️ NI `kind` NI `restriction_consent_at`: les deux ont été DÉPOSÉES le
  -- 2026-08-10 (la colocation est sortie du produit). `first_name` est
  -- obligatoire depuis le même jour — une bouche sans prénom est filtrée en
  -- silence par le contexte de foyer.
  insert into public.households (name, created_by)
  values ('probe', probe)
  returning id into probe_household;

  insert into public.household_members (household_id, user_id, role, first_name)
  values (probe_household, probe, 'owner', 'Probe')
  returning member_id into probe_member;

  -- ── LE CAS QUI PASSE — sans lui, une garde cassée ressemble à une garde
  -- qui marche.
  insert into public.meal_plan_feedback
    (user_id, meal_id, portions, portions_subject, content_locale)
  values (probe, probe_meal, 'too_much', 'household', 'fr-FR');
  delete from public.meal_plan_feedback where meal_id = probe_meal;

  -- Et une bouche nommée, bien formée.
  insert into public.meal_plan_feedback
    (user_id, meal_id, portions, portions_subject, content_locale)
  values (probe, probe_meal, 'not_enough', 'member:' || probe_member::text, 'fr-FR');
  delete from public.meal_plan_feedback where meal_id = probe_meal;

  -- ⛔ UN PRÉNOM N'EST PAS UN SUJET.
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, portions, portions_subject, content_locale)
    values (probe, probe_meal, 'too_much', 'member:marc', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: « member:marc » a été accepté';
  exception when check_violation then null;
  end;

  -- ⛔ UN UUID TRONQUÉ NON PLUS.
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, portions, portions_subject, content_locale)
    values (probe, probe_meal, 'too_much', 'member:1234', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: un uuid tronqué a été accepté';
  exception when check_violation then null;
  end;

  -- ⛔ UN SUJET SANS MESURE N'EXISTE PAS.
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, portions, portions_subject, content_locale)
    values (probe, probe_meal, 'right', 'household', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: un sujet sur une réponse neutre';
  exception when check_violation then null;
  end;

  -- ⛔ L'ANCIENNE SIGNATURE EST PARTIE. Deux candidates = `PGRST203`, c'est-à-
  -- dire un questionnaire qui n'écrit plus rien, en silence.
  if to_regprocedure(
       'public.keel_plan_feedback_submit(uuid, text, text, jsonb, jsonb, text, text)'
     ) is not null then
    raise exception 'la surcharge à 7 paramètres survit: PostgREST ne saura plus choisir';
  end if;
  if to_regprocedure(
       'public.keel_plan_feedback_submit(uuid, text, text, jsonb, jsonb, text, text, text)'
     ) is null then
    raise exception 'la porte à 8 paramètres n''existe pas';
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

  delete from public.household_members where household_id = probe_household;
  delete from public.households where id = probe_household;
  delete from auth.users where id = probe;
end;
$$;

commit;
