-- ============================================================================
-- LE FOYER — LE DÉTACHEMENT (chantier 2, décisions D2 et D3)
--
-- Autorité: docs/keel/CHANTIER-FOYER-SUITE.md § « Chantier 2 ».
--
-- ── LE FAIT MESURÉ QUI COMMANDE CE LOT ─────────────────────────────────────
--
-- Deux sondes, jouées en transaction annulée sur la base locale le 2026-08-11,
-- AVANT cette migration:
--
--   A. purger le compte du MAÎTRE lève
--      « 23503 / households_created_by_fkey » — c'est-à-dire que le cron
--      `purge-deleted-accounts` ÉCHOUE, et réessaie tous les jours, pour
--      toujours. Le droit à l'effacement d'un maître de foyer est aujourd'hui
--      INAPPLICABLE, et l'échec est un log, pas une alerte.
--
--   B. purger le compte d'un MEMBRE réussit — et sa ligne de foyer part avec.
--      Mesuré: `marc_row_still_there = 0`. Sa portion, ses allergies, ses
--      contraintes disparaissent, et le repas du lendemain est composé pour
--      une bouche de moins SANS QUE PERSONNE NE L'AIT DÉCIDÉ.
--
-- Les deux viennent du même héritage: avant le lot 1, une bouche ÉTAIT un
-- compte. Le lot 1 a rendu `user_id` nullable et n'a jamais reposé la clé.
--
-- ── D3, ET CE QU'IL COÛTE ──────────────────────────────────────────────────
--
-- La ligne « bouche » n'est pas le dossier de la personne: c'est ce que le
-- maître a saisi pour cuisiner. Un enfant de huit ans est une bouche sans
-- compte, avec un prénom, un âge et une allergie — c'est le cas NOMINAL du
-- produit, pas une dégradation. Supprimer son compte détache donc, et n'efface
-- pas la bouche.
--
-- En contrepartie, la suppression de compte porte un geste EXPLICITE
-- (`departs_with_account`): « retirer aussi ma place dans ce foyer ? ». Coché,
-- la ligne part à la purge, avec le compte, au même instant — aucune rétention
-- propre, aucun délai propre.
--
-- ⚠️ LA QUALIFICATION JURIDIQUE de la ligne « bouche » comme donnée du FOYER
-- plutôt que dossier de la PERSONNE reste à faire confirmer
-- (CHANTIER-FOYER-SUITE.md). Cette migration décrit l'ingénierie de la
-- décision produit, pas un avis juridique.
--
-- ── D2, ET CE QU'IL COÛTE ──────────────────────────────────────────────────
--
-- `keel_household_detach_member` rend révocable la réclamation de profil: le
-- maître peut retirer l'accès de quelqu'un, et cette personne reste une bouche
-- du foyer. C'est le prix assumé du choix « le maître paie les 2 €/mois » —
-- qui paie l'accès peut le retirer.
--
-- ============================================================================
-- LE CYCLE DE VIE RGPD DES SIX TABLES DU FOYER — TABLE PAR TABLE
-- ============================================================================
--
-- Vérifié à HEAD: `_shared/account_lifecycle.ts` ne mentionne AUCUNE des six
-- tables du foyer. Elles ne sont réclamées ni à l'export, ni à la purge, et
-- `keel_gdpr_lifecycle_test.ts` (PIVOT_TABLES) ne les nomme pas non plus.
-- Ce qui suit est la décision, table par table. Ce qui n'est pas fait ICI est
-- dit ici, pour que le trou porte une phrase plutôt qu'un silence.
--
--  1. `households` — OBJET PARTAGÉ, JAMAIS PURGÉ AVEC UN COMPTE.
--     Le foyer appartient à plusieurs personnes; l'effacer parce que son
--     créateur s'en va détruirait les données de tous les autres. `created_by`
--     devient donc nullable + SET NULL: le lien à la personne s'efface, le
--     foyer reste. ⚠️ CONSÉQUENCE OUVERTE: un foyer dont le maître part se
--     retrouve SANS PERSONNE POUR GOUVERNER — il n'existe aucune RPC pour
--     supprimer un foyer, et `cannot_remove_owner` interdit de retirer la
--     ligne du maître. Ce cas est NOMMÉ, pas résolu: il appartient au
--     chantier 3 (D4, le gel), et il ne se tranche pas en silence ici.
--
--  2. `household_members` — DÉTACHÉE, JAMAIS SUPPRIMÉE D'OFFICE (D3).
--     `user_id` → SET NULL. La ligne survit; portions, allergies, contraintes
--     et historique lui restent attachés par `member_id`, qui ne bouge pas.
--     Sauf geste explicite: `departs_with_account`.
--
--  3. `household_food_restrictions` — LA RÈGLE DE MAISON SURVIT À SON AUTEUR.
--     `created_by` → nullable + SET NULL. Une règle qui disparaîtrait avec le
--     compte de celui qui l'a posée changerait le menu d'un enfant en silence.
--     L'attribution s'efface (c'est ce que la purge doit faire), le fait reste.
--     ⚠️ L'écran retombe alors sur une phrase sans nom d'auteur — traité côté
--     front dans le même lot (`restrictionNotice`).
--
--  4. `household_member_allergies` — MÊME RÈGLE, ET C'EST UNE GARDE DE SÉCURITÉ.
--     `created_by` → nullable + SET NULL. Une allergie qui s'évaporerait parce
--     que le parent qui l'a saisie a fermé son compte est la pire perte de ce
--     lot: elle est lue fail-closed par le générateur, et son absence ne
--     produit AUCUN refus — juste un plat avec de l'arachide dedans.
--
--  5. `household_invitations` — `invited_by` → nullable + SET NULL. Un jeton
--     vivant reste honorable: il vise une bouche de ce foyer, et le foyer
--     existe toujours. La ligne part de toute façon avec sa cible
--     (`household_invitations_member_fk` est ON DELETE CASCADE).
--     ⚠️ NON TRAITÉ ICI: les invitations EXPIRÉES ne sont jamais supprimées et
--     portent une adresse e-mail de tiers. C'est une question de rétention, pas
--     de détachement; elle n'a pas sa place dans ce lot, et elle est réelle.
--
--  6. `household_envy_submissions` — CASCADE, INCHANGÉE, ET C'EST VOULU.
--     Une envie est une PHRASE écrite par une personne pour une semaine
--     (« on a envie de raclette »), pas un fait du foyer sur une bouche. Elle
--     part avec son auteur. C'est la seule des six où l'effacement est le bon
--     comportement, et la seule dont la FK était déjà correcte.
--
-- CE QUI RESTE OUVERT, ET QUI N'EST PAS FAIT ICI: l'EXPORT. `account-export-v1`
-- est écrit par une autre session au moment de ce lot et n'est pas touché.
-- Les six tables restent hors de l'archive RGPD. C'est un trou nommé, à fermer
-- dans un lot qui possède ce fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LES CLÉS ÉTRANGÈRES VERS `auth.users`
-- ---------------------------------------------------------------------------
--
-- Cinq contraintes, deux maladies:
--   · CASCADE  sur `household_members.user_id`  → efface une bouche en silence
--   · NO ACTION sur les quatre `created_by`/`invited_by` → BLOQUE la purge
-- Les deux se soignent par le même remède, et pour la même raison: la personne
-- s'en va, le fait du foyer reste.

alter table public.household_members
  drop constraint if exists household_members_user_id_fkey;
alter table public.household_members
  add constraint household_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.households
  alter column created_by drop not null;
alter table public.households
  drop constraint if exists households_created_by_fkey;
alter table public.households
  add constraint households_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.household_food_restrictions
  alter column created_by drop not null;
alter table public.household_food_restrictions
  drop constraint if exists household_food_restrictions_created_by_fkey;
alter table public.household_food_restrictions
  add constraint household_food_restrictions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.household_member_allergies
  alter column created_by drop not null;
alter table public.household_member_allergies
  drop constraint if exists household_member_allergies_created_by_fkey;
alter table public.household_member_allergies
  add constraint household_member_allergies_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.household_invitations
  alter column invited_by drop not null;
alter table public.household_invitations
  drop constraint if exists household_invitations_invited_by_fkey;
alter table public.household_invitations
  add constraint household_invitations_invited_by_fkey
  foreign key (invited_by) references auth.users(id) on delete set null;

comment on column public.household_members.user_id is
  'Le COMPTE attaché à cette bouche, ou NULL. NULL est le cas NOMINAL (un '
  'enfant), et c''est aussi l''état après un détachement: la ligne, ses '
  'portions, ses allergies et son historique survivent au compte. `member_id` '
  'ne bouge jamais.';

comment on column public.household_food_restrictions.created_by is
  'Le compte qui a posé la règle, ou NULL si ce compte a été effacé. La RÈGLE '
  'survit à son auteur — l''effacer changerait le menu de quelqu''un en '
  'silence — mais l''attribution s''efface avec la personne.';

comment on column public.household_member_allergies.created_by is
  'Le compte qui a saisi l''allergie, ou NULL si ce compte a été effacé. '
  'L''ALLERGIE ne s''efface jamais avec lui: elle est lue fail-closed par le '
  'générateur, et son absence ne produit aucun refus, juste un plat dangereux.';

-- ---------------------------------------------------------------------------
-- 2. LE GESTE À LA SUPPRESSION DE COMPTE — une intention, pas un effet
-- ---------------------------------------------------------------------------
--
-- POURQUOI UNE COLONNE PLUTÔT QU'UNE SUPPRESSION IMMÉDIATE.
--
-- La suppression de compte est RÉVERSIBLE jusqu'à J+7 (`account-restore-v1`).
-- Retirer la ligne de foyer à T0 introduirait un effet IRRÉVERSIBLE au milieu
-- d'un geste réversible: la personne annulerait sa suppression et retrouverait
-- un compte sans foyer, sans que rien ne le lui ait dit. L'intention est donc
-- écrite à T0, honorée à la purge, et effacée par la restauration — la ligne
-- part exactement quand le compte part, et jamais avant.
alter table public.household_members
  add column if not exists departs_with_account boolean not null default false;

comment on column public.household_members.departs_with_account is
  'Coché par la personne elle-même dans le tunnel de suppression de compte: '
  '« retirer aussi ma place dans ce foyer ». Une INTENTION, pas un effet — '
  'elle n''est honorée qu''à la purge J+7, et `account-restore-v1` la remet à '
  'false. Par défaut FAUX: D3 dit qu''une bouche ne disparaît pas sans que '
  'quelqu''un l''ait décidé.';

-- ---------------------------------------------------------------------------
-- 3. DÉTACHER — le geste du maître (D2)
-- ---------------------------------------------------------------------------
--
-- Quatre refus NOMMÉS, dans cet ordre, et l'ordre est une garde:
--
--   `not_owner`           l'appelant n'est pas le maître de son foyer;
--   `not_a_member`        la cible n'existe pas, OU vit dans le foyer d'à côté
--                         — indiscernables de l'extérieur, exactement comme
--                         dans `keel_household_invite`, sinon la RPC devient un
--                         moyen de tester l'existence d'un identifiant;
--   `cannot_detach_owner` AVANT `not_claimed`, parce qu'un maître détaché par
--                         une purge porterait `user_id is null` et recevrait
--                         alors « rien à détacher » — un motif qui décrirait
--                         l'état de la ligne au lieu de la règle qui refuse;
--   `not_claimed`         la bouche n'a pas de compte: il n'y a RIEN à retirer,
--                         et rendre `ok` ferait croire à un accès révoqué.
create or replace function public.keel_household_detach_member(p_member uuid)
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

  select hm.member_id, hm.role, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- LE MAÎTRE NE SE DÉTACHE PAS LUI-MÊME. Même motif que
  -- `cannot_remove_owner`: un foyer dont le compte maître n'a plus d'accès
  -- laisse ses bouches sans compte sans personne pour composer — et personne
  -- pour reprendre la main, par construction.
  if v_target.role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'cannot_detach_owner');
  end if;

  if v_target.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_claimed');
  end if;

  -- UNE SEULE COLONNE ÉCRITE. Rien d'autre ne bouge: ni `member_id`, ni le
  -- prénom, ni la date, ni l'objectif, ni ce qui pend à `member_id`.
  --
  -- `departs_with_account` est remis à false: la personne détachée n'a plus de
  -- compte attaché à cette ligne, donc plus aucune intention de départ à
  -- honorer. Sans ce reset, une intention posée avant le détachement
  -- s'appliquerait à la ligne longtemps après que le maître l'a reprise.
  update public.household_members
     set user_id = null,
         departs_with_account = false
   where member_id = p_member;

  return jsonb_build_object('ok', true, 'member_id', p_member);
end;
$function$;

comment on function public.keel_household_detach_member(uuid) is
  'RETIRE L''ACCÈS de quelqu''un au foyer, sans retirer sa bouche: `user_id` '
  'repasse à NULL, la ligne reste et la personne continue d''y manger. '
  'Compte maître uniquement. C''est le geste qui rend la réclamation de profil '
  'RÉVOCABLE (D2) — le prix assumé de « le maître paie ». Le profil redevient '
  'réclamable: le maître peut réémettre une invitation pour cette bouche.';

-- ---------------------------------------------------------------------------
-- 4. LES DEUX PORTES DU SERVEUR — et pourquoi elles ne lisent pas `auth.uid()`
-- ---------------------------------------------------------------------------
--
-- ⚠️ `auth.uid()` EST NULL SOUS `service_role`. Une RPC gatée dessus et
-- appelée par une edge function avec la clé de service est MORTE côté serveur
-- — cicatrice documentée de ce dépôt. Ces deux-ci prennent donc le compte en
-- paramètre, et leur seule garde est le GRANT: `service_role` uniquement.

-- 4a. POSER L'INTENTION (T0, `account-deletion-v1`).
create or replace function public.keel_household_set_departure(
  p_user uuid,
  p_depart boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target record;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  select hm.member_id, hm.role, hm.household_id into v_target
  from public.household_members hm
  where hm.user_id = p_user;

  -- PAS UNE ERREUR. La très grande majorité des comptes n'est dans aucun
  -- foyer; un refus ici ferait échouer leur suppression de compte.
  if v_target.member_id is null then
    return jsonb_build_object('ok', true, 'in_household', false);
  end if;

  -- LE MAÎTRE NE PART PAS DE SON FOYER. Même règle que
  -- `keel_household_remove_member`, et pour la même raison exactement: retirer
  -- sa ligne laisserait un foyer que PERSONNE ne gouverne, avec des bouches
  -- sans compte dedans. Son compte, lui, est supprimé normalement — sa ligne
  -- se DÉTACHE (D3), et le foyer orphelin est un cas nommé, pas résolu.
  if coalesce(p_depart, false) and v_target.role = 'owner' then
    return jsonb_build_object(
      'ok', false, 'in_household', true, 'reason', 'cannot_remove_owner');
  end if;

  update public.household_members
     set departs_with_account = coalesce(p_depart, false)
   where member_id = v_target.member_id;

  return jsonb_build_object(
    'ok', true,
    'in_household', true,
    'member_id', v_target.member_id,
    'household_id', v_target.household_id,
    'departs', coalesce(p_depart, false),
    'is_owner', v_target.role = 'owner');
end;
$function$;

comment on function public.keel_household_set_departure(uuid, boolean) is
  'Écrit l''INTENTION « retirer aussi ma place dans ce foyer » au moment où le '
  'compte est mis en suppression. N''efface rien: c''est la purge J+7 qui '
  'honore. Réservée au SERVEUR — `auth.uid()` est NULL sous service_role, donc '
  'le compte est un paramètre et le GRANT est la seule garde.';

-- 4b. HONORER (J+7, `purge-deleted-accounts`), AVANT le delete auth.
--
-- Elle fait EXPLICITEMENT ce que la FK ferait toute seule (`set null`), pour la
-- même raison que `purgeMessagingTraces` supprime `inbound_dedup` à la main: ne
-- rien laisser dépendre d'un ON DELETE qu'on n'a pas relu au moment de la
-- purge. Et elle rend ce qu'elle a fait — 'removed' ou 'detached' — pour que la
-- réponse du cron dise la vérité d'exécution plutôt qu'un succès générique.
create or replace function public.keel_household_purge_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target record;
begin
  if p_user is null then
    return jsonb_build_object('ok', true, 'action', 'none');
  end if;

  select hm.member_id, hm.role, hm.household_id, hm.departs_with_account
    into v_target
  from public.household_members hm
  where hm.user_id = p_user;

  if v_target.member_id is null then
    return jsonb_build_object('ok', true, 'action', 'none');
  end if;

  -- LE MAÎTRE N'EST JAMAIS SUPPRIMÉ, même s'il a coché: `keel_household_set_
  -- departure` refuse déjà de poser l'intention sur lui, et cette seconde
  -- vérification couvre une ligne écrite avant ce lot ou par un chemin futur.
  if v_target.departs_with_account and v_target.role <> 'owner' then
    delete from public.household_members where member_id = v_target.member_id;
    return jsonb_build_object(
      'ok', true, 'action', 'removed',
      'member_id', v_target.member_id, 'household_id', v_target.household_id);
  end if;

  update public.household_members
     set user_id = null,
         departs_with_account = false
   where member_id = v_target.member_id;

  return jsonb_build_object(
    'ok', true, 'action', 'detached',
    'member_id', v_target.member_id, 'household_id', v_target.household_id);
end;
$function$;

comment on function public.keel_household_purge_user(uuid) is
  'Ce que la purge RGPD fait du FOYER d''un compte effacé: sa ligne est '
  'DÉTACHÉE (D3) — elle reste une bouche du foyer — sauf si la personne a '
  'coché « retirer aussi ma place », auquel cas elle part. Appelée AVANT '
  'purge_auth_user. Réservée au SERVEUR.';

-- ---------------------------------------------------------------------------
-- 5. LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT implicite,
-- et toute fonction neuve est exécutable par tout le monde par défaut.

revoke all on function public.keel_household_detach_member(uuid) from public, anon;
grant execute on function public.keel_household_detach_member(uuid) to authenticated;

revoke all on function public.keel_household_set_departure(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.keel_household_set_departure(uuid, boolean)
  to service_role;

revoke all on function public.keel_household_purge_user(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_purge_user(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. CONTRÔLE FINAL — ON REJOUE LES DEUX SONDES, ET LE DÉTACHEMENT EN ENTIER
-- ---------------------------------------------------------------------------
--
-- Inspecter `pg_constraint` prouverait que la clause a changé, pas qu'une
-- bouche survit à la suppression du compte de la personne. On monte un foyer
-- par ses vraies RPC, on y met une bouche sans compte, on la fait réclamer, on
-- purge, et on compte ce qui reste.
--
-- ⚠️ QUATRE COMPTES SONT CRÉÉS DANS `auth.users`, puis ANNULÉS. Le bloc entier
-- est une sous-transaction qui se termine par un `raise` attrapé.
--
-- ⚠️ LA FIXTURE DISTINGUE MEMBRE ET COMPTE: `v_lea` est un `member_id`,
-- `v_heir` un `user_id`, et ils ne sont jamais interchangeables. C'est la
-- classe de fixture menteuse qui rendrait ce lot vert sans qu'il marche.

do $$
declare
  v_owner uuid := 'd37a0000-0000-0000-0000-000000000001';
  v_heir  uuid := 'd37a0000-0000-0000-0000-000000000002';
  v_gone  uuid := 'd37a0000-0000-0000-0000-000000000003';
  v_out   uuid := 'd37a0000-0000-0000-0000-000000000004';
  v_house uuid;
  v_lea uuid;
  v_marc uuid;
  v_res jsonb;
  v_token text;
  v_rows int;
  v_uid uuid;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (v_owner, '__qa_detach_owner@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_heir, '__qa_detach_heir@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_gone, '__qa_detach_gone@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_out, '__qa_detach_out@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_res := public.keel_household_create('__qa_detach__');
  v_house := (v_res->>'household_id')::uuid;

  v_res := public.keel_household_add_member(
    'Lea', (current_date - interval '30 years')::date, 'fat_loss');
  v_lea := (v_res->>'member_id')::uuid;
  perform public.keel_household_add_restriction(v_lea, 'nutella');
  perform public.keel_household_add_allergy(v_lea, 'arachide');

  v_res := public.keel_household_add_member(
    'Marc', (current_date - interval '40 years')::date, 'health');
  v_marc := (v_res->>'member_id')::uuid;
  perform public.keel_household_add_allergy(v_marc, 'gluten');

  -- Léa et Marc réclament leur profil, par le vrai chemin.
  v_res := public.keel_household_invite('__qa_detach_heir@example.invalid', v_lea);
  v_token := v_res->>'token';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_heir, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'detach QA: réclamation de Lea refusée (%)', v_res;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_invite('__qa_detach_gone@example.invalid', v_marc);
  v_token := v_res->>'token';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_gone, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'detach QA: réclamation de Marc refusée (%)', v_res;
  end if;

  -- ── A. LES QUATRE REFUS NOMMÉS ──────────────────────────────────────────
  -- Léa (profil réclamé, pas maître) ne détache personne.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_heir, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_detach_member(v_marc);
  if (v_res->>'reason') <> 'not_owner' then
    raise exception
      'detach QA: un profil réclamé a pu détacher (%) — le foyer a deux '
      'gouvernants', coalesce(v_res->>'reason', '(succès)');
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- Une bouche du foyer d'à côté est indiscernable d'une bouche inexistante.
  v_res := public.keel_household_detach_member(
    '00000000-0000-0000-0000-0000000000ff');
  if (v_res->>'reason') <> 'not_a_member' then
    raise exception 'detach QA: cible inconnue rend « % »',
      coalesce(v_res->>'reason', '(succès)');
  end if;

  -- LE MAÎTRE NE SE DÉTACHE PAS LUI-MÊME (preuve d'acceptation n°5).
  select hm.member_id into v_uid from public.household_members hm
   where hm.user_id = v_owner;
  v_res := public.keel_household_detach_member(v_uid);
  if (v_res->>'reason') <> 'cannot_detach_owner' then
    raise exception
      'detach QA: le maître s''est détaché lui-même (%) — le foyer n''a plus '
      'personne pour composer', coalesce(v_res->>'reason', '(succès)');
  end if;

  -- Une bouche SANS COMPTE n'a rien à détacher.
  v_res := public.keel_household_add_member('Bebe', null, null);
  v_res := public.keel_household_detach_member((v_res->>'member_id')::uuid);
  if (v_res->>'reason') <> 'not_claimed' then
    raise exception
      'detach QA: détacher une bouche sans compte rend « % » — l''écran '
      'annoncerait un accès retiré qui n''existait pas',
      coalesce(v_res->>'reason', '(succès)');
  end if;

  -- ── B. LE DÉTACHEMENT NE PERD RIEN (preuve d'acceptation n°1) ───────────
  v_res := public.keel_household_detach_member(v_lea);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'detach QA: le détachement a été refusé (%)', v_res;
  end if;

  select count(*) into v_rows
  from public.household_members hm
  where hm.member_id = v_lea
    and hm.user_id is null
    and hm.first_name = 'Lea'
    and hm.goal = 'fat_loss'
    and hm.birth_date is not null;
  if v_rows <> 1 then
    raise exception
      'detach QA: la ligne détachée a perdu quelque chose — `member_id` a '
      'bougé, ou le prénom/objectif/date sont partis';
  end if;

  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_lea;
  if v_rows <> 1 then
    raise exception 'detach QA: % allergie(s) après détachement, want 1', v_rows;
  end if;
  select count(*) into v_rows
  from public.household_food_restrictions where member_id = v_lea;
  if v_rows <> 1 then
    raise exception 'detach QA: % contrainte(s) après détachement, want 1', v_rows;
  end if;

  -- ── C. LE PROFIL REDEVIENT RÉCLAMABLE (preuve d'acceptation n°4) ────────
  -- Le lien PRÉCÉDENT est consommé et reste mort; c'est un lien NEUF qui doit
  -- refonctionner. Affirmer l'inverse rendrait un jeton rejouable.
  v_res := public.keel_household_invite('__qa_detach_out@example.invalid', v_lea);
  if (v_res->>'ok')::boolean is not true then
    raise exception
      'detach QA: on ne peut plus inviter sur une bouche détachée (%) — le '
      'détachement serait définitif', v_res;
  end if;
  v_token := v_res->>'token';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'detach QA: la re-réclamation a été refusée (%)', v_res;
  end if;
  if (v_res->>'member_id')::uuid <> v_lea then
    raise exception
      'detach QA: la re-réclamation rend le member_id % au lieu de % — elle a '
      'CRÉÉ une ligne', v_res->>'member_id', v_lea;
  end if;

  -- ── D. SUPPRESSION DE COMPTE SANS LA CASE (preuve d'acceptation n°2) ────
  perform set_config('request.jwt.claims', '', true);
  v_res := public.keel_household_set_departure(v_gone, false);
  if (v_res->>'in_household')::boolean is not true then
    raise exception 'detach QA: Marc n''est pas vu dans son foyer (%)', v_res;
  end if;
  v_res := public.keel_household_purge_user(v_gone);
  if (v_res->>'action') <> 'detached' then
    raise exception
      'detach QA: sans la case, la purge fait « % » au lieu de détacher',
      v_res->>'action';
  end if;
  delete from auth.users where id = v_gone;

  select count(*) into v_rows
  from public.household_members hm
  where hm.member_id = v_marc and hm.user_id is null and hm.first_name = 'Marc';
  if v_rows <> 1 then
    raise exception
      'detach QA: la bouche de Marc a disparu avec son compte — c''est '
      'EXACTEMENT le défaut que ce lot ferme';
  end if;
  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_marc;
  if v_rows <> 1 then
    raise exception
      'detach QA: l''allergie de Marc est partie avec son compte (% restante), '
      'et le prochain repas contient du gluten', v_rows;
  end if;

  -- ── E. AVEC LA CASE, TOUT PART (preuve d'acceptation n°3) ───────────────
  v_res := public.keel_household_set_departure(v_out, true);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'detach QA: poser l''intention de départ a échoué (%)', v_res;
  end if;
  v_res := public.keel_household_purge_user(v_out);
  if (v_res->>'action') <> 'removed' then
    raise exception
      'detach QA: avec la case, la purge fait « % » au lieu de retirer',
      v_res->>'action';
  end if;
  delete from auth.users where id = v_out;

  select count(*) into v_rows
  from public.household_members where member_id = v_lea;
  if v_rows <> 0 then
    raise exception
      'detach QA: la case était cochée et la bouche est encore là — le geste '
      'explicite ne fait rien';
  end if;
  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_lea;
  if v_rows <> 0 then
    raise exception
      'detach QA: % allergie(s) orpheline(s) après le départ complet', v_rows;
  end if;

  -- ── F. LE MAÎTRE NE PART PAS DE SON FOYER ──────────────────────────────
  v_res := public.keel_household_set_departure(v_owner, true);
  if (v_res->>'reason') <> 'cannot_remove_owner' then
    raise exception
      'detach QA: le maître a pu demander à quitter son foyer (%) — le foyer '
      'resterait avec des bouches et aucun gouvernant',
      coalesce(v_res->>'reason', '(succès)');
  end if;

  -- ── G. LA SONDE A: LA PURGE DU MAÎTRE NE LÈVE PLUS ─────────────────────
  -- C'est l'assertion qui rend le droit à l'effacement applicable. Elle passe
  -- par `purge_auth_user`, exactement comme le cron.
  perform public.keel_household_purge_user(v_owner);
  perform public.purge_auth_user(v_owner);

  select count(*) into v_rows from public.households where id = v_house;
  if v_rows <> 1 then
    raise exception
      'detach QA: le foyer a disparu avec son créateur — les données de tous '
      'les autres avec';
  end if;
  select created_by into v_uid from public.households where id = v_house;
  if v_uid is not null then
    raise exception 'detach QA: households.created_by pointe encore sur un compte effacé';
  end if;
  select count(*) into v_rows
  from public.household_food_restrictions where household_id = v_house;
  if v_rows <> 0 then
    raise exception
      'detach QA: % règle(s) de maison restante(s) — elles visaient Lea, qui '
      'est partie avec sa case cochée', v_rows;
  end if;

  raise notice
    'household_detachment: 4 refus nommés, bouche détachée intacte, profil '
    're-réclamé, purge sans case = détachement, purge avec case = départ, '
    'purge du maître possible';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

select set_config('request.jwt.claims', '', true);

commit;
