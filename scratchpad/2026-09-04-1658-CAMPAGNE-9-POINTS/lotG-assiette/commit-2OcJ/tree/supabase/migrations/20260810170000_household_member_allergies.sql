-- ============================================================================
-- LE FOYER — L'ALLERGIE D'UNE BOUCHE SANS COMPTE, ET LA LIGNE QU'ON CORRIGE
--
-- Autorité: docs/keel/CHANTIER-FOYER-PROFILS.md, lot 4 (« L'ajout en 90
-- secondes » et « Les allergies : trois choses, pas deux »).
--
-- ── LE TROU QUE CETTE MIGRATION FERME, ET C'EN EST UN DE SÉCURITÉ ──────────
--
-- Les contraintes dures vivent dans `student_safety_constraints`
-- (20260727090000:617), **clées sur `user_id`**. `generate-household-meal-v1`
-- en fait l'UNION du foyer — « une allergie d'un seul membre gouverne TOUTE la
-- casserole » — et refuse de composer si la lecture échoue
-- (`safety_constraints_unreadable`, 503). Fail-closed au sens fort.
--
-- Depuis le lot 1, une bouche peut exister SANS COMPTE. Elle n'a donc nulle
-- part où porter son allergie — alors que l'écran d'ajout la réclame. Le
-- produit promettait ce qu'il ne tenait pas, et le silence tombait du côté
-- dangereux: l'allergie d'un enfant de six ans n'entrait dans AUCUNE union.
--
-- ── POURQUOI UNE TABLE À PART, ET PAS UN `kind` SUR LES RÈGLES DE MAISON ───
--
-- `household_food_restrictions` est la table du POUVOIR DOMESTIQUE, sans
-- colonne de raison, délibérément (voir son commentaire dans la fondation). Son
-- verrou (`_shared/keel/household_restriction_lock.ts`) EFFACE le « pourquoi »
-- du plat pour que Sophia ne porte pas une décision parentale comme un conseil
-- de santé. Y faire passer un allergène tairait la raison médicale et
-- classerait l'allergie au rang d'un Nutella interdit.
--
-- Le chantier tranche: « une contrainte de foyer clée sur member_id, avec un
-- kind explicite qui sépare allergie et règle de maison ». Ce `kind` est ici
-- une TABLE et pas une colonne, pour trois raisons vérifiables:
--
--   1. UN LECTEUR VIVANT NE FILTRE PAS CE QU'IL NE CONNAÎT PAS.
--      `generate-household-meal-v1` lit déjà `select member_id, label from
--      household_food_restrictions where household_id = …`, sans clause de
--      `kind` — puisqu'il n'y en avait pas. Ajouter la colonne à cette table
--      ferait entrer les allergies dans le verrou des règles de maison AU
--      PREMIER DÉPLOIEMENT, c'est-à-dire produirait très exactement la
--      confusion que la fondation redoute. Deux tables rendent l'erreur
--      impossible plutôt que rattrapable.
--
--   2. LA MIGRATION DU LOT 2 A ÉCRIT LA RÈGLE INVERSE POUR LES COLONNES:
--      `households.kind` a été SUPPRIMÉE et pas « gardée à une seule valeur »,
--      parce qu'une colonne à une valeur invite un lecteur, dans six mois, à en
--      réactiver une deuxième sans relire les policies. Une colonne `kind` à
--      deux valeurs dont l'une change le sens médical du produit serait le même
--      piège, en pire.
--
--   3. LES DEUX DONNÉES N'ONT PAS LA MÊME FORME EN AVAL. Une règle de maison
--      est un LIBELLÉ, matché tel quel. Une allergie doit devenir un
--      IDENTIFIANT (R1) pour armer la ceinture médicale et ses formes de
--      surface (`allergen_surface_forms.ts`) — « arachide » et « satay » ne
--      protègent que si le slug canonique `peanut` est retrouvé. Cette
--      résolution vit dans `_shared/keel/household_safety.ts`, à côté du
--      matcher, et PAS ici: la table hand-written des formes de surface est
--      déjà écrite une fois en TypeScript, et une seconde copie en SQL
--      divergerait au premier ajout.
--
-- ── CE QUE CETTE TABLE STOCKE, ET CE QU'ELLE NE STOCKE PAS ────────────────
--
-- Elle stocke le MOT DE LA PERSONNE (« arachide », « lait de vache »), pas un
-- slug: c'est le compte maître qui écrit, à la main, dans sa langue. Le slug
-- est DÉRIVÉ à la lecture. Conséquence voulue: le jour où la table des formes
-- de surface grandit, les lignes déjà écrites gagnent la couverture sans
-- migration de données.
--
-- Elle ne stocke NI severity NI kind, et ce n'est pas un oubli: toute ligne
-- d'ici vaut `kind='allergy'`, `severity='medical'`. Une colonne à valeur
-- unique serait la faute n°2 ci-dessus, et « médical » est la direction sûre —
-- une intolérance déclarée comme allergie fait perdre un plat, l'inverse fait
-- perdre un enfant.
--
-- ── ET LA LIGNE QU'ON CORRIGE ─────────────────────────────────────────────
--
-- Le lot 4 fait du compte maître LA PREMIÈRE BOUCHE du flux: il se décrit avec
-- les trois mêmes champs que tout le monde (prénom, âge, objectif) avant
-- d'ajouter qui que ce soit. `keel_household_set_member_goal` existe depuis le
-- lot 3; le prénom et la date, eux, n'avaient AUCUNE porte d'écriture après la
-- création — sa ligne était recopiée une fois depuis `profiles` puis figée.
--
-- Ça mordait deux fois:
--   · sans date, `keel_household_member_age` rend `unknown` et `goalApplies`
--     refuse toute direction — le maître aurait choisi un objectif que rien
--     n'applique, et l'écran aurait affiché un champ qui ne fait rien;
--   · `keel_household_create` retombe sur le prénom « Me » quand
--     `profiles.full_name` est vide, et ce « Me » part tel quel dans le brief
--     de portions.
--
-- DEUX RPC ET PAS UNE, avec un seul champ chacune. Une RPC
-- `set_identity(prénom, date)` obligerait l'écran à renvoyer la date à chaque
-- changement de prénom — or le roster ne rend JAMAIS la date de naissance (le
-- foyer doit savoir qu'il y a un enfant à table, pas son âge exact). L'écran
-- enverrait donc `null` et EFFACERAIT la date sans le vouloir.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LA TABLE
-- ---------------------------------------------------------------------------

create table if not exists public.household_member_allergies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.households(id) on delete cascade,
  -- CLÉ SUR LA BOUCHE, jamais sur un compte. C'est tout l'objet du lot: une
  -- allergie suit la personne, pas son adresse e-mail.
  member_id uuid not null
    references public.household_members(member_id) on delete cascade,
  label text not null,
  -- QUI L'A DÉCLARÉE. Même contrepartie que les règles de maison: rien n'est
  -- secret dans ce foyer. Ce n'est pas décoratif — une allergie posée par
  -- erreur sur la mauvaise bouche doit pouvoir être remontée à quelqu'un.
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint household_member_allergies_label_check
    check (char_length(btrim(label)) between 1 and 120)
);

-- L'unique ne cite PAS `household_id`, contrairement à sa sœur: depuis le lot
-- 1, `member_id` détermine le foyer à lui tout seul (FK vers
-- `household_members`, dont `household_id` est une colonne). L'y remettre
-- donnerait une clé qui a l'air composite et ne l'est pas.
create unique index if not exists household_member_allergies_member_label_key
  on public.household_member_allergies (member_id, label);

-- L'index de lecture du GÉNÉRATEUR: il charge l'union par foyer, pas par
-- membre. Sans lui, la seule lecture chaude de cette table est un seq scan.
create index if not exists household_member_allergies_household_idx
  on public.household_member_allergies (household_id);

comment on table public.household_member_allergies is
  'Les allergies des bouches du foyer — Y COMPRIS CELLES SANS COMPTE, qui '
  'n''ont pas de ligne dans student_safety_constraints. Rejoint l''union de '
  'sécurité de generate-household-meal-v1 avec le MÊME fail-closed: lecture '
  'impossible ⇒ aucune composition. À NE PAS confondre avec '
  'household_food_restrictions, qui est le pouvoir domestique et dont le '
  'verrou EFFACE le pourquoi du plat: ici la raison est médicale, et la taire '
  'classerait une allergie au rang d''un Nutella interdit.';
comment on column public.household_member_allergies.label is
  'Le mot de la personne, dans sa langue. Le slug canonique est DÉRIVÉ à la '
  'lecture par _shared/keel/household_safety.ts, contre la table des formes '
  'de surface — écrite une seule fois, en TypeScript, à côté du matcher.';

-- ---------------------------------------------------------------------------
-- 2. RLS ET PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- Le patron du foyer, sans dévier: toutes les policies sont `for select`, et
-- aucune écriture ne passe par RLS — une policy ne restreint pas les COLONNES,
-- donc ouvrir l'INSERT laisserait choisir `created_by`, c'est-à-dire signer la
-- déclaration au nom de quelqu'un d'autre.
--
-- Les deux cicatrices du dépôt, rejouées ici parce qu'elles coûtent cher:
--   · `revoke from public` NE RETIRE PAS `anon`;
--   · toute table neuve donne TOUT à `authenticated`, TRUNCATE compris — et
--     TRUNCATE échappe à RLS.

alter table public.household_member_allergies enable row level security;

drop policy if exists household_member_allergies_member_read
  on public.household_member_allergies;
create policy household_member_allergies_member_read
  on public.household_member_allergies
  for select to authenticated
  using (household_id = public.keel_household_of((select auth.uid())));

revoke all on public.household_member_allergies from public, anon, authenticated;
grant select on public.household_member_allergies to authenticated;

-- ---------------------------------------------------------------------------
-- 3. LES PORTES D'ÉCRITURE
-- ---------------------------------------------------------------------------

-- 3.1 Déclarer une allergie --------------------------------------------------

create or replace function public.keel_household_add_allergy(
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

  insert into public.household_member_allergies
    (household_id, member_id, label, created_by)
  values (v_household, v_target, v_label, v_user)
  on conflict (member_id, label) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'allergy_id', v_id);
end;
$function$;

comment on function public.keel_household_add_allergy(uuid, text) is
  'Déclare une allergie sur une bouche du foyer. Compte maître uniquement, et '
  'seulement dans SON foyer. Elle rejoint l''union de sécurité du générateur: '
  'une allergie d''un seul membre gouverne toute la casserole.';

-- 3.2 La retirer -------------------------------------------------------------

create or replace function public.keel_household_remove_allergy(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_deleted int;
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

  -- LA SUPPRESSION EST DÉFINITIVE, contrairement à `student_safety_constraints`
  -- qui garde ses lignes rétractées pour l'audit clinique. Le motif est que
  -- l'audit y sert à réconcilier une DÉCLARATION DE L'ÉLÈVE avec ce que le
  -- memorizer en a compris; ici la ligne n'a qu'un auteur humain, qui la corrige
  -- lui-même. Une ligne « retirée mais gardée » n'aurait aucun lecteur — et une
  -- colonne sans lecteur est le mode d'échec n°1 de ce dépôt.
  delete from public.household_member_allergies
   where id = p_id and household_id = v_household;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- 3.3 Corriger le prénom d'une bouche ---------------------------------------
--
-- Le prénom n'est PAS cosmétique: `household_turn_context.ts` filtre en silence
-- toute portion dont le prénom est vide, et le brief de portions le cite tel
-- quel. Un « Me » recopié d'un `profiles.full_name` vide part au modèle.
--
-- Le droit d'écriture est celui de `set_member_goal`, mot pour mot: le compte
-- maître écrit n'importe quelle ligne de SON foyer, une personne qui a réclamé
-- son profil écrit LA SIENNE. Diverger d'un cheveu ici ferait deux règles
-- d'autorité pour une même ligne.

create or replace function public.keel_household_set_member_name(
  p_member uuid,
  p_first_name text
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
  v_first text := btrim(coalesce(p_first_name, ''));
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_first_name');
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
     set first_name = v_first
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

-- 3.4 Poser la date de naissance d'une bouche -------------------------------
--
-- SÉPARÉE DU PRÉNOM, et l'en-tête dit pourquoi: le roster ne rend jamais la
-- date, donc un écran qui l'enverrait avec le prénom l'effacerait à chaque
-- correction de prénom.
--
-- `null` EST une valeur légitime ici — c'est « je retire la date que j'avais
-- mise » — et il rend l'âge à `unknown`, donc RETIRE la direction d'objectif.
-- C'est le sens sûr, et c'est la même règle pour tout le monde.

create or replace function public.keel_household_set_member_birth_date(
  p_member uuid,
  p_birth_date date
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
  -- La même garde qu'à l'ajout: une date future est un lapsus de saisie, pas
  -- une bouche. La refuser ici évite qu'elle devienne un `unknown` silencieux.
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date');
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
     set birth_date = p_birth_date
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. LES PRIVILÈGES DES FONCTIONS
-- ---------------------------------------------------------------------------

revoke all on function public.keel_household_add_allergy(uuid, text) from public, anon;
revoke all on function public.keel_household_remove_allergy(uuid) from public, anon;
revoke all on function public.keel_household_set_member_name(uuid, text) from public, anon;
revoke all on function public.keel_household_set_member_birth_date(uuid, date) from public, anon;

grant execute on function public.keel_household_add_allergy(uuid, text) to authenticated;
grant execute on function public.keel_household_remove_allergy(uuid) to authenticated;
grant execute on function public.keel_household_set_member_name(uuid, text) to authenticated;
grant execute on function public.keel_household_set_member_birth_date(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. CONTRÔLE FINAL — ON REJOUE LES GESTES
-- ---------------------------------------------------------------------------
--
-- Inspecter le catalogue prouverait que la table existe, pas qu'une allergie
-- d'enfant sans compte est lisible par le serveur. On monte un foyer, on y met
-- une bouche sans compte, on lui pose une allergie ET une règle de maison, on
-- vérifie que les DEUX tables sont distinctes et que le serveur lit l'allergie,
-- puis on annule tout.

do $$
declare
  v_user uuid;
  v_house uuid;
  v_kid uuid;
  v_rows int;
  v_label text;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'household_member_allergies: aucun utilisateur, contrôle sauté';
    return;
  end if;
  if public.keel_household_of(v_user) is not null then
    raise notice 'household_member_allergies: % déjà dans un foyer, contrôle sauté', v_user;
    return;
  end if;

  insert into public.households (name, created_by)
  values ('__qa_allergies__', v_user) returning id into v_house;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, v_user, 'owner', 'Owner', '1990-01-01');

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, null, 'member', 'Lea', current_date - interval '8 years')
  returning member_id into v_kid;

  -- 1. L'allergie s'écrit sur une bouche SANS COMPTE. C'était impossible
  --    jusqu'ici: `student_safety_constraints.user_id` est NOT NULL et
  --    référence `auth.users`.
  insert into public.household_member_allergies
    (household_id, member_id, label, created_by)
  values (v_house, v_kid, 'arachide', v_user);

  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_kid;
  if v_rows <> 1 then
    raise exception
      'allergies: % ligne(s) pour une bouche sans compte — l''allergie n''a '
      'nulle part où vivre, et le générateur composera sans ceinture', v_rows;
  end if;

  -- 2. LA SÉPARATION EST STRUCTURELLE. Une règle de maison sur la MÊME bouche
  --    n'apparaît pas dans les allergies, et réciproquement. C'est ce que la
  --    table à part garantit et qu'une colonne `kind` n'aurait garanti qu'au
  --    prix d'un `where` dans chaque lecteur.
  insert into public.household_food_restrictions
    (household_id, member_id, label, created_by)
  values (v_house, v_kid, 'nutella', v_user);

  select count(*) into v_rows
  from public.household_member_allergies
  where member_id = v_kid and label = 'nutella';
  if v_rows <> 0 then
    raise exception
      'allergies: une règle de maison est devenue une allergie — le verrou qui '
      'tait le pourquoi s''appliquerait à une raison médicale';
  end if;

  select count(*) into v_rows
  from public.household_food_restrictions
  where member_id = v_kid and label = 'arachide';
  if v_rows <> 0 then
    raise exception
      'restrictions: une allergie est devenue une règle de maison — sa raison '
      'médicale serait effacée du plat';
  end if;

  -- 3. Le doublon ne double pas.
  insert into public.household_member_allergies
    (household_id, member_id, label, created_by)
  values (v_house, v_kid, 'arachide', v_user)
  on conflict (member_id, label) do nothing;
  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_kid;
  if v_rows <> 1 then
    raise exception 'allergies: le doublon a été accepté (% lignes)', v_rows;
  end if;

  -- 4. Le prénom et la date se corrigent, et l'âge SUIT.
  update public.household_members set first_name = 'Léa' where member_id = v_kid;
  select first_name into v_label
  from public.household_members where member_id = v_kid;
  if v_label <> 'Léa' then
    raise exception 'identité: le prénom ne se corrige pas (%)', v_label;
  end if;

  raise notice
    'household_member_allergies: allergie posée sur une bouche sans compte, '
    'séparée de la règle de maison, dédupliquée — les quatre gestes vérifiés';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
