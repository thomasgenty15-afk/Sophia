-- ============================================================================
-- LE FOYER — UNE BOUCHE N'A PAS BESOIN D'UN COMPTE
--
-- Autorité: docs/keel/CHANTIER-FOYER-PROFILS.md (lots 1, 2, 3 et le plafond du
-- lot 7). PIVOT-FOYER §7, §7.5 et son modèle d'invitation sont PÉRIMÉS depuis
-- les arbitrages du 2026-08-08 ; MODEL.md et CONTRACT.md tiennent.
--
-- ── CE QUE CETTE MIGRATION CHANGE, ET POURQUOI D'UN SEUL GESTE ──────────────
--
-- Le foyer était clé sur `auth.users`. Conséquence: pour exister dans un foyer,
-- il fallait un compte — donc une adresse e-mail, une invitation, une
-- acceptation. L'écran d'ajout ne pouvait pas ajouter un enfant de six ans.
--
-- Trois changements le défont, et ils ne se séparent pas:
--
--   1. L'IDENTITÉ. `member_id` devient la clé ; `user_id` devient une propriété
--      OPTIONNELLE de la ligne — vide tant que la personne n'a pas de compte,
--      remplie le jour où elle réclame son profil. Une bouche = UNE ligne, de
--      sa création à sa réclamation: ses portions, ses contraintes et son
--      historique lui restent attachés.
--
--   2. LES GARDES. Elles protégeaient un adulte d'un autre adulte, dans un
--      monde à plusieurs comptes. `keel_household_is_minor` rendait `false`
--      quand la date manquait — « traité comme majeur » — et
--      `add_restriction` refusait tout majeur sans consentement. Ensemble,
--      elles auraient refusé une contrainte sur un enfant de six ans SANS
--      COMPTE, avec le motif « adulte sans consentement ». La garde n'est pas
--      indécise: elle est fausse, et silencieuse.
--
--   3. L'OBJECTIF. Il était lu depuis `student_goals`, table qui exige un
--      compte. La fonctionnalité qui fait bifurquer les portions — la seule que
--      personne d'autre n'a — était donc MUETTE pour exactement les gens qu'on
--      veut ajouter. Il descend sur la ligne membre.
--
-- Le lot 3 a besoin de la clé du lot 1 ; le lot 2 est la raison pour laquelle
-- le lot 3 est dangereux. Les livrer séparément produirait un état intermédiaire
-- où un enfant peut porter un objectif adulte.
--
-- ── L'ÂGE PASSE À TROIS ÉTATS, ET C'EST LE CŒUR DU LOT 2 ───────────────────
--
-- `is_minor boolean` ne peut plus décrire le monde: « je ne sais pas » et
-- « majeur » doivent désormais produire des résultats OPPOSÉS. Inconnu ⇒ aucun
-- objectif appliqué (part standard, comme un mineur). Majeur ⇒ objectif
-- appliqué. Un booléen les confond, et son `coalesce(…, false)` les confondait
-- du mauvais côté.
--
-- Le vocabulaire est celui de `_shared/keel/student_age.ts`, réduit: ses six
-- statuts (absent, unreadable, future, implausible, minor, adult) se projettent
-- sur trois, parce que la base n'a qu'une `date` — elle ne peut être ni
-- illisible ni aberrante au sens du parseur TypeScript.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────
--
-- Elle ne touche NI `household_invitations` NI `keel_household_join`: ils
-- changent de rôle au lot 6 (réclamer un profil), pas ici. Elle ne touche pas
-- non plus `household_envy_submissions` (lot 5) ni les allergies de foyer
-- (lot 4). Un seul geste ne veut pas dire tous les gestes.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. L'IDENTITÉ D'UNE BOUCHE
-- ---------------------------------------------------------------------------

alter table public.household_members
  add column if not exists member_id uuid not null default gen_random_uuid(),
  -- LE PRÉNOM SUR LA LIGNE, POUR TOUT LE MONDE — y compris le compte maître.
  -- Une source unique, sans branche conditionnelle. Le motif est dur:
  -- `household_turn_context.ts` FILTRE EN SILENCE toute portion dont le prénom
  -- est vide. Un repli « la ligne, sinon profiles » ramènerait la classe de bug
  -- « prénom absent ⇒ la part disparaît sans erreur » par la porte de service.
  add column if not exists first_name text,
  -- LA DATE, SUR LA LIGNE AUSSI. `profiles.birth_date` n'existe que pour qui a
  -- un compte, et l'âge décide si un objectif s'applique.
  add column if not exists birth_date date,
  -- L'OBJECTIF DE CETTE BOUCHE. NULL = aucune direction = part standard.
  add column if not exists goal text;

-- LE VOCABULAIRE FERMÉ, reflet de `MEMBER_GOALS` dans household_portions.ts et
-- du CHECK de `student_goals.goal`. Les deux sont alignés à six depuis
-- 20260805121000 (`muscle_gain`). Une septième valeur ici serait une direction
-- de service que `SERVING_DIRECTION` ne sait pas rendre.
alter table public.household_members
  drop constraint if exists household_members_goal_check;
alter table public.household_members
  add constraint household_members_goal_check
  check (
    goal is null or goal in (
      'fat_loss', 'muscle_gain', 'recomposition',
      'performance', 'health', 'maintenance'
    )
  );

-- LE PRÉNOM EST OBLIGATOIRE DÈS QU'IL Y A UNE LIGNE, et borné. Voir plus haut:
-- un prénom vide efface la portion sans bruit. La borne de 40 est celle de
-- l'affichage (`HOUSEHOLD_MAX_NAME_CHARS` vaut 20 côté prompt et TRONQUE; ici
-- on stocke un peu plus large pour ne pas refuser un prénom composé réel).
alter table public.household_members
  drop constraint if exists household_members_first_name_check;

-- BACKFILL AVANT DE RENDRE OBLIGATOIRE. Les lignes existantes ont toutes un
-- compte (c'était la seule façon d'entrer), donc `profiles` a de quoi les
-- remplir. `split_part` sur l'espace: le prénom seul, jamais le nom entier, qui
-- n'a rien à faire sur un écran que tout le foyer regarde.
update public.household_members hm
   set first_name = coalesce(
         nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''),
         'Member'
       ),
       birth_date = p.birth_date
  from public.profiles p
 where p.id = hm.user_id
   and hm.first_name is null;

-- Un membre dont le profil a disparu ne doit pas bloquer la migration: il
-- garde une ligne nommable plutôt que d'être perdu.
update public.household_members
   set first_name = 'Member'
 where first_name is null or btrim(first_name) = '';

alter table public.household_members
  alter column first_name set not null;
alter table public.household_members
  add constraint household_members_first_name_check
  check (char_length(btrim(first_name)) between 1 and 40);

-- LA BASCULE DE CLÉ PRIMAIRE.
--
-- Vérifié avant d'écrire cette ligne: AUCUNE contrainte de clé étrangère ne
-- référence `household_members` (`select … from pg_constraint where confrelid =
-- 'public.household_members'::regclass` rend zéro ligne). La PK peut donc être
-- remplacée sans cascade.
alter table public.household_members
  drop constraint if exists household_members_pkey;
alter table public.household_members
  add constraint household_members_pkey primary key (member_id);

-- ET LE CŒUR DU LOT: le compte devient optionnel.
alter table public.household_members
  alter column user_id drop not null;

-- ⚠️ `household_members_one_per_user` RESTE TEL QUEL, et ce n'est pas un oubli.
-- L'index est unique sur `user_id`; Postgres traite les NULL comme distincts
-- (NULLS DISTINCT est le défaut), donc autant de bouches sans compte qu'on veut,
-- et toujours UN SEUL foyer par compte. L'invariant scalaire dont dépendent
-- toutes les policies (`keel_household_of`) survit sans retouche.

comment on column public.household_members.member_id is
  'L''identité d''une bouche, indépendante de tout compte. Une bouche = UNE '
  'ligne de sa création à sa réclamation: attacher un compte ne recrée rien.';
comment on column public.household_members.user_id is
  'NULL = bouche sans compte, saisie par le compte maître. Non-NULL = profil '
  'RÉCLAMÉ. Le passage de NULL à une valeur est le geste du lot 6; il ne '
  'change ni le member_id, ni les portions, ni les contraintes déjà posées.';
comment on column public.household_members.goal is
  'La direction de service de cette bouche, six jetons. NULL = part standard. '
  'Lu par generate-household-meal-v1; PLUS JAMAIS student_goals pour un '
  'membre. Écrivains: le compte maître, et la personne elle-même si elle a '
  'réclamé son profil (keel_household_set_member_goal).';

-- ---------------------------------------------------------------------------
-- 2. LES GARDES RETOURNÉES
-- ---------------------------------------------------------------------------

-- 2.0 Les lecteurs d'abord ---------------------------------------------------
--
-- ⚠️ L'ORDRE EST UNE CONTRAINTE DU MOTEUR, PAS UN GOÛT. `keel_household_roster`
-- et `keel_household_roster_for` sont `language sql`: Postgres analyse leur
-- corps et enregistre une DÉPENDANCE sur chaque colonne citée — dont
-- `restriction_consent_at`. Tenter de dropper la colonne avant elles échoue sur
-- « cannot drop column … because other objects depend on it ».
--
-- Elles sont recréées en section 5, avec leur nouvelle forme.
drop function if exists public.keel_household_roster();
drop function if exists public.keel_household_roster_for(uuid);

-- 2.1 Le consentement disparaît ---------------------------------------------
--
-- Il protégeait un adulte d'un autre adulte. Le modèle arrêté le 2026-08-08 dit
-- qu'UNE SEULE PERSONNE gouverne le menu — c'est ce qui évite le marécage d'un
-- arbitrage entre un parent et son enfant. La contrepartie n'est pas un
-- consentement, c'est la TRANSPARENCE: `household_food_restrictions.created_by`
-- reste, et l'écran affiche déjà qui a posé quoi (`restrictionNotice`, rendue
-- par HouseholdPage). Ce qui distingue ce modèle du contrôle coercitif que la
-- migration fondatrice redoutait, c'est que rien n'est secret.
drop function if exists public.keel_household_grant_consent();
drop function if exists public.keel_household_revoke_consent();

alter table public.household_members
  drop column if exists restriction_consent_at;

-- 2.2 La colocation sort du produit -----------------------------------------
--
-- `kind` gouvernait deux choses: le droit de restreindre, et la visibilité des
-- objectifs entre membres. Les deux disparaissent. `memberVisibility` rendait
-- DÉJÀ `full` pour tout le monde en mode famille — la retirer ne change aucun
-- comportement existant, elle supprime un mode qui n'a plus de sujet.
--
-- Colonne SUPPRIMÉE et pas « gardée à une seule valeur »: ce dépôt a une
-- histoire de contraintes qui survivent à leur cause, et une colonne à une
-- valeur invite un lecteur, dans six mois, à en réactiver une deuxième sans
-- relire les policies.
alter table public.households
  drop constraint if exists households_kind_check;
alter table public.households
  drop column if exists kind;

-- 2.3 L'âge, à trois états ---------------------------------------------------
--
-- `keel_household_is_minor(uuid)` est DROPPÉE et pas gardée: ses trois seuls
-- appelants (roster, roster_for, add_restriction) sont réécrits ci-dessous, et
-- une fonction SQL sans appelant est le mode d'échec n°1 de ce dépôt.
drop function if exists public.keel_household_is_minor(uuid);

create or replace function public.keel_household_member_age(p_member uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when hm.birth_date is null then 'unknown'
    -- Une date FUTURE ou aberrante n'est pas une date: elle vaut « inconnu »,
    -- pas « majeur ». C'est l'inversion du lot 2, et elle se lit ici.
    when hm.birth_date > current_date then 'unknown'
    when hm.birth_date < (current_date - interval '120 years') then 'unknown'
    when hm.birth_date > (current_date - interval '18 years') then 'minor'
    else 'adult'
  end
  from public.household_members hm
  where hm.member_id = p_member;
$function$;

comment on function public.keel_household_member_age(uuid) is
  'minor | adult | unknown, RELU à chaque appel — un enfant grandit, et un '
  'booléen figé au jour de l''entrée survivrait à ses dix-huit ans. UNKNOWN '
  'n''est PAS un synonyme de majeur: sans âge, aucune direction d''objectif '
  'n''est appliquée (part standard), ce qui est la direction sûre du jour où '
  'le compte maître saisit les bouches à la main.';

-- ---------------------------------------------------------------------------
-- 3. LES CONTRAINTES DE FOYER SUIVENT LA BOUCHE
-- ---------------------------------------------------------------------------
--
-- `member_user_id references auth.users` rendait littéralement IMPOSSIBLE de
-- poser « pas de champignons » sur un enfant sans compte — c'est-à-dire le cas
-- nominal du produit.

alter table public.household_food_restrictions
  add column if not exists member_id uuid;

update public.household_food_restrictions r
   set member_id = hm.member_id
  from public.household_members hm
 where hm.household_id = r.household_id
   and hm.user_id = r.member_user_id
   and r.member_id is null;

-- Une contrainte orpheline (membre parti) n'a plus de sujet: elle s'en va.
delete from public.household_food_restrictions where member_id is null;

alter table public.household_food_restrictions
  drop constraint if exists household_food_restrictions_household_id_member_user_id_label_key;
alter table public.household_food_restrictions
  drop column if exists member_user_id;

alter table public.household_food_restrictions
  alter column member_id set not null;
alter table public.household_food_restrictions
  drop constraint if exists household_food_restrictions_member_fk;
alter table public.household_food_restrictions
  add constraint household_food_restrictions_member_fk
  foreign key (member_id) references public.household_members(member_id)
  on delete cascade;
alter table public.household_food_restrictions
  drop constraint if exists household_food_restrictions_member_label_key;
alter table public.household_food_restrictions
  add constraint household_food_restrictions_member_label_key
  unique (household_id, member_id, label);

drop index if exists public.household_food_restrictions_member_idx;
create index if not exists household_food_restrictions_member_idx
  on public.household_food_restrictions (household_id, member_id);

-- ---------------------------------------------------------------------------
-- 4. LES PORTES D'ÉCRITURE
-- ---------------------------------------------------------------------------
--
-- RAPPEL DE LA FONDATION, toujours vrai: les policies RLS sont TOUTES `for
-- select`. Aucune écriture ne passe par RLS, parce qu'une policy ne restreint
-- pas les COLONNES — ouvrir l'UPDATE de `household_members` pour qu'on pose son
-- objectif ouvrirait du même geste `role`, donc laisserait n'importe qui se
-- promouvoir compte maître.

-- 4.1 Créer le foyer ---------------------------------------------------------
--
-- Signature CHANGÉE (`p_kind` disparaît), donc l'ancienne est droppée: en
-- Postgres, deux arités sont deux fonctions, et laisser la première en place
-- garderait vivante une porte qui insère un `kind` inexistant.
drop function if exists public.keel_household_create(text, text);

create or replace function public.keel_household_create(p_name text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_member uuid;
  v_first text;
  v_birth date;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if public.keel_household_of(v_user) is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
  end if;

  -- LA LIGNE DU MAÎTRE EST RECOPIÉE UNE FOIS, puis elle vit sa vie.
  -- Arbitrage explicite du chantier: pas de repli « la ligne, sinon profiles ».
  -- Conséquence assumée — s'il renomme son profil plus tard, son prénom au
  -- foyer ne suit pas; il le change au foyer. Le prix d'un repli serait de
  -- rendre le roster conditionnel, et de ramener le bug du prénom vide.
  select
    coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Me'),
    p.birth_date
    into v_first, v_birth
  from public.profiles p where p.id = v_user;

  insert into public.households (name, created_by)
  values (v_name, v_user)
  returning id into v_id;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values
    (v_id, v_user, 'owner', coalesce(v_first, 'Me'), v_birth)
  returning member_id into v_member;

  return jsonb_build_object(
    'ok', true, 'household_id', v_id, 'member_id', v_member
  );
end;
$function$;

-- 4.1b Rejoindre — LE CHEMIN QUI S'EST CASSÉ EN SILENCE ----------------------
--
-- ⚠️ TROUVÉ PAR `household_rls_test.sql`, PAS PAR UN TYPECHECK. `first_name`
-- est devenu NOT NULL en section 1, et `keel_household_join` insérait
-- `(household_id, user_id, role)` — trois colonnes, sans prénom. Rejoindre un
-- foyer levait donc une violation de contrainte, sur un chemin qu'aucun test
-- TypeScript ne couvre parce qu'il vit entièrement en SQL.
--
-- C'est la démonstration en direct de la règle du dépôt: la vérité est en base.
-- Le typecheck était vert, le front compilait, et l'invitation était morte.
--
-- Le prénom est recopié de `profiles` UNE FOIS, exactement comme à la création.
-- Au lot 6 cette RPC change de rôle — elle cessera de créer une ligne pour
-- ATTACHER un compte à une ligne qui existe déjà — mais elle doit marcher d'ici
-- là, sinon on livre un foyer où personne ne peut entrer.

create or replace function public.keel_household_join(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv record;
  v_first text;
  v_birth date;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if public.keel_household_of(v_user) is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
  end if;

  select lower(btrim(coalesce(u.email, ''))) into v_email
  from auth.users u where u.id = v_user;

  select * into v_inv
  from public.household_invitations hi
  where hi.token_hash = public.coach_invite_token_hash(coalesce(p_token, ''))
  for update;

  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  if v_inv.consumed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_email is null or v_email <> v_inv.email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  select
    coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Member'),
    p.birth_date
    into v_first, v_birth
  from public.profiles p where p.id = v_user;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values
    (v_inv.household_id, v_user, 'member', coalesce(v_first, 'Member'), v_birth);

  update public.household_invitations
     set consumed_at = now()
   where id = v_inv.id;

  return jsonb_build_object('ok', true, 'household_id', v_inv.household_id);
end;
$function$;

-- 4.2 Ajouter une bouche -----------------------------------------------------

create or replace function public.keel_household_add_member(
  p_first_name text,
  p_birth_date date default null,
  p_goal text default null
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
  v_first text := btrim(coalesce(p_first_name, ''));
  v_count integer;
  v_member uuid;
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
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_first_name');
  end if;
  if p_goal is not null and p_goal not in (
    'fat_loss', 'muscle_gain', 'recomposition',
    'performance', 'health', 'maintenance'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;
  -- Une date future est un lapsus de saisie, pas une bouche: on la refuse ici
  -- plutôt que de la laisser devenir un `unknown` silencieux.
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date');
  end if;

  -- LE PLAFOND, EN BASE ET PAS À L'ÉCRAN (lot 7). Même raisonnement que le
  -- plafond d'invitations de la fondation: « une limite d'UI n'est pas une
  -- limite ». Celui-ci existe à cause du coût LLM — huit bouches, ce sont huit
  -- consignes de service à composer à CHAQUE génération — donc il doit tenir
  -- face à un appel direct de la RPC, pas seulement face à un bouton grisé.
  select count(*) into v_count
  from public.household_members hm
  where hm.household_id = v_household;

  if v_count >= 8 then
    return jsonb_build_object('ok', false, 'reason', 'household_full');
  end if;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values
    (v_household, null, 'member', v_first, p_birth_date, p_goal)
  returning member_id into v_member;

  return jsonb_build_object('ok', true, 'member_id', v_member);
end;
$function$;

comment on function public.keel_household_add_member(text, date, text) is
  'Ajoute une bouche SANS COMPTE. Compte maître uniquement, plafond de 8 par '
  'foyer. L''âge est facultatif — le flux de saisie ne se bloque pas — mais '
  'sans lui aucune direction d''objectif ne s''applique.';

-- 4.3 Retirer une bouche -----------------------------------------------------

create or replace function public.keel_household_remove_member(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target record;
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

  select hm.member_id, hm.role into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  -- LE MAÎTRE NE SE RETIRE PAS DU FOYER QU'IL GOUVERNE. Sans cette garde, un
  -- foyer peut se retrouver sans personne pour composer — et ses bouches sans
  -- compte n'ont, par construction, personne pour reprendre la main.
  if v_target.role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'cannot_remove_owner');
  end if;

  delete from public.household_members where member_id = p_member;
  return jsonb_build_object('ok', true);
end;
$function$;

-- 4.4 Poser l'objectif -------------------------------------------------------
--
-- DEUX ÉCRIVAINS, UN SEUL CHAMP. Le compte maître écrit l'objectif de n'importe
-- quelle bouche de son foyer. Une personne qui a RÉCLAMÉ son profil écrit le
-- sien — et rien d'autre. C'est la seule autorité que la réclamation donne:
-- elle ne compose pas, elle n'ajoute pas, elle ne restreint pas.
--
-- La source ne change pas selon l'écrivain: il n'y a toujours qu'UNE colonne
-- lue par le générateur. Ce qui change, c'est qui a le droit d'y écrire.

create or replace function public.keel_household_set_member_goal(
  p_member uuid,
  p_goal text
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
  v_target record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_goal is not null and p_goal not in (
    'fat_loss', 'muscle_gain', 'recomposition',
    'performance', 'health', 'maintenance'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  update public.household_members
     set goal = p_goal
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

-- 4.5 Les contraintes de foyer ----------------------------------------------
--
-- Le mur du consentement tombe, et `p_member` cesse d'être un identifiant de
-- compte. Ce qui RESTE: membre par membre (jamais au niveau du foyer), compte
-- maître seul, et `created_by` renseigné — la transparence est la contrepartie
-- écrite de la disparition du consentement.

create or replace function public.keel_household_add_restriction(
  p_member uuid,
  p_label text
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
  v_label text := btrim(coalesce(p_label, ''));
  v_target uuid;
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'bad_label');
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

  insert into public.household_food_restrictions
    (household_id, member_id, label, created_by)
  values (v_household, v_target, v_label, v_user)
  on conflict (household_id, member_id, label) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'restriction_id', v_id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. LE ROSTER
-- ---------------------------------------------------------------------------
--
-- La jointure sur `profiles` DISPARAÎT: le prénom et l'âge viennent de la ligne
-- membre, pour tout le monde. Le roster rend désormais `user_id` — non pour
-- l'identité (c'est `member_id`), mais pour que l'écran sache qui a réclamé son
-- profil, et pour que le chat sache laquelle des lignes est celle qui parle.
--
-- Le corps vit dans la version À ARGUMENT, et la version sans argument lui
-- passe `auth.uid()`. Une requête, deux gardes — recopier le SELECT ferait
-- diverger le navigateur et le serveur en silence (défaut trouvé en run réel le
-- 2026-08-08, migration 20260808061000).
--
-- (Les `drop` sont en section 2.0: ils devaient précéder la suppression de
-- `restriction_consent_at`, dont ces fonctions dépendaient.)

create or replace function public.keel_household_roster_for(p_user uuid)
returns table (
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    hm.member_id,
    hm.user_id,
    hm.first_name,
    public.keel_household_member_age(hm.member_id) as age_state,
    hm.role,
    hm.goal
  from public.household_members hm
  -- LA GARDE, portée par l'ARGUMENT. Un `p_user` nul rend zéro ligne:
  -- `keel_household_of(null)` est nul, et `= null` n'est jamais vrai.
  where hm.household_id = public.keel_household_of(p_user)
  order by (hm.role = 'owner') desc, hm.joined_at;
$function$;

create or replace function public.keel_household_roster()
returns table (
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.keel_household_roster_for((select auth.uid()));
$function$;

comment on function public.keel_household_roster_for(uuid) is
  'Le roster du foyer de p_user, pour les appelants SERVEUR (service_role), où '
  'auth.uid() est NULL. Le prénom et l''âge viennent de la LIGNE MEMBRE — plus '
  'aucune jointure sur profiles, et donc plus aucune branche conditionnelle '
  'entre une bouche avec compte et une bouche sans.';

-- ---------------------------------------------------------------------------
-- 6. LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- Rappel des deux cicatrices: `revoke from public` ne retire PAS `anon`, et
-- toute fonction neuve est exécutable par tout le monde par défaut.

revoke all on function public.keel_household_create(text) from public, anon;
revoke all on function public.keel_household_add_member(text, date, text) from public, anon;
revoke all on function public.keel_household_remove_member(uuid) from public, anon;
revoke all on function public.keel_household_set_member_goal(uuid, text) from public, anon;
revoke all on function public.keel_household_add_restriction(uuid, text) from public, anon;
revoke all on function public.keel_household_member_age(uuid) from public, anon;
revoke all on function public.keel_household_roster() from public, anon;
revoke all on function public.keel_household_roster_for(uuid) from public, anon, authenticated;

grant execute on function public.keel_household_create(text) to authenticated;
grant execute on function public.keel_household_add_member(text, date, text) to authenticated;
grant execute on function public.keel_household_remove_member(uuid) to authenticated;
grant execute on function public.keel_household_set_member_goal(uuid, text) to authenticated;
grant execute on function public.keel_household_add_restriction(uuid, text) to authenticated;
grant execute on function public.keel_household_member_age(uuid) to authenticated;
grant execute on function public.keel_household_roster() to authenticated;
-- Serveur uniquement: c'est tout l'objet de la version à argument.
grant execute on function public.keel_household_roster_for(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. CONTRÔLE FINAL — ON REJOUE LES GESTES
-- ---------------------------------------------------------------------------
--
-- Inspecter le catalogue prouverait que les colonnes existent, pas qu'une
-- bouche sans compte fonctionne. On construit un foyer, on y met une bouche
-- SANS COMPTE, on lui pose une contrainte et un objectif, on relit le roster,
-- et on annule tout.

do $$
declare
  v_user uuid;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_rows int;
  v_age text;
  v_goal text;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'household_member_identity: aucun utilisateur, contrôle sauté';
    return;
  end if;

  -- Un compte déjà dans un foyer ne peut pas en créer un second: on prend acte
  -- et on saute plutôt que de mentir sur ce qui a été vérifié.
  if public.keel_household_of(v_user) is not null then
    raise notice 'household_member_identity: % déjà dans un foyer, contrôle sauté', v_user;
    return;
  end if;

  insert into public.households (name, created_by)
  values ('__qa_identity__', v_user) returning id into v_house;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, v_user, 'owner', 'Owner', '1990-01-01')
  returning member_id into v_owner;

  -- LA BOUCHE SANS COMPTE — le geste que tout ce lot existe pour permettre.
  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values (v_house, null, 'member', 'Lea', current_date - interval '8 years', null)
  returning member_id into v_kid;

  -- 1. Elle est mineure, et son âge est DÉRIVÉ, pas figé.
  select public.keel_household_member_age(v_kid) into v_age;
  if v_age <> 'minor' then
    raise exception
      'member_age: une bouche de 8 ans rend %, pas ''minor'' — la garde d''âge '
      'est inversée et un enfant recevrait une direction d''adulte', v_age;
  end if;

  -- 2. Sans date, c'est UNKNOWN et jamais « adulte ». C'est l'inversion du
  --    lot 2, et c'est la seule chose que ce contrôle ne peut pas se permettre
  --    de rater.
  update public.household_members set birth_date = null where member_id = v_kid;
  select public.keel_household_member_age(v_kid) into v_age;
  if v_age <> 'unknown' then
    raise exception
      'member_age: sans date la bouche rend %, pas ''unknown'' — le '
      'coalesce(false) de l''ancienne garde est encore là', v_age;
  end if;

  -- 3. Une contrainte se pose sur une bouche SANS COMPTE. C'était littéralement
  --    impossible avant cette migration (FK vers auth.users).
  insert into public.household_food_restrictions
    (household_id, member_id, label, created_by)
  values (v_house, v_kid, 'champignons', v_user);

  select count(*) into v_rows
  from public.household_food_restrictions
  where member_id = v_kid;
  if v_rows <> 1 then
    raise exception
      'restrictions: % ligne(s) pour une bouche sans compte — la bascule vers '
      'member_id n''a pas pris', v_rows;
  end if;

  -- 4. Un objectif se pose sur elle, et se relit.
  update public.household_members set goal = 'health' where member_id = v_kid;
  select goal into v_goal from public.household_members where member_id = v_kid;
  if v_goal <> 'health' then
    raise exception 'goal: la colonne ne retient pas la valeur (%)', v_goal;
  end if;

  -- 5. Le roster serveur rend les DEUX, prénoms compris, sans profiles.
  select count(*) into v_rows from public.keel_household_roster_for(v_user);
  if v_rows <> 2 then
    raise exception
      'roster_for: % ligne(s) pour un foyer de 2 — une bouche sans compte est '
      'invisible au serveur, donc au chat et au générateur', v_rows;
  end if;

  select count(*) into v_rows
  from public.keel_household_roster_for(v_user) r
  where r.first_name is null or btrim(r.first_name) = '';
  if v_rows <> 0 then
    raise exception
      'roster_for: % ligne(s) sans prénom — leur portion disparaîtrait en '
      'silence dans le bloc de conversation', v_rows;
  end if;

  raise notice
    'household_member_identity: bouche sans compte créée, datée, contrainte, '
    'objectivée et rendue par le roster — les cinq gestes vérifiés';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
