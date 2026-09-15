-- KEEL — ② L'ACTIVITÉ EN DEUX AXES · ① LA STRUCTURE DU REPAS (2026-08-20).
--
-- Chantier: `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ② CE QUE LES QUATRE CRANS NE SAVAIENT PAS DIRE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `household_member_bodies.activity_level` porte quatre crans dont les libellés
-- sont tous factuels — ce n'est PAS un problème de catégorie flatteuse. Le
-- défaut est structurel: les deux premiers décrivent une JOURNÉE, les deux
-- derniers décrivent un SPORT, et le formulaire n'en laissait cocher qu'un.
--
-- Mesuré sur le foyer `5600347f`: Christèle est assise la journée ET fait du
-- sport deux à trois fois par semaine. Elle cochait `trains_some` et héritait
-- de PAL 1,80, quand le croisement vaut ~1,60. **239 kcal/jour fabriqués par la
-- forme de la question.**
--
-- ══════════════════════════════════════════════════════════════════════════
-- ① CE QUE LA MOYENNE `0,42` NE SAVAIT PAS DIRE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Le plan ne compose QUE le plat principal, donc `COMPOSED_DISH_MEAL_SHARE`
-- (`mouth_anchor.ts`) l'empêche de porter l'énergie du repas entier. C'est une
-- moyenne française, et elle se trompe dans les deux sens à la fois: Christèle
-- (pain + fromage + dessert) est à 48 %, iku (pain seul) à 79 %. Trois colonnes
-- remplacent la moyenne par un calcul, bouche par bouche.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ AUCUNE MIGRATION DE VALEURS, ET C'EST LA DÉCISION CENTRALE
-- ══════════════════════════════════════════════════════════════════════════
--
-- On ne dérive PAS une journée et un sport depuis un ancien cran. « Assis +
-- sport 2-3x » n'est pas reconstructible depuis `trains_some`: l'information
-- n'a jamais été saisie, et la fabriquer serait écrire un fait que personne n'a
-- dit — la faute exacte que ce dépôt documente sous « paramètre de garde
-- optionnel = garde désarmée ». L'ancien cran reste, et il devient le REPLI
-- NOMMÉ (`activityFactorOf`, source `legacy`).
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ POURQUOI DEUX `…_asked_at`, ET PAS SEULEMENT DES VALEURS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Parce qu'un compteur doit distinguer TROIS états et pas deux:
--
--     répondu       la fiche porte les réponses
--     pas répondu   la question a été POSÉE, personne n'a tranché
--     pas posé      la fiche est plus vieille que ce lot
--
-- Sans ces deux horodatages, « pas posé » et « pas répondu » rendent le même
-- NULL, et personne ne sait s'il faut aller poser la question ou accepter le
-- refus. C'est le zéro ambigu que ce chantier paie en boucle.
--
-- ⚠️ ILS SONT ÉCRITS PAR UN DRAPEAU EXPLICITE (`p_activity_axes_asked`,
-- `p_meal_structure_asked`), jamais déduits d'un `null`. C'est ce qui permet à
-- la RPC de DÉ-RÉPONDRE (écrire `null` sur une valeur déjà posée) sans confondre
-- « efface » et « ne touche pas » — la cicatrice `current` périmé, résolue par
-- un jeton au lieu d'un silence.

-- ══════════════════════════════════════════════════════════════════════════
-- ① LES SEPT COLONNES
-- ══════════════════════════════════════════════════════════════════════════

alter table public.household_member_bodies
  add column if not exists day_activity text,
  add column if not exists sport_frequency text,
  add column if not exists activity_axes_asked_at timestamptz,
  add column if not exists takes_dessert boolean,
  add column if not exists takes_cheese boolean,
  add column if not exists takes_bread boolean,
  add column if not exists meal_structure_asked_at timestamptz;

alter table public.household_member_bodies
  drop constraint if exists household_member_bodies_day_activity_check;
alter table public.household_member_bodies
  add constraint household_member_bodies_day_activity_check
  check (
    day_activity is null
    or day_activity in ('seated', 'on_feet', 'physical_job')
  );

alter table public.household_member_bodies
  drop constraint if exists household_member_bodies_sport_frequency_check;
alter table public.household_member_bodies
  add constraint household_member_bodies_sport_frequency_check
  check (
    sport_frequency is null
    or sport_frequency in ('none', '1_2', '3_4', '5_plus')
  );

comment on column public.household_member_bodies.day_activity is
  'Le PREMIER axe d''activité (2026-08-20): ce que la journée fait faire au '
  'corps, SPORT EXCLU — `seated` | `on_feet` | `physical_job`. `null` = pas '
  'répondu, et le repli est `activity_level` (les quatre crans mélangés), '
  'jamais une valeur dérivée. Vocabulaire: `DAY_ACTIVITY_LEVELS` (tokens.ts). '
  'Facteur: `DAY_ACTIVITY_BASE` + `SPORT_PAL_PER_WEEKLY_SESSION` '
  '(meal_envelope.ts), dérivés des bandes FAO/WHO/UNU 2004.';

comment on column public.household_member_bodies.sport_frequency is
  'Le SECOND axe d''activité (2026-08-20): combien de séances par semaine, '
  'JOURNÉE EXCLUE — `none` | `1_2` | `3_4` | `5_plus`. ⛔ `none` est une '
  'RÉPONSE (« je ne fais pas de sport »), pas une absence de réponse: c''est '
  '`null` qui veut dire « pas répondu ». Vocabulaire: `SPORT_FREQUENCIES`.';

comment on column public.household_member_bodies.activity_axes_asked_at is
  'QUAND un écran portant les DEUX questions a enregistré cette fiche. ⛔ Il '
  'existe pour qu''un compteur distingue « pas posé » (null) de « pas '
  'répondu » (non null, deux axes null). Deux nombres pour trois états est le '
  'zéro ambigu que ce dépôt paie en boucle. Écrit par un DRAPEAU explicite '
  '(`p_activity_axes_asked`), jamais déduit d''un null de valeur.';

comment on column public.household_member_bodies.takes_dessert is
  'LOT ① (2026-08-20) — cette bouche prend-elle un dessert au repas ? ⛔ '
  'TRI-ÉTAT: `false` est une RÉPONSE qui fait MONTER la part du plat composé; '
  '`null` veut dire « pas répondu » et retombe sur la moyenne 0,42. Les deux '
  'ne peuvent pas partager une case décochée, sinon un formulaire enregistré '
  'sans être lu écrirait « ni pain ni fromage ni dessert », c''est-à-dire un '
  'plat qui porte 100 %% du repas. Voir `composedDishShare` (mouth_anchor.ts).';

comment on column public.household_member_bodies.takes_cheese is
  'LOT ① (2026-08-20) — du fromage au repas ? Tri-état, voir `takes_dessert`.';

comment on column public.household_member_bodies.takes_bread is
  'LOT ① (2026-08-20) — du pain au repas ? Tri-état, voir `takes_dessert`.';

comment on column public.household_member_bodies.meal_structure_asked_at is
  'QUAND un écran portant les TROIS cases a enregistré cette fiche. Même rôle '
  'et même raison que `activity_axes_asked_at`.';

-- ══════════════════════════════════════════════════════════════════════════
-- ② LA PORTE D'ÉCRITURE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `drop` PUIS `create`, PAS `create or replace`. Ajouter des paramètres crée
-- une SECONDE fonction; les deux resteraient résolvables par appel nommé
-- PostgREST, et le jour où un appelant n'en passe qu'une partie, PostgreSQL
-- rendrait « function is not unique » — ou, pire, choisirait la vieille, qui
-- n'écrit aucun des sept champs. L'ancienne signature part. C'est mot pour mot
-- l'arbitrage de `20260818160000`, et pour la même raison.
--
-- ⚠️ LES DEUX DRAPEAUX GOUVERNENT, PAS LES NULLS DE VALEUR.
--     `p_*_asked = false`  ->  on ne touche à RIEN de ce bloc (c'est l'écran
--                              qui ne connaît pas les questions).
--     `p_*_asked = true`   ->  on écrit les valeurs TELLES QUELLES, nulls
--                              compris, et on horodate.
-- C'est ce qui rend une dé-réponse possible sans rouvrir la confusion
-- « null = efface » / « null = ne touche pas » que `p_activity_level` a dû
-- trancher en faveur du second, en assumant qu'aucun chemin n'efface un cran.
--
-- ⚠️ ET LES DEUX VOCABULAIRES SONT VÉRIFIÉS ICI, AVEC DES REFUS NOMMÉS. Les
-- CHECK suffiraient à protéger la base, mais ils lèveraient une violation de
-- contrainte PostgreSQL affichée en toutes lettres dans un formulaire
-- d'accueil. Les sept autres refus de cette fonction sont nommés; ces deux-là
-- le sont aussi.

drop function if exists public.keel_household_set_member_body(uuid, numeric, numeric, text, text);

create function public.keel_household_set_member_body(
  p_member uuid,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_gender text,
  p_activity_level text default null,
  p_day_activity text default null,
  p_sport_frequency text default null,
  p_activity_axes_asked boolean default false,
  p_takes_dessert boolean default null,
  p_takes_cheese boolean default null,
  p_takes_bread boolean default null,
  p_meal_structure_asked boolean default false
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
  v_target uuid;
  v_activity text := nullif(btrim(coalesce(p_activity_level, '')), '');
  v_day text := nullif(btrim(coalesce(p_day_activity, '')), '');
  v_sport text := nullif(btrim(coalesce(p_sport_frequency, '')), '');
  v_axes_asked boolean := coalesce(p_activity_axes_asked, false);
  v_structure_asked boolean := coalesce(p_meal_structure_asked, false);
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

  select hm.member_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if p_height_cm is null or p_weight_kg is null
     or btrim(coalesce(p_gender, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'body_incomplete');
  end if;
  if p_height_cm < 30 or p_height_cm > 260 then
    return jsonb_build_object('ok', false, 'reason', 'bad_height');
  end if;
  if p_weight_kg < 2 or p_weight_kg > 400 then
    return jsonb_build_object('ok', false, 'reason', 'bad_weight');
  end if;
  if p_gender not in ('male', 'female', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'bad_gender');
  end if;
  -- ⚠️ NI LE CRAN NI LES DEUX AXES NI LES TROIS CASES NE SONT DANS LE
  -- « TOUT-OU-RIEN ». Le corps l'est (les trois ou aucun), parce que le moteur
  -- SAUTE une ligne partielle. Tout le reste a un repli documenté et sûr, donc
  -- l'exiger transformerait des questions auxquelles on a le droit de ne pas
  -- répondre en un mur devant la taille et le poids, qui eux sont exigés.
  if v_activity is not null
     and v_activity not in ('sedentary', 'on_feet', 'trains_some', 'trains_hard')
  then
    return jsonb_build_object('ok', false, 'reason', 'bad_activity_level');
  end if;
  if v_day is not null
     and v_day not in ('seated', 'on_feet', 'physical_job')
  then
    return jsonb_build_object('ok', false, 'reason', 'bad_day_activity');
  end if;
  if v_sport is not null
     and v_sport not in ('none', '1_2', '3_4', '5_plus')
  then
    return jsonb_build_object('ok', false, 'reason', 'bad_sport_frequency');
  end if;

  insert into public.household_member_bodies as b
    (member_id, household_id, height_cm, weight_kg, gender, activity_level,
     day_activity, sport_frequency, activity_axes_asked_at,
     takes_dessert, takes_cheese, takes_bread, meal_structure_asked_at,
     recorded_by)
  values
    (p_member, v_household, round(p_height_cm, 1), round(p_weight_kg, 1),
     p_gender, v_activity,
     case when v_axes_asked then v_day else null end,
     case when v_axes_asked then v_sport else null end,
     case when v_axes_asked then now() else null end,
     case when v_structure_asked then p_takes_dessert else null end,
     case when v_structure_asked then p_takes_cheese else null end,
     case when v_structure_asked then p_takes_bread else null end,
     case when v_structure_asked then now() else null end,
     v_user)
  on conflict (member_id) do update
    set height_cm = excluded.height_cm,
        weight_kg = excluded.weight_kg,
        gender = excluded.gender,
        -- « ne touche pas » quand l'appelant ne sait pas. Voir l'en-tête de
        -- `20260818160000`: contrepartie assumée, aucun chemin n'efface un cran.
        activity_level = coalesce(excluded.activity_level, b.activity_level),
        -- Les deux axes, EUX, suivent le drapeau: écrits tels quels quand la
        -- question a été posée, intacts quand elle ne l'a pas été.
        day_activity = case when v_axes_asked then v_day else b.day_activity end,
        sport_frequency = case
          when v_axes_asked then v_sport else b.sport_frequency end,
        activity_axes_asked_at = case
          when v_axes_asked then now() else b.activity_axes_asked_at end,
        takes_dessert = case
          when v_structure_asked then p_takes_dessert else b.takes_dessert end,
        takes_cheese = case
          when v_structure_asked then p_takes_cheese else b.takes_cheese end,
        takes_bread = case
          when v_structure_asked then p_takes_bread else b.takes_bread end,
        meal_structure_asked_at = case
          when v_structure_asked then now() else b.meal_structure_asked_at end,
        recorded_by = excluded.recorded_by
    where b.member_id = excluded.member_id;

  return jsonb_build_object('ok', true, 'member_id', p_member);
end;
$function$;

comment on function public.keel_household_set_member_body(
  uuid, numeric, numeric, text, text, text, text, boolean,
  boolean, boolean, boolean, boolean) is
  'Enregistre le corps d''une bouche — taille, poids, sexe, TOUT-OU-RIEN — plus '
  'trois blocs qui ont chacun un repli sûr et vivent donc HORS du tout-ou-rien: '
  'le cran d''activité (2026-08-18), les DEUX AXES journée x sport et les TROIS '
  'CASES de structure de repas (2026-08-20). '
  '⛔ Les deux axes et les trois cases suivent un DRAPEAU explicite '
  '(`p_*_asked`), pas un null de valeur: c''est ce qui permet de dé-répondre, '
  'et c''est ce qui fait que `…_asked_at` distingue « pas posé » de « pas '
  'répondu ». Aucune valeur n''est dérivée d''une autre — « assis + sport 2-3x » '
  'n''est pas reconstructible depuis `trains_some`.';

revoke all on function public.keel_household_set_member_body(
  uuid, numeric, numeric, text, text, text, text, boolean,
  boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.keel_household_set_member_body(
  uuid, numeric, numeric, text, text, text, text, boolean,
  boolean, boolean, boolean, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- ③ LA PORTE DE LECTURE DU SERVEUR
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ « Une colonne ajoutée sans être ajoutée à cette signature est une collecte
-- qu'on affiche et que personne ne lit — c'est-à-dire un champ décoratif, et un
-- champ décoratif fait croire que le produit tient compte de quelque chose dont
-- il ne tient pas compte. » (`20260818100000`, mot pour mot.)
--
-- ⚠️ `…_asked_at` SORT EN BOOLÉEN, pas en horodatage: l'appelant n'a besoin que
-- de savoir SI la question a été posée, et un horodatage rendu au moteur serait
-- une donnée de plus qui traverse sans lecteur.
--
-- `drop` puis `create`: le TYPE DE RETOUR change, et `create or replace` ne le
-- permet pas.

drop function if exists public.keel_household_bodies_for(uuid);

create function public.keel_household_bodies_for(p_household uuid)
returns table (
  member_id uuid,
  height_cm numeric,
  weight_kg numeric,
  gender text,
  age_years integer,
  activity_level text,
  day_activity text,
  sport_frequency text,
  activity_axes_asked boolean,
  takes_dessert boolean,
  takes_cheese boolean,
  takes_bread boolean,
  meal_structure_asked boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    hm.member_id,
    b.height_cm,
    b.weight_kg,
    b.gender,
    case
      when public.keel_household_member_birth_date(hm.member_id) is null then null
      else extract(
        year from age(
          current_date,
          public.keel_household_member_birth_date(hm.member_id)
        )
      )::integer
    end as age_years,
    b.activity_level,
    b.day_activity,
    b.sport_frequency,
    (b.activity_axes_asked_at is not null) as activity_axes_asked,
    b.takes_dessert,
    b.takes_cheese,
    b.takes_bread,
    (b.meal_structure_asked_at is not null) as meal_structure_asked
  from public.household_members hm
  left join public.household_member_bodies b on b.member_id = hm.member_id
  -- Un `p_household` nul rend zéro ligne: `= null` n'est jamais vrai.
  where hm.household_id = p_household;
$function$;

comment on function public.keel_household_bodies_for(uuid) is
  'Le corps SAISI de chaque bouche du foyer, mineurs compris, POUR LE SERVEUR. '
  'Prend le foyer en argument parce que `auth.uid()` est NULL sous la clé de '
  'service. 2026-08-18: rend `activity_level`. 2026-08-20: rend aussi les DEUX '
  'AXES (`day_activity`, `sport_frequency`) et les TROIS CASES de structure de '
  'repas, chacun accompagné d''un booléen `…_asked` — sans lui, « pas posé » et '
  '« pas répondu » rendraient le même null et le compteur mentirait.';

revoke all on function public.keel_household_bodies_for(uuid) from public, anon;
grant execute on function public.keel_household_bodies_for(uuid) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- ④ LA PORTE DE LECTURE DU NAVIGATEUR
-- ══════════════════════════════════════════════════════════════════════════
--
-- Sans elle, l'écran de réglage rendrait des cases vierges sur une ligne qui
-- porte une réponse, et le maître lirait « personne n'a répondu » sur sa propre
-- saisie de la veille — puis l'écraserait en enregistrant. C'est le défaut
-- « formulaire figé au montage » et il mord DEUX FOIS plus fort ici: la porte
-- d'écriture accepte désormais d'effacer, donc un écran qui affiche du vide non
-- lu l'écrit vraiment.

drop function if exists public.keel_household_member_bodies();

create function public.keel_household_member_bodies()
returns table (
  member_id uuid,
  height_cm numeric,
  weight_kg numeric,
  gender text,
  activity_level text,
  day_activity text,
  sport_frequency text,
  activity_axes_asked boolean,
  takes_dessert boolean,
  takes_cheese boolean,
  takes_bread boolean,
  meal_structure_asked boolean,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select b.member_id, b.height_cm, b.weight_kg, b.gender, b.activity_level,
         b.day_activity, b.sport_frequency,
         (b.activity_axes_asked_at is not null) as activity_axes_asked,
         b.takes_dessert, b.takes_cheese, b.takes_bread,
         (b.meal_structure_asked_at is not null) as meal_structure_asked,
         b.recorded_at
  from public.household_member_bodies b
  join public.household_members me
    on me.user_id = (select auth.uid())
   and me.role = 'owner'
   and me.household_id = b.household_id;
$function$;

comment on function public.keel_household_member_bodies() is
  'Les corps saisis du foyer, POUR SON COMPTE MAÎTRE SEUL. Un non-maître reçoit '
  'zéro ligne — pas une erreur, qui serait déjà un renseignement. C''est le '
  'seul chemin de lecture ouvert à un navigateur: la table n''a aucun grant à '
  '`authenticated`, exprès. 2026-08-20: rend aussi les deux axes, les trois '
  'cases, et les deux booléens `…_asked` — l''écran doit pouvoir remontrer une '
  'réponse, sinon il l''écrase.';

-- `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT implicite,
-- et toute fonction NEUVE — celles-ci le sont — est exécutable par tout le
-- monde par défaut.
revoke all on function public.keel_household_member_bodies() from public, anon;
grant execute on function public.keel_household_member_bodies() to authenticated;
