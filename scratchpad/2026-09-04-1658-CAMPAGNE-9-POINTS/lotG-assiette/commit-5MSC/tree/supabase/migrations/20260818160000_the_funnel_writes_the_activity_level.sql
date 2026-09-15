-- KEEL — L'ENTONNOIR ÉCRIT LE NIVEAU D'ACTIVITÉ (lot L0, 2026-08-18).
--
-- ══════════════════════════════════════════════════════════════════════════
-- CE QUE CETTE MIGRATION FERME
-- ══════════════════════════════════════════════════════════════════════════
--
-- `20260818100000` a posé les DEUX colonnes (`profiles.activity_level`,
-- `household_member_bodies.activity_level`), leur CHECK à quatre crans, et a
-- rouvert `keel_household_bodies_for` pour que le moteur les LISE. Elle a même
-- écrit, dans son propre commentaire, pourquoi ce serait mortel de s'arrêter
-- là:
--
--   « une colonne ajoutée sans être ajoutée à cette signature est une collecte
--     qu'on affiche et que personne ne lit — c'est-à-dire un champ décoratif,
--     et un champ décoratif fait croire que le produit tient compte de quelque
--     chose dont il ne tient pas compte. »
--
-- Le symétrique était vrai et n'a pas été écrit: **rien n'écrivait la
-- colonne**. `energy_target.ts:49` affirmait pourtant « quatre crans lisibles
-- sont posés à l'inscription », ce qui était faux au moment où la phrase a été
-- commitée. Un lecteur sans écrivain rend `null` à tout le monde pour toujours,
-- et le `null` est *exactement* le comportement d'avant: le lot entier
-- ressemblait à un lot qui marche.
--
-- ⚠️ CE QUI EST DANS CETTE MIGRATION, ET RIEN D'AUTRE. `profiles` n'a besoin
-- d'aucune RPC: `saveOwnProfile` l'écrit par PostgREST, RLS tient déjà la
-- ligne, et le CHECK tient déjà le vocabulaire. La bouche SANS COMPTE, elle,
-- n'a qu'une porte — `keel_household_set_member_body` — et cette porte ne
-- connaissait pas le champ.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ① LA PORTE D'ÉCRITURE — ET LE PIÈGE DES DEUX ÉCRIVAINS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `drop` PUIS `create`, PAS `create or replace`. Ajouter un paramètre crée
-- une SECONDE fonction; les deux resteraient résolvables par appel nommé
-- PostgREST, et le jour où un appelant ne passe pas `p_activity_level`,
-- PostgreSQL rendrait « function is not unique » — ou, pire, choisirait la
-- vieille, qui n'écrit rien. L'ancienne signature part.
--
-- ⚠️ `p_activity_level is null` VEUT DIRE « NE TOUCHE PAS », PAS « EFFACE ».
-- C'est la cicatrice « `current` périmé efface l'écriture d'avant », et elle
-- mord ici plus qu'ailleurs: cette RPC a DEUX écrans appelants
-- (`SetupPage.tsx` et `HouseholdPage.tsx`), et le corps est TOUT-OU-RIEN. Un
-- écran qui réenregistre taille/poids/sexe sans connaître le cran remettrait
-- donc la colonne à `null` — c'est-à-dire ferait retomber quelqu'un qui a
-- répondu sur l'hypothèse 1,5, en silence, en cliquant sur « Enregistrer ».
--
-- Les deux appelants passent le champ explicitement depuis ce lot; le
-- `coalesce` est la ceinture qui protège le TROISIÈME, celui qui n'est pas
-- encore écrit. Contrepartie assumée et nommée: **aucun chemin n'efface un
-- cran**. C'est cohérent avec le produit — il n'existe pas de cinquième tuile
-- « je ne sais pas », donc aucun écran ne propose de dé-répondre. Le jour où
-- l'un le proposerait, il lui faudra un motif nommé (un jeton d'effacement
-- explicite), jamais un `null` de plus.
--
-- ⚠️ ET LE VOCABULAIRE EST VÉRIFIÉ ICI, avec un REFUS NOMMÉ. Le CHECK de la
-- colonne suffirait à protéger la base, mais il lèverait une violation de
-- contrainte PostgreSQL affichée en toutes lettres dans un entonnoir
-- d'accueil. Les cinq autres refus de cette fonction sont nommés
-- (`bad_height`, `bad_gender`, …); le sixième l'est aussi.

drop function if exists public.keel_household_set_member_body(uuid, numeric, numeric, text);

create function public.keel_household_set_member_body(
  p_member uuid,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_gender text,
  p_activity_level text default null
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
  -- ⚠️ LE CRAN N'EST PAS DANS LE « TOUT-OU-RIEN ». Le corps l'est (les trois ou
  -- aucun), parce que le moteur SAUTE une ligne partielle. L'activité, elle, a
  -- un repli documenté et sûr — l'hypothèse 1,5 —, donc l'exiger transformerait
  -- une question à laquelle on a le droit de ne pas répondre en un mur devant
  -- la taille et le poids, qui eux sont exigés.
  if v_activity is not null
     and v_activity not in ('sedentary', 'on_feet', 'trains_some', 'trains_hard')
  then
    return jsonb_build_object('ok', false, 'reason', 'bad_activity_level');
  end if;

  insert into public.household_member_bodies as b
    (member_id, household_id, height_cm, weight_kg, gender, activity_level,
     recorded_by)
  values
    (p_member, v_household, round(p_height_cm, 1), round(p_weight_kg, 1),
     p_gender, v_activity, v_user)
  on conflict (member_id) do update
    set height_cm = excluded.height_cm,
        weight_kg = excluded.weight_kg,
        gender = excluded.gender,
        -- « ne touche pas » quand l'appelant ne sait pas. Voir l'en-tête.
        activity_level = coalesce(excluded.activity_level, b.activity_level),
        recorded_by = excluded.recorded_by
    where b.member_id = excluded.member_id;

  return jsonb_build_object('ok', true, 'member_id', p_member);
end;
$function$;

comment on function public.keel_household_set_member_body(uuid, numeric, numeric, text, text) is
  'Enregistre le corps d''une bouche — taille, poids, sexe, TOUT-OU-RIEN. '
  'Compte maître uniquement, garde DANS la fonction. Bornes de plausibilité en '
  'base et pas seulement à l''écran. Ce corps DIMENSIONNE (le MIN du tronc, les '
  'add-ons); il ne s''énonce nulle part. '
  '2026-08-18 (L0): elle porte aussi `p_activity_level`, HORS du tout-ou-rien '
  '(il a un repli sûr, le corps n''en a pas). `null` = NE TOUCHE PAS à ce qui '
  'est déjà écrit — deux écrans appellent cette porte et celui qui ignore le '
  'champ ne doit pas faire retomber quelqu''un qui a répondu sur l''hypothèse '
  '1,5. Conséquence assumée: aucun chemin n''efface un cran.';

revoke all on function
  public.keel_household_set_member_body(uuid, numeric, numeric, text, text)
  from public, anon;
grant execute on function
  public.keel_household_set_member_body(uuid, numeric, numeric, text, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- ② LA PORTE DE LECTURE DU NAVIGATEUR
-- ══════════════════════════════════════════════════════════════════════════
--
-- `keel_household_bodies_for` (le SERVEUR) rend déjà le cran depuis ce matin.
-- `keel_household_member_bodies` (le NAVIGATEUR) ne le rend pas — et c'est
-- elle que l'écran de réglage lit pour se remonter.
--
-- Sans elle, l'écran ne peut pas savoir ce qui a déjà été coché: il rendrait
-- quatre tuiles vierges sur une ligne qui porte une réponse, et le maître
-- lirait « personne n'a répondu » sur sa propre saisie de la veille. C'est le
-- défaut « formulaire figé au montage » repris à l'envers — un écran qui
-- affiche du vide non lu finit toujours par le faire écrire.
--
-- `drop` puis `create` pour la même raison qu'au ① : le TYPE DE RETOUR change,
-- et `create or replace` ne le permet pas.
--
-- ⚠️ CE QUI NE CHANGE PAS: elle reste réservée au COMPTE MAÎTRE, et un
-- non-maître reçoit toujours ZÉRO LIGNE — pas une erreur, qui serait déjà un
-- renseignement sur ce que le foyer détient.

drop function if exists public.keel_household_member_bodies();

create function public.keel_household_member_bodies()
returns table (
  member_id uuid,
  height_cm numeric,
  weight_kg numeric,
  gender text,
  activity_level text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select b.member_id, b.height_cm, b.weight_kg, b.gender, b.activity_level,
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
  '`authenticated`, exprès (voir son commentaire). '
  '2026-08-18 (L0): elle rend aussi `activity_level`, sinon l''écran qui pose '
  'la question ne peut pas montrer la réponse déjà donnée.';

-- `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT implicite,
-- et toute fonction NEUVE — celle-ci l'est, on vient de la recréer — est
-- exécutable par tout le monde par défaut.
revoke all on function public.keel_household_member_bodies() from public, anon;
grant execute on function public.keel_household_member_bodies() to authenticated;
