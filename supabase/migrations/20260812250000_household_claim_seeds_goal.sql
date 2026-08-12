-- ============================================================================
-- FF-060 (lot 3B) — RÉCLAMER SON PROFIL NE PERD PLUS L'OBJECTIF SAISI POUR SOI
--
-- ── LE DÉFAUT, TEL QU'IL SE PRODUIT ────────────────────────────────────────
--
-- Depuis le 2026-08-11 (D1 du chantier foyer), `keel_household_roster_for`
-- résout l'objectif d'une bouche ainsi:
--
--     case when hm.user_id is null then hm.goal else sg.goal end
--
-- C'est-à-dire: dès que la bouche A UN COMPTE, son objectif vient de SON
-- « about you » (`student_goals`), et plus de sa ligne de foyer. La décision
-- est bonne — deux sources qui divergent sans arbitre écrit sont le doublon
-- qui produit un bug six mois plus tard — et elle n'est PAS défaite ici.
--
-- Mais elle a un trou, et le parcours d'entrée le fabrique en série:
--
--   1. le maître saisit l'objectif de son conjoint dans l'entonnoir
--      (`household_members.goal = 'muscle_gain'`), et le plan bifurque
--      correctement dès le premier soir;
--   2. il l'invite à réclamer son profil;
--   3. le conjoint réclame → `user_id` passe de NULL à son compte;
--   4. `sg.goal` est NULL — il n'a jamais rempli son « about you », il vient
--      de créer son compte — donc son objectif CESSE D'ÊTRE LU.
--
-- Sa portion se dégrade en part standard, personne ne l'a demandé, et RIEN ne
-- le signale. Le geste qui devait récompenser l'engagement le punit.
--
-- ── LA CORRECTION: SEMER, PAS DUPLIQUER ────────────────────────────────────
--
-- La réclamation crée la ligne `student_goals` du titulaire AVEC l'objectif
-- que sa ligne de foyer portait. La source unique reste `student_goals`: elle
-- est seulement AMORCÉE au lieu de naître vide.
--
-- Deux options ont été écartées, et pour des raisons qui tiennent:
--
--   ② bloquer l'écran de réclamation tant que l'« about you » n'est pas
--     rempli — ça punit celui qui s'engage, exactement ce qu'on veut éviter;
--   ③ faire retomber le roster sur `hm.goal` quand `sg` est vide — ça recrée
--     les DEUX SOURCES QUI DIVERGENT SANS ARBITRE que D1 a délibérément
--     supprimées, et le jour où les deux valeurs se contredisent personne ne
--     sait laquelle ment.
--
-- ⚠️ `on conflict (user_id) do nothing` EST LA GARDE, PAS UNE PRÉCAUTION.
-- Quelqu'un qui a DÉJÀ un « about you » (un compte individuel qui rejoint le
-- foyer de son conjoint) a déclaré son objectif lui-même: le sien fait
-- autorité, et une graine qui l'écraserait ferait décider par un tiers de la
-- direction nutritionnelle d'un adulte. FF-048 R8 dans les deux sens.
--
-- ⚠️ `household_members.goal` N'EST PAS EFFACÉ. La ligne le garde: si l'accès
-- est retiré plus tard (`keel_household_detach_member` remet `user_id` à NULL),
-- le roster y retombe et la personne retrouve la direction qu'on avait posée
-- pour elle. Effacer ferait perdre en silence, une seconde fois.
--
-- ⚠️ `content_locale = 'en-GB'`, comme les DEUX autres écrivains de cette
-- colonne (`createOwnerGoalRow` et `StudentWeekPlanPage`). Ce n'est PAS
-- `profiles.locale`: cette colonne-là vaut `fr-FR` par défaut, et l'app
-- authentifiée est déclarée anglaise (`i18n/catalog.ts`). Semer la locale du
-- profil écrirait `fr-FR` sur des contenus anglais, pour tout le monde.
--
-- Le reste du corps est INCHANGÉ, mot pour mot, depuis 20260811060000.
-- ============================================================================

create or replace function public.keel_household_join(p_token text, p_country text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv record;
  v_claimed integer;
  v_declared text;
  v_country text;
  v_goal text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select lower(btrim(coalesce(u.email, ''))) into v_email
  from auth.users u where u.id = v_user;

  -- `for update` sur l'INVITATION seule (et pas sur la jointure): c'est elle
  -- qui porte l'usage unique. La ligne membre est verrouillée juste après, par
  -- l'UPDATE conditionnel lui-même.
  select * into v_inv
  from public.household_invitations hi
  where hi.token_hash = public.coach_invite_token_hash(coalesce(p_token, ''))
  for update;

  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  -- L'ADRESSE AVANT L'ÉTAT DU COMPTE (lot 6): un jeton volé doit être refusé
  -- parce qu'il n'est pas adressé au voleur, que le voleur ait déjà un foyer ou
  -- non. L'ordre ne bouge pas.
  if v_email is null or v_email = '' or v_email <> v_inv.email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;
  if v_inv.consumed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  if public.keel_household_of(v_user) is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
  end if;

  -- ── LE PAYS, APRÈS LES REFUS D'INVITATION ET AVANT TOUT EFFET ───────────
  --
  -- APRÈS: un voleur de jeton ne doit rien apprendre de son propre profil par
  -- cette porte, et surtout un `country_required` rendu sur un jeton expiré
  -- ferait lire « il manque un pays » là où le vrai fait est « ce lien est
  -- mort ». Les refus de l'invitation restent les premiers.
  --
  -- AVANT L'ATTACHEMENT: c'est tout l'objet du chantier. Une place dans un
  -- foyer ne s'occupe pas sans pays déclaré — sinon le résolveur de crise
  -- déduit un pays de la langue, et on rouvre `20260804180000`.
  select p.country into v_declared from public.profiles p where p.id = v_user;

  v_country := nullif(btrim(coalesce(p_country, '')), '');
  if v_country is not null then
    v_country := upper(v_country);
    -- La FORME, comme `profiles_country_iso3166_check` — jamais une liste
    -- fermée, qui refuserait un pays légitime le jour où quelqu'un s'y
    -- inscrit. Un REFUS NOMMÉ et pas un `raise`: cette fonction est appelée
    -- par un écran, et un 500 opaque sur ce chemin est indiscernable d'un
    -- produit cassé (R7 — l'échec est à l'écriture, et il se lit).
    if v_country !~ '^[A-Z]{2}$' then
      return jsonb_build_object('ok', false, 'reason', 'bad_country');
    end if;
  end if;

  if v_declared is null and v_country is null then
    return jsonb_build_object('ok', false, 'reason', 'country_required');
  end if;

  -- L'OBJECTIF DE LA LIGNE, LU AVANT L'ATTACHEMENT.
  --
  -- ⚠️ AVANT, ET PAS APRÈS. Une fois `user_id` posé, `hm.goal` est toujours
  -- là — mais le lire après ferait dépendre la graine d'un ordre d'exécution
  -- qu'un futur ajustement pourrait changer sans le remarquer. Lire la valeur
  -- pendant qu'elle est encore la source qui fait autorité rend l'intention
  -- explicite: on sème CE QUI ÉTAIT LU JUSQU'ICI.
  select hm.goal into v_goal
  from public.household_members hm
  where hm.member_id = v_inv.member_id;

  -- L'ATTACHEMENT. UNE colonne écrite, sur une ligne qui existe déjà.
  --
  -- `and user_id is null` N'EST PAS REDONDANT avec la vérification de
  -- `keel_household_invite`: entre l'émission et ici il peut s'être passé des
  -- jours, et deux jetons peuvent viser la même bouche. C'est CE `where` qui
  -- rend la réclamation non rejouable.
  --
  -- Ni `first_name` ni `birth_date` ne sont touchés: la ligne les porte déjà.
  update public.household_members
     set user_id = v_user
   where member_id = v_inv.member_id
     and user_id is null;
  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  -- ── LA GRAINE (FF-060, D2) ──────────────────────────────────────────────
  --
  -- APRÈS le succès de l'attachement, exactement comme le pays: une tentative
  -- refusée (jeton volé, ligne déjà prise) ne doit laisser AUCUNE trace sur le
  -- compte de qui a essayé — et une ligne `student_goals` posée sur un refus
  -- serait une trace, visible, et qui changerait ce que le générateur compose.
  if v_goal is not null and v_goal <> '' then
    insert into public.student_goals (user_id, goal, content_locale)
    values (v_user, v_goal, 'en-GB')
    on conflict (user_id) do nothing;
  end if;

  -- LE PAYS S'ÉCRIT APRÈS LE SUCCÈS, ET SEULEMENT S'IL MANQUAIT.
  --
  -- `country is null` est la seule garde, exactement comme dans
  -- `keel_attach_student_to_coach`: une déclaration faite par la personne ne se
  -- fait jamais écraser par une porte ultérieure. Et l'écrire après
  -- l'attachement évite qu'une tentative refusée (jeton volé, ligne déjà prise)
  -- laisse une trace sur le profil de qui a essayé.
  if v_country is not null and v_declared is null then
    update public.profiles
       set country = v_country,
           updated_at = now()
     where id = v_user
       and country is null;
  end if;

  update public.household_invitations
     set consumed_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'household_id', v_inv.household_id,
    'member_id', v_inv.member_id
  );
end;
$$;

comment on function public.keel_household_join(text, text) is
  'Attache un compte à une bouche existante. FF-060 D2: sème household_members.goal '
  'dans la ligne student_goals du titulaire si elle n''existe pas encore — la source '
  'unique reste student_goals, elle est seulement amorcée au lieu de naître vide.';
