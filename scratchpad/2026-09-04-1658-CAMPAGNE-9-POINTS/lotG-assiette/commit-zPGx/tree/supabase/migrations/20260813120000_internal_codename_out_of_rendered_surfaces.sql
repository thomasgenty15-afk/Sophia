-- ============================================================================
-- « KEEL » EST UN NOM DE CODE INTERNE. LE PRODUIT S'APPELLE SOPHIA.
--
-- Et il ne restait pas seulement dans des commentaires: il était RENDU, et il a
-- été PRONONCÉ. Trouvé dans `chat_messages` de la base locale, écrit par
-- l'assistant à un élève, en toutes lettres:
--
--   « the method is the general KEEL discovery approach: real-food meals … »
--
-- Le mot venait des DONNÉES injectées en contexte, pas du code de l'écran —
-- c'est pour ça qu'aucune relecture de TSX ne pouvait l'attraper. Trois
-- surfaces le portaient, et les trois sont ici:
--
--   1. `plan_versions.title` — le `h1` de /app/today. Cinq lignes existantes, et
--      la FONCTION qui en écrit une à CHAQUE inscription gratuite.
--   2. `plan_versions.notes_for_student` — « The KEEL discovery program … a real
--      coach on KEEL is what that would be. »
--   3. `coach_doctrines.forbidden[].instead` — LE PLUS GRAVE: c'est une phrase
--      que le modèle a pour consigne de DIRE à l'élève quand il refuse de
--      promettre un résultat. Plus `change_note`, lu côté coach.
--
-- ⚠️ POURQUOI UNE MIGRATION ET PAS UNE ÉDITION DES MIGRATIONS D'ORIGINE:
-- 20260805090000 et 20260805093000 sont APPLIQUÉES. On ne réécrit pas une
-- migration passée — on en ajoute une qui corrige, et elle est idempotente pour
-- qu'une base neuve (qui rejoue l'ancienne, puis celle-ci) finisse au même état.
--
-- ⚠️ LA FONCTION EST REPRISE DE `pg_get_functiondef` SUR LA BASE VIVANTE, pas
-- retranscrite: seules les trois chaînes changent. `SECURITY DEFINER` et
-- `SET search_path TO ''` sont donc préservés — les perdre ouvrirait une
-- fonction qui écrit un plan publié au nom d'un coach.
--
-- CE QUI NE CHANGE PAS, ET C'EST VOULU: les noms de crons (`keel-*`), de
-- fonctions edge (`keel-*-v1`), de colonnes (`keel_role`) et de tables. Ce sont
-- des identifiants internes, invisibles à l'utilisateur. Leur renommage est un
-- lot à part — voir `scratchpad/plateforme/PLAN-RENOMMAGE-KEEL.md`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.keel_provision_house_plan_version(p_user_id uuid, p_coach_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan_id uuid;
  v_timezone text;
  v_kind text;
  v_version integer;
begin
  select c.coach_kind into v_kind from public.coaches c where c.id = p_coach_id;
  if v_kind is distinct from 'house' then
    -- CONDITION DE DÉSARMEMENT: cette fonction ne provisionne QUE pour la
    -- maison. Un vrai coach publie son protocole lui-même, par
    -- `plan-publish-v1`, et lui en fabriquer un serait écrire sa méthode à sa
    -- place — la faute que tout ce produit existe pour ne pas commettre.
    return null;
  end if;

  -- Déjà un protocole publié ? On ne touche à rien. C'est ce qui rend le
  -- rattachement rejouable, et ça protège aussi le cas où un vrai coach a
  -- publié: on ne lui volerait pas sa place.
  select pv.id into v_plan_id
    from public.plan_versions pv
   where pv.student_id = p_user_id
     and pv.status = 'published';
  if v_plan_id is not null then
    return v_plan_id;
  end if;

  -- LE FUSEAU. `meal-photo-upload-v1` le lit sur CETTE ligne pour résoudre le
  -- jour local de la photo — c'est même la raison qu'il donne pour exiger un
  -- protocole publié (« no timezone to resolve the day in »). Le prendre sur le
  -- profil, et se rabattre sur UTC plutôt que sur une valeur inventée: un fuseau
  -- faux daterait les repas d'un jour à côté.
  select coalesce(nullif(btrim(p.timezone), ''), 'UTC') into v_timezone
    from public.profiles p where p.id = p_user_id;
  v_timezone := coalesce(v_timezone, 'UTC');

  -- LA VERSION SE SUIT, elle ne se réinvente pas à 1.
  --
  -- Trouvé en relecture à froid, sur un chemin bien atteignable: un inscrit libre
  -- passe à un vrai coach (son protocole de découverte devient `superseded`),
  -- quitte ce coach, puis revient sur la porte libre. Un `version = 1` en dur
  -- écrirait une SECONDE ligne version 1 pour le même élève — rien ne l'interdit
  -- (l'index unique ne porte que sur « un seul publié »), et l'historique de ses
  -- protocoles devient inordonnable.
  select coalesce(max(pv.version), 0) + 1 into v_version
    from public.plan_versions pv where pv.student_id = p_user_id;

  insert into public.plan_versions (
    coach_id, student_id, version, status, title, content_locale, timezone,
    anchor_week_start, duration_weeks, published_at, published_by,
    notes_for_student
  )
  values (
    p_coach_id, p_user_id, v_version, 'published',
    'Sophia discovery program', 'en-US', v_timezone,
    (date_trunc('week', (now() at time zone v_timezone))::date), 12,
    now(),
    -- `published_by` = le compte du coach maison. Il ne s'est pas connecté pour
    -- le faire — il ne peut pas — mais l'attribution reste juste: c'est bien son
    -- programme, et laisser NULL rendrait la ligne anonyme dans l'audit.
    (select c.user_id from public.coaches c where c.id = p_coach_id),
    'The Sophia discovery program. General principles, not a plan written for you: '
    || 'a real coach on Sophia is what that would be.'
  )
  returning id into v_plan_id;

  insert into public.plan_commitments (
    plan_version_id, user_id, coach_id,
    title, content_locale,
    polarity, activity_class, anchor_kind,
    measure, target_op, evidence_kind, evidence_required,
    evaluation_grain, counts_toward_adherence
  )
  values (
    v_plan_id, p_user_id, p_coach_id,
    -- Le libellé que l'élève lit. C'est le geste du programme, pas une cible.
    'Photograph a meal', 'en-US',
    -- « capture »: on demande de CONSTATER, pas d'atteindre une cible. C'est le
    -- seul type d'engagement qu'un programme qui ne connaît pas la personne peut
    -- honnêtement porter.
    'capture', 'nutrition', 'free',
    'presence', 'any', 'photo', false,
    'day',
    -- FAUX, et c'est la ligne la plus importante de cette fonction. Le programme
    -- de découverte ne note personne; un engagement comptant vers un pourcentage
    -- d'adhérence contredirait la seule promesse faite à l'élève.
    false
  );

  return v_plan_id;
end;
$function$;

-- ── LES LIGNES DÉJÀ ÉCRITES ────────────────────────────────────────────────
-- `replace()` et non une égalité: les titres ont pu être édités par un coach,
-- et on ne veut corriger que le mot, jamais écraser sa phrase.

update public.plan_versions
   set title = replace(title, 'KEEL discovery program', 'Sophia discovery program')
 where title like '%KEEL discovery program%';

update public.plan_versions
   set notes_for_student = replace(
         replace(notes_for_student, 'KEEL discovery program', 'Sophia discovery program'),
         'a real coach on KEEL', 'a real coach on Sophia')
 where notes_for_student like '%KEEL%';

update public.coach_doctrines
   set change_note = replace(change_note, 'KEEL discovery program', 'Sophia discovery program')
 where change_note like '%KEEL%';

-- `forbidden` est un tableau JSON: on remplace dans sa forme texte puis on la
-- reparse. C'est sûr ici parce que « KEEL » n'apparaît dans aucune CLÉ ni dans
-- aucun `token` — seulement dans la prose d'`instead`, vérifié avant écriture.
update public.coach_doctrines
   set forbidden = replace(forbidden::text, 'a real coach on KEEL', 'a real coach on Sophia')::jsonb
 where forbidden::text like '%KEEL%';

update public.coach_doctrines
   set beliefs = replace(
         replace(beliefs::text, 'KEEL''s general discovery program', 'Sophia''s general method'),
         'KEEL discovery program', 'Sophia discovery program')::jsonb
 where beliefs::text like '%KEEL%';

-- ── LA GARDE ───────────────────────────────────────────────────────────────
-- Une migration qui « nettoie » sans vérifier laisse le prochain lecteur croire
-- que c'est fait. On échoue bruyamment si une surface RENDUE porte encore le
-- nom interne.
do $$
declare n bigint;
begin
  select
    (select count(*) from public.plan_versions where title like '%KEEL%')
  + (select count(*) from public.plan_versions where notes_for_student like '%KEEL%')
  + (select count(*) from public.coach_doctrines where change_note like '%KEEL%')
  + (select count(*) from public.coach_doctrines where forbidden::text like '%KEEL%')
  + (select count(*) from public.coach_doctrines where beliefs::text like '%KEEL%')
  into n;
  if n > 0 then
    raise exception 'nom interne: % surface(s) rendue(s) portent encore « KEEL »', n;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname = 'keel_provision_house_plan_version'
       and pg_get_functiondef(p.oid) like '%KEEL discovery%'
  ) then
    raise exception 'nom interne: keel_provision_house_plan_version écrit encore « KEEL »';
  end if;

  raise notice 'nom interne: aucune surface rendue ne porte « KEEL »';
end $$;
