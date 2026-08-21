-- KEEL — ⑤ L'APPÉTIT, TROIS CRANS TRANSITOIRES (2026-08-20).
--
-- Chantier: `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`.
-- Jetons: `_shared/keel/tokens.ts` (`APPETITE_LEVELS`).
-- Facteurs: `_shared/keel/meal_envelope.ts` (`APPETITE_FACTORS`).
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ CE LOT EST DESTINÉ À MOURIR, ET C'EST LA PREMIÈRE CHOSE À SAVOIR
-- ══════════════════════════════════════════════════════════════════════════
--
-- Le lot ⑦ (la boucle de poids) le remplace. Si quelqu'un est stable à 58 kg,
-- alors ce qu'il mange EST sa maintenance: Mifflin rend une ESTIMATION, sa
-- stabilité est une MESURE, et la mesure gagne toujours. Ces trois crans sont
-- une valeur de DÉPART qu'on oublie, pas une vérité permanente.
--
-- ⚠️ MAIS ILS NE MOURRONT PAS POUR TOUT LE MONDE. `student_body_measures` est
-- claveté sur `user_id`: une bouche SANS COMPTE n'a aucune série de pesées —
-- c'est le cas de Christèle, et c'est le cas nominal d'un foyer. Pour elles, ⑤
-- restera la seule correction tant que le foyer n'aura pas de moyen de peser
-- une bouche sans compte.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ POURQUOI SUR `household_member_bodies` ET PAS LE PATRON DE `goal`
-- ══════════════════════════════════════════════════════════════════════════
--
-- Le cadre suggérait le patron de `goal`: `household_members` pour une bouche
-- sans compte, `student_goals` pour un compte, arbitré par
-- `keel_household_roster_for`. Ce n'est PAS ce qui est fait ici, et voici
-- pourquoi.
--
-- Ce patron existe parce qu'un OBJECTIF est une opinion dont il n'y a qu'un
-- porteur légitime: la base REFUSE `keel_household_set_member_goal` sur une
-- bouche qui a un compte (`has_account`), parce que cette personne le règle
-- elle-même. L'appétit n'a pas cette propriété — c'est un champ de la FICHE,
-- posé par le compte maître, exactement comme la taille, le poids, le cran
-- d'activité et les deux axes journée x sport livrés ce matin.
--
-- Le suivre ici coûterait: une seconde porte d'écriture pour un champ que le
-- MÊME formulaire écrit, une seconde branche de résolution dans le roster, et
-- une bouche avec compte dont l'appétit vivrait ailleurs que son cran
-- d'activité — alors que les deux sont posés côte à côte dans le même bloc du
-- pop-up. Deux magasins pour deux moitiés d'une même question divergent.
--
-- ⚠️ CE QUE ÇA COÛTE, ET C'EST NOMMÉ: un élève avec compte ne règle PAS son
-- appétit depuis son propre écran — c'est le maître du foyer qui le pose sur
-- sa fiche. C'est la même asymétrie que le corps et l'activité, déjà assumée
-- deux fois; elle n'est pas neuve avec ce lot, mais elle s'étend.

alter table public.household_member_bodies
  add column if not exists appetite text,
  add column if not exists appetite_asked_at timestamptz;

alter table public.household_member_bodies
  drop constraint if exists household_member_bodies_appetite_check;
alter table public.household_member_bodies
  add constraint household_member_bodies_appetite_check
  check (appetite is null or appetite in ('small', 'average', 'large'));

comment on column public.household_member_bodies.appetite is
  '⑤ (2026-08-20) — `small` | `average` | `large`, soit x0,90 / x1,00 / x1,10 '
  'sur l''ESTIMATION d''entretien (jamais sur les grammes: posé sur les '
  'grammes, il se composerait avec l''ancrage absolu et ferait deux couches '
  'qui dimensionnent). ⛔ TRANSITOIRE: le lot ⑦ (boucle de poids) le remplace '
  'pour toute bouche qui a un compte ET une série de pesées. `null` = pas '
  'répondu ⇒ x1,00, un neutre VRAI. Les ±10 % sont l''incertitude '
  'inter-individuelle de Mifflin-St Jeor, pas un curseur de confort.';

comment on column public.household_member_bodies.appetite_asked_at is
  'QUAND un écran portant la question a enregistré cette fiche. Même rôle et '
  'même raison que `activity_axes_asked_at`: sans lui, « pas posé » et « pas '
  'répondu » rendent le même null, et deux nombres pour trois états est le '
  'zéro ambigu que ce chantier paie en boucle.';

-- ══════════════════════════════════════════════════════════════════════════
-- LA PORTE D'ÉCRITURE — TROISIÈME RÉÉCRITURE, MÊME DOCTRINE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `drop` PUIS `create`, comme les deux fois précédentes: ajouter des
-- paramètres crée une SECONDE fonction, les deux restent résolvables par appel
-- nommé PostgREST, et le jour où un appelant n'en passe qu'une partie
-- PostgreSQL rend « function is not unique » — ou choisit la vieille, qui
-- n'écrit rien.
--
-- ⚠️ LE DRAPEAU GOUVERNE, PAS LE NULL DE VALEUR. `p_appetite_asked = false` ⇒
-- on ne touche à rien de ce bloc; `true` ⇒ on écrit la valeur TELLE QUELLE,
-- `null` compris (donc on peut dé-répondre), et on horodate.

drop function if exists public.keel_household_set_member_body(
  uuid, numeric, numeric, text, text, text, text, boolean,
  boolean, boolean, boolean, boolean);

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
  p_meal_structure_asked boolean default false,
  p_appetite text default null,
  p_appetite_asked boolean default false
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
  v_appetite text := nullif(btrim(coalesce(p_appetite, '')), '');
  v_axes_asked boolean := coalesce(p_activity_axes_asked, false);
  v_structure_asked boolean := coalesce(p_meal_structure_asked, false);
  v_appetite_asked boolean := coalesce(p_appetite_asked, false);
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
  -- Rien de ce bloc n'est dans le « tout-ou-rien » du corps: chacun a un repli
  -- documenté et sûr, alors que le moteur SAUTE une ligne de corps partielle.
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
  if v_appetite is not null
     and v_appetite not in ('small', 'average', 'large')
  then
    return jsonb_build_object('ok', false, 'reason', 'bad_appetite');
  end if;

  insert into public.household_member_bodies as b
    (member_id, household_id, height_cm, weight_kg, gender, activity_level,
     day_activity, sport_frequency, activity_axes_asked_at,
     takes_dessert, takes_cheese, takes_bread, meal_structure_asked_at,
     appetite, appetite_asked_at,
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
     case when v_appetite_asked then v_appetite else null end,
     case when v_appetite_asked then now() else null end,
     v_user)
  on conflict (member_id) do update
    set height_cm = excluded.height_cm,
        weight_kg = excluded.weight_kg,
        gender = excluded.gender,
        activity_level = coalesce(excluded.activity_level, b.activity_level),
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
        appetite = case when v_appetite_asked then v_appetite else b.appetite end,
        appetite_asked_at = case
          when v_appetite_asked then now() else b.appetite_asked_at end,
        recorded_by = excluded.recorded_by
    where b.member_id = excluded.member_id;

  return jsonb_build_object('ok', true, 'member_id', p_member);
end;
$function$;

comment on function public.keel_household_set_member_body(
  uuid, numeric, numeric, text, text, text, text, boolean,
  boolean, boolean, boolean, boolean, text, boolean) is
  'Le corps d''une bouche (TOUT-OU-RIEN) plus quatre blocs qui ont chacun un '
  'repli sûr et vivent donc HORS du tout-ou-rien: le cran d''activité '
  '(2026-08-18), les deux axes journée x sport, les trois cases de structure '
  'de repas, et l''APPÉTIT (⑤, 2026-08-20 — TRANSITOIRE, le lot ⑦ le '
  'remplace). ⛔ Chaque bloc suit un DRAPEAU explicite (`p_*_asked`), pas un '
  'null de valeur: c''est ce qui permet de dé-répondre, et ce qui fait que '
  '`…_asked_at` distingue « pas posé » de « pas répondu ».';

revoke all on function public.keel_household_set_member_body(
  uuid, numeric, numeric, text, text, text, text, boolean,
  boolean, boolean, boolean, boolean, text, boolean) from public, anon;
grant execute on function public.keel_household_set_member_body(
  uuid, numeric, numeric, text, text, text, text, boolean,
  boolean, boolean, boolean, boolean, text, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- LES DEUX LECTURES — « une colonne que personne ne lit est décorative »
-- ══════════════════════════════════════════════════════════════════════════

drop function if exists public.keel_household_bodies_for(uuid);

create function public.keel_household_bodies_for(p_household uuid)
returns table (
  member_id uuid, height_cm numeric, weight_kg numeric, gender text,
  age_years integer, activity_level text, day_activity text,
  sport_frequency text, activity_axes_asked boolean, takes_dessert boolean,
  takes_cheese boolean, takes_bread boolean, meal_structure_asked boolean,
  appetite text, appetite_asked boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    hm.member_id, b.height_cm, b.weight_kg, b.gender,
    case
      when public.keel_household_member_birth_date(hm.member_id) is null then null
      else extract(year from age(current_date,
        public.keel_household_member_birth_date(hm.member_id)))::integer
    end as age_years,
    b.activity_level, b.day_activity, b.sport_frequency,
    (b.activity_axes_asked_at is not null) as activity_axes_asked,
    b.takes_dessert, b.takes_cheese, b.takes_bread,
    (b.meal_structure_asked_at is not null) as meal_structure_asked,
    b.appetite,
    (b.appetite_asked_at is not null) as appetite_asked
  from public.household_members hm
  left join public.household_member_bodies b on b.member_id = hm.member_id
  -- Un `p_household` nul rend zéro ligne: `= null` n'est jamais vrai.
  where hm.household_id = p_household;
$function$;

comment on function public.keel_household_bodies_for(uuid) is
  'Le corps SAISI de chaque bouche du foyer, POUR LE SERVEUR. Prend le foyer '
  'en argument: `auth.uid()` est NULL sous la clé de service. Rend aussi le '
  'cran (2026-08-18), les deux axes, les trois cases et l''APPÉTIT '
  '(2026-08-20), chacun avec son booléen `…_asked` — sans lui, « pas posé » et '
  '« pas répondu » rendraient le même null et le compteur mentirait.';

revoke all on function public.keel_household_bodies_for(uuid) from public, anon;
grant execute on function public.keel_household_bodies_for(uuid) to service_role;

drop function if exists public.keel_household_member_bodies();

create function public.keel_household_member_bodies()
returns table (
  member_id uuid, height_cm numeric, weight_kg numeric, gender text,
  activity_level text, day_activity text, sport_frequency text,
  activity_axes_asked boolean, takes_dessert boolean, takes_cheese boolean,
  takes_bread boolean, meal_structure_asked boolean,
  appetite text, appetite_asked boolean,
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
         b.appetite,
         (b.appetite_asked_at is not null) as appetite_asked,
         b.recorded_at
  from public.household_member_bodies b
  join public.household_members me
    on me.user_id = (select auth.uid())
   and me.role = 'owner'
   and me.household_id = b.household_id;
$function$;

comment on function public.keel_household_member_bodies() is
  'Les corps saisis du foyer, POUR SON COMPTE MAÎTRE SEUL. Un non-maître '
  'reçoit zéro ligne — pas une erreur, qui serait déjà un renseignement. Rend '
  'l''appétit depuis le 2026-08-20: un écran qui ne peut pas remontrer une '
  'réponse finit par l''écraser, et cette porte accepte désormais d''effacer.';

revoke all on function public.keel_household_member_bodies() from public, anon;
grant execute on function public.keel_household_member_bodies() to authenticated;
