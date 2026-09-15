-- ============================================================================
-- LE FOYER — LA PORTE D'INSCRIPTION (chantier 4, décision D1)
--
-- Autorité: docs/keel/CHANTIER-FOYER-SUITE.md, « Chantier 4 ».
-- Amont: 20260810200000 (la réclamation), 20260811050000 (l'écrivain du palier
-- `household_member`), 20260804180000 (LE défaut que ce fichier ne rouvre pas).
--
-- ── CE QU'ON ROUVRE, ET CE QU'ON NE ROUVRE PAS ─────────────────────────────
--
-- L'inscription générique a été RETIRÉE de `/auth` (2026-08-05) parce qu'un
-- compte sans pays route vers la MAUVAISE HOTLINE DE CRISE: `profiles.country`
-- est lu EN PREMIER par le résolveur de ressources de crise, et son absence le
-- fait retomber sur la langue — `en-US` pour tout le monde. Un élève français
-- en détresse recevait un numéro américain, `fallbackUsed` à faux, et rien ne
-- le signalait. `Auth.tsx:37-62` porte le commentaire; la migration
-- `20260804180000` a fermé l'autre porte.
--
-- Ce fichier ouvre une TROISIÈME porte — « je rejoins un foyer » — et il ne
-- rouvre pas ce défaut, par DEUX gardes qui mordent à deux moments différents:
--
--   A. À LA CRÉATION DU COMPTE. `handle_new_user()` reconnaît une intention
--      neuve, `keel_signup_intent = 'household_member'`, et REFUSE le compte si
--      les métadonnées ne portent pas de pays bien formé (§2). Pas de compte
--      sans pays: le `raise` annule la transaction de signup.
--
--   B. À LA RÉCLAMATION. `keel_household_join` prend le pays en PARAMÈTRE
--      OBLIGATOIRE (§1) et refuse `country_required` quand le compte appelant
--      n'a pas de pays déclaré et n'en apporte pas. C'est la garde qui compte:
--      elle ferme aussi le contournement — créer un compte par une AUTRE porte,
--      sans pays, puis venir réclamer une place.
--
-- Deux gardes et pas une, parce que (A) protège la porte et (B) protège
-- l'INVARIANT: personne ne mange dans un foyer sans pays déclaré, quelle que
-- soit la porte par laquelle il est entré.
--
-- ── L'ANCIENNE ARITÉ EST DROPPÉE, ET C'EST LA MOITIÉ DE LA GARDE ───────────
--
-- En Postgres deux arités sont deux fonctions. Garder `keel_household_join(text)`
-- laisserait vivante, à côté de la porte gardée, une porte qui n'exige rien —
-- exactement ce que le lot 6 a refusé pour `keel_household_invite(text)`. Un
-- paramètre de garde OPTIONNEL est une garde désarmée; ici il n'y a pas de
-- défaut, pas de surcharge, et l'absence de la 1-arité est ASSERTÉE dans
-- `household_rls_test.sql`.
--
-- ── CE QUE CE FICHIER NE FAIT PAS, ET POURQUOI C'EST UNE DÉCISION ──────────
--
-- LA RÉCLAMATION NE SE FAIT PAS DANS LE TRIGGER DE SIGNUP. C'est le patron du
-- coach (`coach_invite_token` dans les métadonnées, consommé par
-- `handle_new_user`), et il serait ici une RÉGRESSION DE SÉCURITÉ mesurable:
-- `keel_household_preview_invitation` rend l'ADRESSE INVITÉE à qui détient le
-- jeton, donc un voleur de lien connaît l'adresse. Si la réclamation partait à
-- l'INSERT de `auth.users`, il lui suffirait de s'inscrire avec cette adresse
-- — sans jamais ouvrir la boîte mail — pour rafler la place. La garde d'adresse
-- (`email_mismatch`) ne vaut que parce que la réclamation EXIGE UNE SESSION,
-- c'est-à-dire une adresse confirmée.
--
-- ⚠️ CONSÉQUENCE À CONNAÎTRE: cette garde vaut ce que vaut la confirmation
-- d'e-mail du projet. `supabase/config.toml` porte `enable_confirmations =
-- false` en LOCAL: là, un jeton volé + une inscription à l'adresse invitée
-- donnent une session immédiate. C'est un réglage d'auth, pas du code, et il ne
-- se change pas depuis une migration — il est nommé ici pour que la dépendance
-- soit lisible.
--
-- LE RÔLE N'EST PAS ÉCRIT. `profiles.keel_role` reste NULL: `student` ouvre
-- `/app/today`, `/app/chat` et `/app/progress`, trois écrans vides pour qui n'a
-- ni coach ni plan. Le palier `household_member`, lui, s'écrit tout seul — le
-- trigger `on_household_members_change_recompute_access` (20260811050000 §4b)
-- part sur l'`update` de `user_id` que fait la réclamation.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. RÉCLAMER, EN DÉCLARANT SON PAYS
-- ---------------------------------------------------------------------------

drop function if exists public.keel_household_join(text);

create or replace function public.keel_household_join(
  p_token text,
  p_country text
)
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
  v_declared text;
  v_country text;
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
exception
  -- LE FILET DE `household_members_one_per_user`. Le test plus haut le couvre
  -- en pratique; cette branche couvre la fenêtre entre le test et l'UPDATE, et
  -- surtout elle garantit qu'un compte déjà logé ne produit JAMAIS un 500 sur
  -- ce chemin.
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
end;
$function$;

comment on function public.keel_household_join(text, text) is
  'RÉCLAME UN PROFIL: attache le compte appelant à une ligne de foyer qui '
  'existe déjà, EN EXIGEANT UN PAYS. `member_id` ne change pas, `user_id` '
  'passe de NULL à une valeur, et portions, contraintes, allergies et objectif '
  'restent attachés. Le pays est OBLIGATOIRE (country_required) quand le '
  'compte n''en a pas: sans lui, le résolveur de crise le déduit de la langue '
  '— le défaut fermé par 20260804180000. Un pays DÉJÀ déclaré n''est jamais '
  'écrasé. Ne crée AUCUNE ligne, n''écrase NI le prénom NI la date. Ce que la '
  'réclamation donne: lire le foyer, et poser SON objectif. Rien d''autre — '
  'composer, ajouter, retirer et restreindre restent au compte maître.';

-- LES PRIVILÈGES, REPOSÉS: une fonction NEUVE (nouvelle arité = nouvelle
-- fonction) est exécutable par tout le monde par défaut, et `revoke from
-- public` NE RETIRE PAS `anon`. Les deux cicatrices, rejouées.
revoke all on function public.keel_household_join(text, text) from public, anon;
grant execute on function public.keel_household_join(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. LA PORTE — `handle_new_user()` RECONNAÎT L'INTENTION « foyer »
-- ---------------------------------------------------------------------------
--
-- Corps repris à l'identique de `20260805091000` (vérifié contre `prosrc` en
-- base avant réécriture), plus UN bloc à la fin. Rien d'autre ne bouge: ce
-- trigger est le chemin de TOUTE inscription du produit.
--
-- ── POURQUOI CE BLOC LÈVE, ALORS QUE LES DEUX AUTRES AVALENT ──────────────
--
-- Les blocs « invitation coach » et « inscription libre » sont best-effort par
-- décision écrite: un rattachement raté ne doit pas coûter le compte, et il est
-- RÉPARABLE (la RPC idempotente rejouée à la première session).
--
-- Ici il n'y a rien à réparer et tout à perdre. Un compte de foyer créé sans
-- pays est exactement l'état que `20260804180000` a fermé; le laisser naître
-- pour le corriger plus tard, c'est parier sur une réparation que personne ne
-- déclenche. Et le coût du refus est nul: la personne recommence son formulaire
-- avec un pays, elle n'a rien perdu — il n'existe aucun lien à recréer.
--
-- `keel_signup_intent = 'household_member'` est un littéral NEUF: aucun autre
-- producteur ne l'émet, donc ce bloc ne peut pas mordre une inscription
-- existante. Le seul écrivain est `keel/api/householdSignup.ts`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_phone text;
  v_existing_profile_id uuid;
  v_timezone text;
  v_locale text;
  v_tz_follow_device boolean;
  v_coach_invite_token text;
  v_signup_intent text;
  v_country text;
  v_house_coach_id uuid;
begin
  v_phone := nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), '');
  v_timezone := nullif(coalesce(new.raw_user_meta_data->>'timezone', ''), '');
  v_locale := coalesce(nullif(coalesce(new.raw_user_meta_data->>'locale', ''), ''), 'fr-FR');
  v_tz_follow_device := lower(coalesce(new.raw_user_meta_data->>'tz_follow_device', '')) in
    ('t', 'true', '1', 'yes', 'y', 'on');

  -- ── LA GARDE ANTI-COLLISION, AMPUTÉE DE SA MOITIÉ MORTE ─────────────────
  --
  -- Elle refusait une inscription si le numéro appartenait à un compte avec
  -- `phone_verified_at` non nul OU `whatsapp_opted_in = true`. Depuis le pivot
  -- de-whatsapp, plus AUCUN chemin ne passe `whatsapp_opted_in` à true: la
  -- colonne est gelée à false, donc ce second terme ne pouvait plus jamais être
  -- vrai. Une condition qui ne peut pas mordre se lit comme une protection et
  -- n'en est pas une.
  --
  -- Le premier terme RESTE ARMÉ, et ce n'est pas de la prudence de façade: des
  -- lignes legacy portent de vrais `phone_verified_at`, et cette garde est la
  -- défense en profondeur derrière un formulaire contourné. Le formulaire, lui,
  -- ne demande plus de numéro sur aucun chemin (Auth.tsx, 2026-08-05) — donc
  -- `v_phone` est NULL en pratique et ce bloc ne s'exécute plus. Il est gardé
  -- pour les imports et pour tout appelant qui poserait un numéro demain.
  if v_phone is not null then
    select p.id into v_existing_profile_id
    from public.profiles p
    where p.phone_number = v_phone
      and p.id <> new.id
      and p.phone_verified_at is not null
    limit 1;

    if v_existing_profile_id is not null then
      raise exception 'Ce numéro de téléphone est déjà utilisé par un autre compte.'
        using errcode = 'unique_violation';
    end if;
  end if;

  insert into public.profiles (
    id, full_name, avatar_url, phone_number, email, timezone, locale, tz_follow_device
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    v_phone,
    new.email,
    v_timezone,
    v_locale,
    v_tz_follow_device
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    phone_number = excluded.phone_number,
    email = excluded.email,
    timezone = coalesce(public.profiles.timezone, excluded.timezone),
    locale = coalesce(public.profiles.locale, excluded.locale),
    updated_at = now();

  -- PIVOT: le bloc `referral_code` a été supprimé avec le programme de
  -- parrainage. Un `referral_code` encore présent dans les metadata est ignoré
  -- en silence, ce qui est le comportement voulu.

  -- KEEL W6.5 — invitation coach portée par les metadata du signup.
  -- Best-effort, jamais fatal: une invitation cassée ne doit jamais casser une
  -- inscription. Le compte existe dans tous les cas, et l'élève peut encore
  -- accepter depuis /join.
  v_coach_invite_token := nullif(trim(coalesce(new.raw_user_meta_data->>'coach_invite_token', '')), '');
  if v_coach_invite_token is not null then
    begin
      perform public.accept_coach_invitation_for_user(new.id, v_coach_invite_token);
    exception when others then
      raise warning 'coach invitation acceptance failed for user %: %', new.id, sqlerrm;
    end;
  end if;

  v_signup_intent := nullif(trim(coalesce(new.raw_user_meta_data->>'keel_signup_intent', '')), '');

  -- ── L'INSCRIPTION LIBRE ─────────────────────────────────────────────────
  --
  -- Même forme et même garantie que le bloc d'invitation au-dessus, et pour la
  -- même raison: le rattachement se fait DANS la transaction du signup, donc il
  -- est déjà fait quand l'élève ouvre son mail de confirmation — c'est la
  -- remarque de JoinPage.tsx, le trigger part à l'INSERT de l'utilisateur auth,
  -- pas à l'ouverture de la boîte.
  --
  -- Et il est best-effort, donc RÉPARABLE et pas silencieux: le client rejoue
  -- `keel_join_house_coach()` à la première session authentifiée, qui est
  -- idempotente. C'est l'arbitrage inverse d'un `raise`: un échec de
  -- rattachement coûte une réparation, un `raise` coûterait le compte.
  --
  -- `v_country` vient des metadata et n'est PAS deviné. S'il manque, le moteur
  -- lève et le rattachement échoue: mieux vaut un compte à réparer qu'un élève
  -- dont la hotline de crise est déduite de sa langue.
  if v_signup_intent = 'student_free' and v_coach_invite_token is null then
    begin
      v_country := nullif(trim(coalesce(new.raw_user_meta_data->>'country', '')), '');
      if v_country is null then
        -- Même refus que `keel_join_house_coach`, et pour la même raison: pas de
        -- pays déclaré, pas de rattachement. Le compte est créé, la réparation
        -- passe par la porte libre qui redemandera le pays.
        raise exception 'free signup without a declared country';
      end if;
      select c.id into v_house_coach_id
        from public.coaches c
       where c.coach_kind = 'house' and c.status = 'active';
      if v_house_coach_id is null then
        raise exception 'no active house coach';
      end if;
      perform public.keel_attach_student_to_coach(
        new.id, v_house_coach_id, new.email, v_country
      );
    exception when others then
      raise warning 'free signup attachment failed for user %: %', new.id, sqlerrm;
    end;
  end if;

  -- ── LA PORTE FOYER (chantier 4) ─────────────────────────────────────────
  --
  -- PAS de `begin ... exception when others`, et c'est la différence portante
  -- avec les deux blocs au-dessus: ici le refus est le comportement voulu.
  -- Sans pays, PAS DE COMPTE — le `raise` annule la transaction de signup.
  --
  -- Aucun rattachement n'est fait ici: la réclamation exige une SESSION (voir
  -- l'en-tête). Ce bloc ne pose QUE le pays, pour que le compte naisse avec —
  -- même si la personne n'ouvre jamais son lien.
  if v_signup_intent = 'household_member' then
    v_country := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'country', '')), ''));
    if v_country is null or v_country !~ '^[A-Z]{2}$' then
      raise exception
        'household signup without a declared country (keel_signup_intent=household_member)'
        using errcode = '22023';
    end if;
    -- `country is null` comme partout: la ligne vient d'être insérée, mais un
    -- `on conflict do update` a pu retomber sur un profil préexistant, et une
    -- déclaration antérieure ne s'écrase pas.
    update public.profiles
       set country = v_country,
           updated_at = now()
     where id = new.id
       and country is null;
  end if;

  return new;
end;
$function$;

comment on function public.handle_new_user() is
  'Le trigger de TOUTE inscription. Crée le profil, rejoue une invitation '
  'coach portée par les metadata, rattache un inscrit libre au coach maison — '
  'ces deux-là best-effort — et, pour l''intention `household_member` '
  '(chantier 4), POSE LE PAYS ou REFUSE le compte. Ce dernier bloc lève '
  'exprès: un compte de foyer sans pays est le défaut de hotline fermé par '
  '20260804180000, et il n''y a rien à réparer plus tard.';

-- ---------------------------------------------------------------------------
-- 3. CONTRÔLE FINAL — ON REJOUE LA PORTE EN ENTIER
-- ---------------------------------------------------------------------------
--
-- Inspecter le catalogue prouverait que la signature a changé, pas qu'un compte
-- sans pays est refusé. On monte un foyer, deux bouches, et on joue les six
-- cas qui décident: pays absent, pays malformé, jeton volé, réclamation
-- nominale, pays écrit en base, pays déjà déclaré non écrasé.
--
-- ⚠️ QUATRE COMPTES SONT CRÉÉS DANS `auth.users`, puis ANNULÉS. Le bloc entier
-- est une sous-transaction qui se termine par un `raise` attrapé: rien de ce
-- qu'il écrit ne survit. C'est le prix d'un contrôle qui exerce `auth.uid()`.

do $$
declare
  v_owner uuid := 'c1a20000-0000-0000-0000-000000000001';
  v_heir  uuid := 'c1a20000-0000-0000-0000-000000000002';
  v_thief uuid := 'c1a20000-0000-0000-0000-000000000003';
  v_kept  uuid := 'c1a20000-0000-0000-0000-000000000004';
  v_lea uuid;
  v_max uuid;
  v_res jsonb;
  v_token text;
  v_token2 text;
  v_txt text;
  v_rows int;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (v_owner, '__qa_door_owner@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_heir, '__qa_door_heir@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_thief, '__qa_door_thief@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_kept, '__qa_door_kept@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  -- Ce compte-ci a DÉJÀ déclaré son pays: on vérifiera qu'une réclamation ne
  -- l'écrase pas.
  update public.profiles set country = 'GB' where id = v_kept;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_res := public.keel_household_create('__qa_door__');
  if (v_res->>'ok')::boolean is not true then
    raise exception 'porte QA: création du foyer refusée (%)', v_res;
  end if;

  v_res := public.keel_household_add_member(
    'Lea', (current_date - interval '30 years')::date, 'fat_loss');
  v_lea := (v_res->>'member_id')::uuid;
  v_res := public.keel_household_add_member(
    'Max', (current_date - interval '32 years')::date, 'health');
  v_max := (v_res->>'member_id')::uuid;

  v_res := public.keel_household_invite('__qa_door_heir@example.invalid', v_lea);
  v_token := v_res->>'token';
  v_res := public.keel_household_invite('__qa_door_kept@example.invalid', v_max);
  v_token2 := v_res->>'token';

  -- 1. SANS PAYS, PAS DE PLACE. C'est l'assertion pour laquelle ce lot existe.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_heir, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token, '');
  if (v_res->>'reason') <> 'country_required' then
    raise exception
      'porte QA: une réclamation SANS PAYS rend « % » — la garde de hotline '
      'est désarmée', coalesce(v_res->>'reason', '(succès)');
  end if;

  -- 2. UN PAYS MALFORMÉ NE PASSE PAS POUR UN PAYS. `FRA`, `f`, `12` viennent
  --    d'un client contourné; les accepter écrirait n'importe quoi dans la
  --    colonne que le résolveur de crise lit EN PREMIER.
  v_res := public.keel_household_join(v_token, 'FRA');
  if (v_res->>'reason') <> 'bad_country' then
    raise exception
      'porte QA: le pays « FRA » rend « % » et non bad_country',
      coalesce(v_res->>'reason', '(succès)');
  end if;

  -- 3. ET RIEN N'A ÉTÉ ÉCRIT PAR CES DEUX REFUS.
  select country into v_txt from public.profiles where id = v_heir;
  if v_txt is not null then
    raise exception
      'porte QA: un refus a quand même écrit le pays (%) — une tentative '
      'ratée laisse une trace sur le profil', v_txt;
  end if;

  -- 4. LE JETON VOLÉ NE SERT TOUJOURS À PERSONNE D'AUTRE, pays valide compris.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_thief, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token, 'FR');
  if (v_res->>'reason') <> 'email_mismatch' then
    raise exception
      'porte QA: un jeton volé rend « % » et non email_mismatch — la garde '
      'd''adresse ne mord plus', coalesce(v_res->>'reason', '(succès)');
  end if;
  select country into v_txt from public.profiles where id = v_thief;
  if v_txt is not null then
    raise exception
      'porte QA: le voleur est reparti avec un pays écrit (%) — un refus ne '
      'doit rien écrire', v_txt;
  end if;

  -- 5. LA RÉCLAMATION NOMINALE: elle passe, et le pays est EN BASE.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_heir, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token, 'fr');
  if (v_res->>'ok')::boolean is not true then
    raise exception 'porte QA: la réclamation avec pays a été refusée (%)', v_res;
  end if;
  select country into v_txt from public.profiles where id = v_heir;
  if v_txt <> 'FR' then
    raise exception
      'porte QA: le pays en base vaut « % » et non FR — la normalisation en '
      'majuscules ou l''écriture elle-même manque', coalesce(v_txt, '(null)');
  end if;
  if (v_res->>'member_id')::uuid <> v_lea then
    raise exception 'porte QA: la réclamation a CRÉÉ une ligne au lieu d''attacher';
  end if;

  -- 6. LE PALIER, ET C'EST LA PREUVE D'ACCEPTATION N°2. Personne ne l'écrit
  --    ici: le trigger de 20260811050000 §4b part sur l'`update` de `user_id`.
  select access_tier into v_txt from public.profiles where id = v_heir;
  if v_txt <> 'household_member' then
    raise exception
      'porte QA: le profil réclamé porte le palier « % » et non '
      'household_member — le fil du chantier 3 n''est pas branché sur cette '
      'porte', coalesce(v_txt, '(null)');
  end if;

  -- 7. LE RÔLE N'A PAS ÉTÉ ÉCRIT. `student` ouvrirait trois écrans vides.
  select keel_role into v_txt from public.profiles where id = v_heir;
  if v_txt is not null then
    raise exception
      'porte QA: la réclamation a écrit keel_role = « % » — elle décrit une '
      'relation de coaching qui n''existe pas', v_txt;
  end if;

  -- 8. UN PAYS DÉJÀ DÉCLARÉ N'EST JAMAIS ÉCRASÉ.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_kept, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token2, 'FR');
  if (v_res->>'ok')::boolean is not true then
    raise exception 'porte QA: la réclamation du compte déjà situé a été refusée (%)', v_res;
  end if;
  select country into v_txt from public.profiles where id = v_kept;
  if v_txt <> 'GB' then
    raise exception
      'porte QA: le pays déclaré GB est devenu « % » — une porte a écrasé la '
      'déclaration de la personne', coalesce(v_txt, '(null)');
  end if;

  -- 9. ET LA 1-ARITÉ N'EXISTE PLUS. Deux arités sont deux fonctions: la
  --    laisser vivante garderait une porte qui n'exige aucun pays.
  select count(*) into v_rows
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'keel_household_join'
    and pg_get_function_identity_arguments(p.oid) = 'text';
  if v_rows <> 0 then
    raise exception
      'porte QA: keel_household_join(text) existe encore — la porte sans pays '
      'est restée ouverte à côté de la porte gardée';
  end if;

  raise notice
    'household_signup_door: sans pays refusé, malformé refusé, vol refusé, '
    'réclamation OK avec pays en base, palier household_member, rôle NULL, '
    'pays déclaré préservé, 1-arité absente';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 4. LE TRIGGER DE SIGNUP, EXERCÉ POUR DE VRAI
-- ---------------------------------------------------------------------------
--
-- Le bloc ci-dessus prouve la garde de RÉCLAMATION. Celui-ci prouve la garde de
-- CRÉATION DE COMPTE, et il ne peut pas être fusionné avec l'autre: on y teste
-- qu'un INSERT dans `auth.users` ÉCHOUE, donc la sous-transaction qui le porte
-- doit être à elle seule.

do $$
declare
  v_id uuid := 'c1a20000-0000-0000-0000-00000000000a';
  v_raised boolean := false;
  v_txt text;
begin
  -- SANS PAYS: le compte n'est pas créé.
  begin
    insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
    values (v_id, '__qa_door_nocountry@example.invalid',
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      jsonb_build_object('keel_signup_intent', 'household_member',
                         'locale', 'en-US'));
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception
      'porte QA: une inscription foyer SANS PAYS a créé un compte — « sans '
      'pays, pas de compte » n''est pas vrai';
  end if;

  -- AVEC UN PAYS: le compte naît, et il naît AVEC son pays.
  insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
  values (v_id, '__qa_door_country@example.invalid',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    jsonb_build_object('keel_signup_intent', 'household_member',
                       'locale', 'en-US', 'country', 'fr'));
  select country into v_txt from public.profiles where id = v_id;
  if v_txt <> 'FR' then
    raise exception
      'porte QA: le compte est né avec country = « % » au lieu de FR',
      coalesce(v_txt, '(null)');
  end if;
  -- ET IL N'EST L'ÉLÈVE DE PERSONNE: aucun rôle, aucun lien coach.
  select keel_role into v_txt from public.profiles where id = v_id;
  if v_txt is not null then
    raise exception 'porte QA: la porte foyer a écrit keel_role = « % »', v_txt;
  end if;

  raise notice
    'household_signup_door: signup sans pays REFUSÉ, signup avec pays né avec '
    'country=FR et sans keel_role';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
