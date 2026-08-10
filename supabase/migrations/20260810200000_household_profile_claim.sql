-- ============================================================================
-- LE FOYER — RÉCLAMER SON PROFIL
--
-- Autorité: docs/keel/CHANTIER-FOYER-PROFILS.md, lot 6. Les lots 1, 2, 3, 3B et
-- 4 sont livrés; celui-ci est le dernier geste de la chaîne d'identité.
--
-- ── CE QUE CETTE MIGRATION CHANGE ──────────────────────────────────────────
--
-- `keel_household_join` CHANGE DE RÔLE. Elle insérait une ligne — c'est-à-dire
-- qu'elle CRÉAIT une bouche de plus dans le foyer. Elle ATTACHE désormais un
-- compte à une ligne qui existe déjà: `member_id` ne bouge pas, `user_id` passe
-- de NULL à une valeur, et tout ce qui pend à `member_id` — portions,
-- contraintes de maison, allergies, objectif — lui reste attaché sans qu'une
-- seule ligne ne soit recopiée.
--
-- Le lot 1 a rendu ce geste presque gratuit: il avait déjà fait de `member_id`
-- la clé et de `user_id` une propriété optionnelle. Ce qui manquait était la
-- CIBLE — une invitation ne savait pas de QUI elle était l'invitation.
--
-- ── LA DÉCISION CENTRALE: L'INVITATION PORTE SA CIBLE ──────────────────────
--
-- `household_invitations` porte une adresse et un foyer. Deux façons de dire
-- « cette invitation est pour LA ligne de Léa »:
--
--   A. une colonne `member_id` sur l'invitation, choisie par le maître;
--   B. le choix au moment du join, par la personne qui arrive.
--
-- C'est A, pour une raison qui n'est pas de confort: en B, la personne qui
-- arrive CHOISIT quelle bouche elle devient. Un lien qui fuite deviendrait
-- alors le droit de se déclarer n'importe qui du foyer — l'enfant de huit ans,
-- ou la ligne d'un absent — et la garde d'adresse e-mail ne protégerait plus
-- que l'entrée, pas la destination. En A, la cible est écrite par le maître au
-- moment où il invite, avant que le lien n'existe: le jeton ne porte aucun
-- pouvoir de choix.
--
-- Conséquence directe sur la signature: `keel_household_invite` prend `p_member`
-- et l'écran demande QUI on invite. « Le maître doit savoir qui il invite »
-- n'est pas une ligne de copie, c'est un paramètre obligatoire.
--
-- ── LES TROIS REJEUX, ET CE QU'ILS RENDENT ─────────────────────────────────
--
--   · LA LIGNE EST DÉJÀ RÉCLAMÉE (`user_id` non nul) ⇒ `already_claimed`.
--     Vérifié DEUX FOIS: à l'émission (ne pas fabriquer un lien mort) et à la
--     réclamation, cette dernière dans le `where` de l'UPDATE lui-même —
--     `and user_id is null` — pour que deux réclamations simultanées ne
--     puissent pas toutes deux croire avoir gagné.
--
--   · LE JETON A SERVI (`consumed_at`) ⇒ `already_used`. Inchangé.
--
--   · LE COMPTE EST DÉJÀ DANS UN FOYER ⇒ `already_in_household`.
--     `household_members_one_per_user` est un index UNIQUE sur `user_id`: un
--     compte = un foyer, et c'est l'invariant scalaire dont dépend
--     `keel_household_of`, donc TOUTES les policies du foyer. On rend le motif
--     plutôt que de laisser remonter une violation d'unicité — mais on garde
--     AUSSI le filet du `exception when unique_violation`, parce qu'entre le
--     test et l'UPDATE il y a une fenêtre, et qu'un 500 opaque sur ce chemin
--     serait indiscernable d'un produit cassé.
--
-- ── L'ORDRE DES REFUS A CHANGÉ, ET C'EST UNE GARDE ─────────────────────────
--
-- `already_in_household` était testé EN PREMIER, avant même de regarder le
-- jeton. Un tiers qui vole un lien et possède déjà son propre foyer recevait
-- donc `already_in_household` — et le test « un jeton volé ne sert à personne
-- d'autre » ne passait qu'au prix d'une fixture qui sortait l'intrus de son
-- foyer d'abord, c'est-à-dire en testant autre chose que ce qu'il annonçait.
-- L'adresse est désormais vérifiée AVANT l'état du compte: le vol est refusé
-- pour la bonne raison, que le voleur ait un foyer ou non.
--
-- ── LE PRÉNOM N'EST PAS ÉCRASÉ ─────────────────────────────────────────────
--
-- L'ancienne version recopiait `profiles.full_name` sur la ligne créée. La
-- réclamation n'écrit NI le prénom NI la date de naissance: la ligne les porte
-- déjà, saisis par le maître, et c'est ce qui part au modèle dans le brief de
-- portions. Une réclamation qui renommerait « Léa » en « Alexandra » (le
-- `full_name` du compte) changerait le repas de quelqu'un en silence. La
-- personne peut corriger elle-même après coup: `keel_household_set_member_name`
-- autorise déjà SA ligne (lot 4).
--
-- ── CE QUE LA RÉCLAMATION GAGNE, EN BASE ───────────────────────────────────
--
-- Rien de neuf, et c'est le point. `user_id` non nul suffit: `keel_household_of`
-- rend le foyer, donc toutes les policies `for select` du foyer mordent —
-- roster, composition, contraintes, allergies, envies. Et
-- `keel_household_set_member_goal` autorise déjà « sa propre ligne » depuis le
-- lot 3 (`not_your_line` sinon). Aucune porte d'écriture n'est ouverte ici:
-- composer, ajouter, retirer, restreindre restent `not_owner`. UNE SEULE
-- PERSONNE GOUVERNE LE MENU.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. L'INVITATION VISE UNE LIGNE
-- ---------------------------------------------------------------------------

alter table public.household_invitations
  add column if not exists member_id uuid;

-- BACKFILL — et il ne peut pas tout sauver, ce qui est correct.
--
-- Une invitation CONSOMMÉE a produit une ligne dans ce foyer, pour le compte
-- dont l'adresse est celle de l'invitation. On la retrouve par cette adresse:
-- c'est la seule jointure disponible, et elle est exacte parce que
-- `household_members_one_per_user` garantit qu'un compte n'a qu'une ligne.
update public.household_invitations hi
   set member_id = hm.member_id
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
 where hm.household_id = hi.household_id
   and lower(btrim(coalesce(u.email, ''))) = hi.email
   and hi.member_id is null;

-- Une invitation NON CONSOMMÉE d'avant ce lot décrit un geste qui n'existe
-- plus: « crée-toi une ligne dans ce foyer ». On ne peut pas lui inventer une
-- cible sans choisir à la place du maître — donc elle s'en va, et le maître
-- réinvite en désignant la bouche. Un lien mort qui refuse proprement vaut
-- mieux qu'un lien vivant qui fait autre chose que ce qu'il promettait.
delete from public.household_invitations where member_id is null;

alter table public.household_invitations
  alter column member_id set not null;

-- ON DELETE CASCADE, ET C'EST LA GARDE LA PLUS SILENCIEUSE DE CE LOT: retirer
-- une bouche du foyer emporte ses invitations. Sans elle, un lien émis pour
-- Léa survivrait à Léa, et `keel_household_join` devrait inventer un motif pour
-- une cible disparue. Avec elle, le jeton devient simplement `unknown_token`.
alter table public.household_invitations
  drop constraint if exists household_invitations_member_fk;
alter table public.household_invitations
  add constraint household_invitations_member_fk
  foreign key (member_id) references public.household_members(member_id)
  on delete cascade;

-- PAS D'UNIQUE « une seule invitation vivante par bouche », et c'est délibéré.
-- Le maître se trompe d'adresse, réinvite, et les deux liens vivent: le premier
-- qui aboutit réclame la ligne, les autres tombent sur `already_claimed`. Un
-- unique partiel rendrait le second envoi impossible jusqu'à l'expiration —
-- soit quatorze jours pendant lesquels une faute de frappe est irréparable —
-- pour empêcher quelque chose que `user_id is null` empêche déjà.
create index if not exists household_invitations_member_idx
  on public.household_invitations (member_id)
  where consumed_at is null;

comment on column public.household_invitations.member_id is
  'LA BOUCHE que cette invitation permet de réclamer, choisie par le compte '
  'maître à l''émission. Ce n''est pas une commodité: si la cible était choisie '
  'au moment de rejoindre, un lien qui fuite deviendrait le droit de se '
  'déclarer n''importe qui du foyer.';

comment on table public.household_invitations is
  'Invitation à RÉCLAMER UNE LIGNE du foyer (lot 6) — ce n''est plus l''entrée '
  'dans le produit. Usage unique (`consumed_at`), liée à une adresse, liée à '
  'une bouche, expirante. La base ne stocke que sha256(jeton) via '
  'public.coach_invite_token_hash: un dump ne rend rien d''utilisable.';

-- ---------------------------------------------------------------------------
-- 2. INVITER — UNE ADRESSE, ET UNE BOUCHE
-- ---------------------------------------------------------------------------
--
-- Signature CHANGÉE, donc l'ancienne est DROPPÉE: en Postgres deux arités sont
-- deux fonctions, et laisser `keel_household_invite(text)` en place garderait
-- vivante une porte qui émet un jeton sans cible — c'est-à-dire un lien que la
-- nouvelle `keel_household_join` ne saurait pas honorer.

drop function if exists public.keel_household_invite(text);

create or replace function public.keel_household_invite(
  p_email text,
  p_member uuid
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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_target record;
  v_today_count integer;
  v_token text;
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
  if v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;

  -- LA CIBLE, DANS SON FOYER À LUI. `not_a_member` couvre du même geste une
  -- bouche inexistante et une bouche du foyer d'à côté: de l'extérieur, les
  -- deux doivent être indiscernables, sinon la RPC devient un moyen de tester
  -- l'existence d'un identifiant.
  select hm.member_id, hm.user_id, hm.first_name into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- ON N'ÉMET PAS UN LIEN MORT. La ligne a déjà un compte: le seul effet du
  -- jeton serait un refus, quatorze jours plus tard, chez quelqu'un qui aurait
  -- cru recevoir un accès.
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  -- PLAFOND INCHANGÉ (fondation): un foyer n'invite pas vingt personnes par
  -- jour; ce qui le ferait, c'est un script. Ici et pas à l'écran, parce
  -- qu'une limite d'UI n'est pas une limite.
  select count(*) into v_today_count
  from public.household_invitations hi
  where hi.household_id = v_household
    and hi.created_at >= (now() - interval '1 day');

  if v_today_count >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=', '-_'
  );

  insert into public.household_invitations
    (household_id, member_id, email, token_hash, invited_by, expires_at)
  values
    (v_household, v_target.member_id, v_email,
     public.coach_invite_token_hash(v_token), v_user,
     now() + interval '14 days');

  -- LE PRÉNOM EST RENDU pour que l'écran écrive « le lien de Léa » et pas
  -- « le lien ». Le maître émet plusieurs invitations dans la même minute; un
  -- jeton anonyme est un jeton qu'on envoie à la mauvaise personne.
  return jsonb_build_object(
    'ok', true, 'token', v_token, 'email', v_email,
    'member_id', v_target.member_id, 'first_name', v_target.first_name
  );
end;
$function$;

comment on function public.keel_household_invite(text, uuid) is
  'Émet un lien de RÉCLAMATION pour UNE bouche précise du foyer. Compte maître '
  'uniquement. Le jeton en clair n''est rendu qu''ici, une fois; la base n''en '
  'garde que le sha256.';

-- ---------------------------------------------------------------------------
-- 3. LIRE UNE INVITATION SANS COMPTE — le strict nécessaire
-- ---------------------------------------------------------------------------
--
-- POURQUOI CETTE FONCTION EXISTE. La personne qui ouvre le lien n'a, le plus
-- souvent, aucun compte: elle ne peut donc RIEN lire du foyer (toutes les
-- policies passent par `keel_household_of(auth.uid())`). Sans cette porte,
-- l'écran de réclamation serait une page anonyme demandant de créer un compte
-- pour une raison qu'elle ne peut pas nommer — et la personne devinerait
-- l'adresse à employer, alors que se tromper d'adresse coûte un compte inutile.
--
-- CE QU'ELLE REND, ET RIEN D'AUTRE: le nom du foyer, le prénom de la bouche, et
-- l'adresse à laquelle le lien a été envoyé. Trois champs que le détenteur du
-- lien a déjà, par construction — le maître les lui a envoyés. Aucun
-- identifiant, aucun autre membre, aucun objectif, aucune contrainte.
--
-- C'est le patron exact de `preview_coach_invitation`, y compris son
-- exécutabilité par `anon`. Le jeton fait 32 octets aléatoires: il n'est pas
-- devinable, et lire un jeton ne le consomme pas.
create or replace function public.keel_household_preview_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_inv record;
begin
  select hi.email, hi.expires_at, hi.consumed_at,
         hm.first_name, hm.user_id, h.name as household_name
    into v_inv
  from public.household_invitations hi
  join public.household_members hm on hm.member_id = hi.member_id
  join public.households h on h.id = hi.household_id
  where hi.token_hash = public.coach_invite_token_hash(coalesce(p_token, ''));

  if v_inv.email is null then
    return jsonb_build_object('valid', false, 'reason', 'unknown_token');
  end if;
  if v_inv.consumed_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if v_inv.user_id is not null then
    return jsonb_build_object('valid', false, 'reason', 'already_claimed');
  end if;

  return jsonb_build_object(
    'valid', true,
    'household_name', v_inv.household_name,
    'first_name', v_inv.first_name,
    'email', v_inv.email
  );
end;
$function$;

comment on function public.keel_household_preview_invitation(text) is
  'Ce qu''un lien de réclamation dit AVANT toute authentification: le foyer, le '
  'prénom de la bouche, et l''adresse invitée. Rien d''autre — et rien qui ne '
  'soit déjà entre les mains de qui détient le lien. Ne consomme pas le jeton.';

-- ---------------------------------------------------------------------------
-- 4. RÉCLAMER — ATTACHER, JAMAIS CRÉER
-- ---------------------------------------------------------------------------

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
  v_claimed integer;
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
  -- L'ADRESSE AVANT L'ÉTAT DU COMPTE. Voir l'en-tête: un jeton volé doit être
  -- refusé parce qu'il n'est pas adressé au voleur, que le voleur ait déjà un
  -- foyer ou non.
  if v_email is null or v_email = '' or v_email <> v_inv.email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;
  if v_inv.consumed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  if public.keel_household_of(v_user) is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
  end if;

  -- L'ATTACHEMENT. UNE colonne écrite, sur une ligne qui existe déjà.
  --
  -- `and user_id is null` N'EST PAS REDONDANT avec la vérification de
  -- `keel_household_invite`: entre l'émission et ici il peut s'être passé des
  -- jours, et deux jetons peuvent viser la même bouche (voir section 1). C'est
  -- CE `where` qui rend la réclamation non rejouable, pas le test qui précède.
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

  update public.household_invitations
     set consumed_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'household_id', v_inv.household_id,
    'member_id', v_inv.member_id
  );
exception
  -- LE FILET DE `household_members_one_per_user`. Le test plus haut le couvre
  -- en pratique; cette branche couvre la fenêtre entre le test et l'UPDATE, et
  -- surtout elle garantit qu'un compte déjà logé ne produit JAMAIS un 500 sur
  -- ce chemin — un échec opaque ici est indiscernable d'un produit cassé pour
  -- la personne qui vient de créer son compte.
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
end;
$function$;

comment on function public.keel_household_join(text) is
  'RÉCLAME UN PROFIL: attache le compte appelant à une ligne de foyer qui '
  'existe déjà. `member_id` ne change pas, `user_id` passe de NULL à une '
  'valeur, et portions, contraintes, allergies et objectif restent attachés. '
  'Ne crée AUCUNE ligne, n''écrase NI le prénom NI la date. Ce que la '
  'réclamation donne: lire le foyer, et poser SON objectif '
  '(keel_household_set_member_goal). Rien d''autre — composer, ajouter, '
  'retirer et restreindre restent au compte maître.';

-- ---------------------------------------------------------------------------
-- 5. LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- Les deux cicatrices, rejouées: `revoke from public` NE RETIRE PAS `anon`, et
-- toute fonction neuve est exécutable par tout le monde par défaut.

revoke all on function public.keel_household_invite(text, uuid) from public, anon;
revoke all on function public.keel_household_join(text) from public, anon;
grant execute on function public.keel_household_invite(text, uuid) to authenticated;
grant execute on function public.keel_household_join(text) to authenticated;

-- LA SEULE FONCTION DE FOYER EXÉCUTABLE PAR `anon`, et c'est son objet: la
-- personne qui ouvre le lien n'a pas encore de compte. On révoque d'abord
-- `public` (le rôle-groupe), puis on accorde nommément — accorder sans révoquer
-- laisserait le `execute` implicite de `public` couvrir tout rôle futur.
revoke all on function public.keel_household_preview_invitation(text) from public;
grant execute on function public.keel_household_preview_invitation(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. CONTRÔLE FINAL — ON REJOUE LA RÉCLAMATION EN ENTIER
-- ---------------------------------------------------------------------------
--
-- Inspecter le catalogue prouverait que la colonne existe, pas qu'une bouche
-- garde ses affaires en réclamant son profil. On monte un foyer, on y met une
-- bouche SANS COMPTE avec un objectif, une règle de maison et une allergie, on
-- la réclame par la vraie RPC, et on vérifie que rien n'a bougé sauf `user_id`.
--
-- ⚠️ TROIS COMPTES SONT CRÉÉS DANS `auth.users`, puis ANNULÉS. Le bloc entier
-- est une sous-transaction qui se termine par un `raise` attrapé: rien de ce
-- qu'il écrit ne survit, y compris ce que le trigger `handle_new_user` en
-- dérive. C'est le prix d'un contrôle qui exerce `auth.uid()` — et sans
-- `auth.uid()`, on ne testerait pas la fonction, on testerait un UPDATE.

do $$
declare
  v_owner uuid := 'c1a10000-0000-0000-0000-000000000001';
  v_heir  uuid := 'c1a10000-0000-0000-0000-000000000002';
  v_thief uuid := 'c1a10000-0000-0000-0000-000000000003';
  v_house uuid;
  v_lea uuid;
  v_res jsonb;
  v_token text;
  v_rows int;
  v_txt text;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (v_owner, '__qa_claim_owner@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_heir, '__qa_claim_heir@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_thief, '__qa_claim_thief@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_res := public.keel_household_create('__qa_claim__');
  if (v_res->>'ok')::boolean is not true then
    raise exception 'claim QA: création du foyer refusée (%)', v_res;
  end if;
  v_house := (v_res->>'household_id')::uuid;

  v_res := public.keel_household_add_member(
    'Lea', (current_date - interval '30 years')::date, 'fat_loss');
  if (v_res->>'ok')::boolean is not true then
    raise exception 'claim QA: ajout de la bouche refusé (%)', v_res;
  end if;
  v_lea := (v_res->>'member_id')::uuid;

  perform public.keel_household_add_restriction(v_lea, 'nutella');
  perform public.keel_household_add_allergy(v_lea, 'arachide');

  -- 1. L'ÉMISSION VISE UNE BOUCHE.
  v_res := public.keel_household_invite('__qa_claim_heir@example.invalid', v_lea);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'claim QA: invitation refusée (%)', v_res;
  end if;
  if (v_res->>'first_name') <> 'Lea' then
    raise exception
      'claim QA: l''invitation ne nomme pas sa cible (%) — l''écran ne peut pas '
      'dire de qui est le lien', v_res;
  end if;
  v_token := v_res->>'token';

  -- 2. LE JETON VOLÉ NE SERT À PERSONNE D'AUTRE, et le voleur n'a PAS de foyer:
  --    le refus doit venir de l'adresse, pas de son état de compte.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_thief, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token);
  if (v_res->>'reason') <> 'email_mismatch' then
    raise exception
      'claim QA: un jeton volé rend « % » et non email_mismatch — la garde '
      'd''adresse ne mord plus', coalesce(v_res->>'reason', '(succès)');
  end if;

  -- 3. LA RÉCLAMATION.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_heir, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'claim QA: la réclamation a été refusée (%)', v_res;
  end if;
  if (v_res->>'member_id')::uuid <> v_lea then
    raise exception
      'claim QA: la réclamation rend le member_id % au lieu de % — elle a CRÉÉ '
      'une ligne au lieu d''en attacher une', v_res->>'member_id', v_lea;
  end if;

  -- 4. RIEN N'A ÉTÉ PERDU: même ligne, même prénom, même objectif, et le compte
  --    est posé. C'est l'assertion pour laquelle ce lot existe.
  select count(*) into v_rows
  from public.household_members hm
  where hm.member_id = v_lea
    and hm.user_id = v_heir
    and hm.first_name = 'Lea'
    and hm.goal = 'fat_loss'
    and hm.birth_date is not null;
  if v_rows <> 1 then
    raise exception
      'claim QA: la ligne réclamée a perdu quelque chose (prénom, objectif ou '
      'date) — la réclamation écrase au lieu d''attacher';
  end if;

  select first_name into v_txt from public.household_members where member_id = v_lea;
  if v_txt <> 'Lea' then
    raise exception
      'claim QA: le prénom est devenu « % » — profiles.full_name a écrasé la '
      'saisie du maître', v_txt;
  end if;

  select count(*) into v_rows
  from public.household_food_restrictions where member_id = v_lea;
  if v_rows <> 1 then
    raise exception 'claim QA: % règle(s) de maison après réclamation', v_rows;
  end if;
  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_lea;
  if v_rows <> 1 then
    raise exception 'claim QA: % allergie(s) après réclamation', v_rows;
  end if;

  -- 5. LE FOYER N'A PAS GRANDI. Une réclamation qui insère laisserait 3 lignes
  --    ici, et le générateur composerait une portion pour un fantôme.
  select count(*) into v_rows
  from public.household_members where household_id = v_house;
  if v_rows <> 2 then
    raise exception
      'claim QA: % bouches dans le foyer au lieu de 2 — la réclamation a créé '
      'une ligne', v_rows;
  end if;

  -- 6. NON REJOUABLE.
  v_res := public.keel_household_join(v_token);
  if (v_res->>'reason') <> 'already_used' then
    raise exception
      'claim QA: le jeton resert (%) — une réclamation faite est rejouable',
      coalesce(v_res->>'reason', '(succès)');
  end if;

  -- 7. ET LA PERSONNE POSE SON OBJECTIF, MAIS NE RESTREINT PAS.
  v_res := public.keel_household_set_member_goal(v_lea, 'health');
  if (v_res->>'ok')::boolean is not true then
    raise exception 'claim QA: le profil réclamé ne peut pas poser SON objectif (%)', v_res;
  end if;
  v_res := public.keel_household_add_restriction(v_lea, 'chips');
  if (v_res->>'reason') <> 'not_owner' then
    raise exception
      'claim QA: un profil réclamé a pu restreindre (%) — il gouverne le menu, '
      'ce que le modèle interdit', coalesce(v_res->>'reason', '(succès)');
  end if;

  raise notice
    'household_profile_claim: bouche réclamée sans rien perdre, jeton volé '
    'refusé, rejeu refusé, objectif posé, restriction refusée';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

-- Les claims posées par le contrôle sont annulées avec sa sous-transaction;
-- celle-ci est la ceinture, pour que rien de ce qui suit dans cette
-- transaction ne s'exécute sous une identité empruntée.
select set_config('request.jwt.claims', '', true);

commit;
