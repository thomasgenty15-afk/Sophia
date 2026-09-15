-- ============================================================================
-- L'INSCRIPTION LIBRE — un seul moteur de rattachement, deux portes
--
-- LE PIÈGE QU'ON REFUSE D'OUVRIR
-- ------------------------------
-- La tentation était d'écrire un second chemin « inscription libre » à côté de
-- `accept_coach_invitation_for_user`. Les deux auraient dû poser exactement les
-- mêmes quatre faits — lien `coach_clients`, `keel_role`, `locale`, `country` —
-- et la migration `20260804180000` vient précisément de corriger l'un de ces
-- faits (le pays) parce qu'UN chemin sur deux l'oubliait. Le défaut qu'elle a
-- fermé, un élève britannique servi par la hotline française, a coûté une
-- session de QA à trouver et n'était visible d'aucun test.
--
-- Donc: l'effet est EXTRAIT dans `keel_attach_student_to_coach()`, et les deux
-- portes l'appellent. L'invitation garde ses validations (jeton, expiration,
-- révocation, coach actif, auto-invitation) — c'est sa spécificité. Ce qu'elle
-- ÉCRIT n'est plus à elle.
--
-- LE PAYS, ET C'EST LA PREMIÈRE CHOSE QUE CE FICHIER GARANTIT
-- ----------------------------------------------------------
-- Le numéro de téléphone servait à déduire le pays, le pays décide de la
-- hotline. §2 de la mission: « Toute nouvelle porte d'entrée que tu ouvres doit
-- écrire profiles.country au même endroit et de la même façon. »
--
-- « Au même endroit » est maintenant littéral: un seul `update public.profiles
-- set country = ...` existe dans les deux chemins, dans le moteur, ligne unique.
-- Une porte future qui oublierait le pays devrait pour cela NE PAS appeler le
-- moteur — c'est-à-dire ne pas créer de lien coach, c'est-à-dire ne pas
-- fonctionner. Le défaut n'est plus possible par omission.
--
-- Et le pays d'un inscrit libre est DÉCLARÉ par lui, jamais dérivé: le coach
-- maison n'exerce dans aucun pays, et dériver de la langue est exactement
-- l'erreur (`country is not a language`) que ce dépôt s'est interdite.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. LE MOTEUR — tout ce qu'être rattaché à un coach veut dire
-- ---------------------------------------------------------------------------

create or replace function public.keel_attach_student_to_coach(
  p_user_id uuid,
  p_coach_id uuid,
  p_invited_email text default null,
  p_country text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_link_id uuid;
  v_link_coach uuid;
  v_target_kind text;
  v_incumbent_kind text;
  v_country text;
begin
  if p_user_id is null or p_coach_id is null then
    raise exception 'keel_attach_student_to_coach: missing user or coach'
      using errcode = '22023';
  end if;

  select c.coach_kind into v_target_kind
    from public.coaches c where c.id = p_coach_id;
  if v_target_kind is null then
    raise exception 'keel_attach_student_to_coach: unknown coach %', p_coach_id
      using errcode = '22023';
  end if;

  -- LE PAYS, VALIDÉ ICI ET PAS TROIS COUCHES PLUS LOIN (R7).
  --
  -- Une valeur non vide et malformée RAISE. Elle ne peut venir que d'un client
  -- contourné — nos deux formulaires n'offrent qu'un sélecteur fermé — et
  -- écrire NULL en silence à sa place, c'est reconstituer exactement l'état
  -- (`country IS NULL`) dont le résolveur de crise déduit un pays depuis la
  -- langue. NULL est acceptable quand rien n'est déclaré; NULL en RÉPARATION
  -- d'une saisie invalide est un mensonge sur ce qu'on sait de la personne.
  v_country := nullif(btrim(coalesce(p_country, '')), '');
  if v_country is not null then
    v_country := upper(v_country);
    if v_country !~ '^[A-Z]{2}$' then
      raise exception 'keel_attach_student_to_coach: malformed country %', p_country
        using errcode = '22023';
    end if;
  end if;

  -- Le lien VIVANT de cet élève, verrouillé: deux onglets qui rejoignent en
  -- même temps se sérialisent ici au lieu de courir sur l'index unique.
  select cc.id, cc.coach_id into v_link_id, v_link_coach
    from public.coach_clients cc
   where cc.student_user_id = p_user_id
     and cc.status in ('invited', 'active')
   limit 1
     for update;

  if v_link_id is not null and v_link_coach <> p_coach_id then
    select c.coach_kind into v_incumbent_kind
      from public.coaches c where c.id = v_link_coach;

    -- ── LE PASSAGE DU COACH MAISON À UN VRAI COACH ──────────────────────
    --
    -- Un testeur ou un curieux finira par être invité par un vrai coach. Sans
    -- ce bloc, il reçoit `already_coached` et se voit dire qu'il « suit déjà le
    -- programme d'un autre coach » — c'est-à-dire nous, avec un programme de
    -- découverte, ce qui est incompréhensible pour lui et bloquant pour le
    -- coach qui l'a invité.
    --
    -- Le lien maison est CLOS, jamais laissé vivant à côté. `.limit(1)` sur les
    -- liens actifs dans `generate-week-plan-v1:123` et dans
    -- `loadPublishedDoctrine` rendrait sinon le choix du coach ARBITRAIRE et
    -- SILENCIEUX: l'élève pourrait recevoir la semaine de son vrai coach et la
    -- doctrine de la maison, ou l'inverse, d'un appel à l'autre.
    --
    -- CONDITION DE DÉSARMEMENT: uniquement maison → humain. Deux coachs humains
    -- restent un refus (`already_coached`): un élève ne change pas de vrai coach
    -- par une invitation, il passe par `revoke_coach_access()`. Et l'inverse —
    -- la maison qui déplacerait un vrai coach — n'est pas atteignable ici, car
    -- la porte libre n'appelle ce moteur que sur un élève sans lien vivant.
    if v_incumbent_kind = 'house' and v_target_kind = 'human' then
      update public.coach_clients
         set status = 'ended',
             ended_at = now(),
             updated_at = now()
       where id = v_link_id;
      v_link_id := null;
    else
      return 'already_coached';
    end if;
  end if;

  begin
    if v_link_id is not null then
      -- Même coach, déjà vivant: ré-acceptation idempotente.
      update public.coach_clients
         set status = 'active',
             consent_granted_at = coalesce(consent_granted_at, now()),
             started_at = coalesce(started_at, now()),
             ended_at = null,
             updated_at = now()
       where id = v_link_id;
    else
      -- Un lien en pause ou terminé avec CE coach est repris plutôt que
      -- dupliqué: l'audit et l'historique de facturation de la période
      -- précédente restent attachés à une seule ligne.
      select cc.id into v_link_id
        from public.coach_clients cc
       where cc.student_user_id = p_user_id
         and cc.coach_id = p_coach_id
         and cc.status in ('paused', 'ended')
       order by cc.updated_at desc
       limit 1
         for update;

      if v_link_id is not null then
        update public.coach_clients
           set status = 'active',
               consent_granted_at = now(),
               -- `started_at` NE BOUGE PAS sur une reprise: c'est le plancher
               -- d'historique que le coach est en droit de lire (voir la
               -- migration 20260805092000). Le remettre à now() effacerait des
               -- semaines qu'il a bel et bien encadrées.
               started_at = coalesce(started_at, now()),
               ended_at = null,
               updated_at = now()
         where id = v_link_id;
      else
        insert into public.coach_clients
          (coach_id, student_user_id, invited_email, status,
           consent_granted_at, started_at, seat_state)
        values
          (p_coach_id, p_user_id, lower(nullif(btrim(coalesce(p_invited_email, '')), '')),
           'active', now(), now(),
           -- Un siège maison est marqué 'free' dès l'écriture. Ce n'est PAS ce
           -- qui l'exclut de la facturation — `keel_coach_seat_ledger` le fait
           -- sur `coach_kind`, donc sans dépendre de cette colonne — mais un
           -- siège gratuit qui s'affiche 'trial' sur un écran est une ligne qui
           -- se lit comme un essai qui va expirer.
           case when v_target_kind = 'house' then 'free' else 'trial' end)
        returning id into v_link_id;
      end if;
    end if;
  exception when unique_violation then
    -- `one_live_coach_per_student` a mordu: un autre coach a gagné la course
    -- entre notre SELECT et cette écriture. Même réponse que le test explicite.
    return 'already_coached';
  end;

  -- Le garde de route de l'app élève lit `profiles.keel_role`. Devenir élève
  -- d'un coach est ce qui fait de quelqu'un un élève, donc le rôle est posé
  -- ici — mais seulement s'il est vide: on ne rétrograde jamais un coach qui
  -- aurait accepté l'invitation d'un pair sur son propre compte.
  --
  -- `locale` part de la MÊME condition, délibérément: on n'écrit la langue du
  -- produit que sur quelqu'un qui DEVIENT élève ici.
  update public.profiles
     set keel_role = 'student',
         locale = 'en-US',
         updated_at = now()
   where id = p_user_id
     and keel_role is null;

  -- LE PAYS. Séparément et sans condition de rôle: un élève déjà lié qui
  -- ré-accepte doit lui aussi sortir d'ici avec un pays. `country is null` est
  -- la seule garde — une déclaration de l'élève ne se fait jamais écraser.
  if v_country is not null then
    update public.profiles
       set country = v_country,
           updated_at = now()
     where id = p_user_id
       and country is null;
  end if;

  return 'attached';
end;
$function$;

comment on function public.keel_attach_student_to_coach(uuid, uuid, text, text) is
  'LE moteur de rattachement élève→coach: lien coach_clients, keel_role, '
  'locale du produit, et pays. Les deux portes (invitation, inscription libre) '
  'l''appellent — c''est ce qui rend impossible qu''une porte oublie le pays, '
  'donc qu''un élève reçoive la hotline d''un autre pays. Clôt le lien au coach '
  'maison quand un VRAI coach prend la suite; refuse tout autre changement de '
  'coach (already_coached).';

revoke all on function public.keel_attach_student_to_coach(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.keel_attach_student_to_coach(uuid, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. L'INVITATION — mêmes validations, l'effet délégué au moteur
-- ---------------------------------------------------------------------------

create or replace function public.accept_coach_invitation_for_user(
  p_user_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
  v_invitation_id uuid;
  v_coach_id uuid;
  v_coach_user_id uuid;
  v_coach_status text;
  v_coach_name text;
  v_coach_country text;
  v_status text;
  v_expires_at timestamptz;
  v_email text;
  v_outcome text;
begin
  if p_user_id is null then
    raise exception 'accept_coach_invitation: no user' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,200}$' then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;

  v_hash := public.coach_invite_token_hash(p_token);

  -- FOR UPDATE: la ligne d'invitation est le mutex de toute l'opération. Deux
  -- onglets qui cliquent « Accepter » se sérialisent ici.
  select i.id, i.coach_id, i.status, i.expires_at, lower(i.email),
         c.user_id, c.status,
         coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(p.full_name), '')),
         p.country
    into v_invitation_id, v_coach_id, v_status, v_expires_at, v_email,
         v_coach_user_id, v_coach_status, v_coach_name,
         v_coach_country
    from public.coach_invitations i
    join public.coaches c on c.id = i.coach_id
    left join public.profiles p on p.id = c.user_id
   where i.invite_token_hash = v_hash
     for update of i;

  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;
  if v_status = 'revoked' then
    return jsonb_build_object('accepted', false, 'reason', 'revoked');
  end if;
  if v_status = 'accepted' then
    return jsonb_build_object('accepted', false, 'reason', 'already_accepted');
  end if;
  if v_status = 'expired' or v_expires_at <= now() then
    -- Brûlée pendant qu'on tient le verrou: une invitation expirée cesse d'être
    -- 'pending' la première fois que quelqu'un la regarde, donc l'écran du
    -- coach dit la vérité sans job de balayage.
    update public.coach_invitations set status = 'expired' where id = v_invitation_id;
    return jsonb_build_object('accepted', false, 'reason', 'expired');
  end if;
  if v_coach_status <> 'active' then
    return jsonb_build_object('accepted', false, 'reason', 'coach_unavailable');
  end if;
  if v_coach_user_id = p_user_id then
    return jsonb_build_object('accepted', false, 'reason', 'self_invitation');
  end if;

  -- L'EFFET, délégué. Le pays passé est celui DÉCLARÉ par le coach (sélecteur à
  -- son inscription, en sachant qu'il sert aux ressources de crise): un défaut
  -- hérité d'une déclaration vaut mieux qu'un pays dérivé d'une langue que
  -- personne n'a choisie. Il reste écrasable par la déclaration de l'élève.
  v_outcome := public.keel_attach_student_to_coach(
    p_user_id, v_coach_id, v_email, v_coach_country
  );
  if v_outcome <> 'attached' then
    return jsonb_build_object('accepted', false, 'reason', v_outcome);
  end if;

  update public.coach_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_invitation_id;

  return jsonb_build_object(
    'accepted', true,
    'coach_first_name', nullif(split_part(coalesce(v_coach_name, ''), ' ', 1), '')
  );
end;
$function$;

comment on function public.accept_coach_invitation_for_user(uuid, text) is
  'Accepte une invitation coach: valide le jeton (expiration, révocation, coach '
  'actif, auto-invitation) puis délègue TOUT l''effet à '
  'keel_attach_student_to_coach() — un seul endroit écrit le lien, keel_role, la '
  'langue et le pays, pour les deux portes d''entrée du produit.';

revoke all on function public.accept_coach_invitation_for_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.accept_coach_invitation_for_user(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. LA PORTE LIBRE
-- ---------------------------------------------------------------------------

-- Le coach maison est-il en état d'accueillir quelqu'un ?
--
-- Appelable par `anon`, et c'est le but: la page d'inscription libre la lit
-- AVANT d'afficher son formulaire. Sans ça, on crée un compte, puis on découvre
-- que le générateur rend `coach_has_no_doctrine` — et le testeur juge un produit
-- cassé alors que c'est notre coach maison qui n'est pas publié.
--
-- Ne fuit rien: un booléen sur l'état de NOTRE propre programme.
create or replace function public.keel_free_signup_available()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.coaches c
    join public.coach_doctrines d on d.coach_id = c.id and d.published_at is not null
    where c.coach_kind = 'house'
      and c.status = 'active'
      -- La doctrine doit être publiée ET non vide: `generate-week-plan-v1`
      -- refuse sur `beliefs` vide, pas sur `published_at`. Une doctrine publiée
      -- à blanc rendrait cette fonction vraie et le produit inutilisable —
      -- exactement le genre de garde qu'on croit sur parole.
      and jsonb_array_length(coalesce(d.beliefs, '[]'::jsonb)) > 0
  );
$function$;

comment on function public.keel_free_signup_available() is
  'Le coach maison existe-t-il, actif, avec une doctrine publiée NON VIDE ? '
  'Lue par la page d''inscription libre avant d''afficher son formulaire: sans '
  'elle on crée des comptes qui rencontrent un 409 coach_has_no_doctrine.';

grant execute on function public.keel_free_signup_available() to anon, authenticated, service_role;

-- Rattacher le CALLER au coach maison. Idempotent.
--
-- ── POURQUOI LE PAYS EST OBLIGATOIRE ICI ──────────────────────────────────
-- C'est la contrepartie de la fin du téléphone. Le numéro donnait le pays; il
-- n'y a plus de numéro, et le coach maison n'a pas de pays à léguer. Si cette
-- fonction acceptait un pays vide, tout inscrit libre sortirait avec
-- `country IS NULL` — et le résolveur de crise le déduirait de `locale`, qui
-- vaut 'en-US' pour tout le monde. Un inscrit libre britannique en détresse
-- recevrait un numéro américain, `fallbackUsed` à faux, et rien ne le
-- signalerait. C'est le défaut que `20260804180000` vient de fermer sur l'autre
-- porte; on ne le rouvre pas sur celle-ci.
create or replace function public.keel_join_house_coach(p_country text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_coach_id uuid;
  v_email text;
  v_outcome text;
begin
  if v_user is null then
    raise exception 'keel_join_house_coach: no authenticated user'
      using errcode = '42501';
  end if;

  -- LE PAYS EST EXIGÉ ICI, PAS DANS LE MOTEUR, et la distinction est réelle.
  --
  -- Le moteur accepte un pays absent parce que le chemin d'invitation en a
  -- légitimement un: un coach dont `profiles.country` est NULL invite quand même
  -- son élève, et refuser reviendrait à casser l'invitation pour une donnée que
  -- l'élève n'a pas saisie. Là, personne n'a de pays à léguer — le coach maison
  -- n'exerce nulle part — donc l'absence n'est pas un défaut hérité, c'est un
  -- élève sans pays du tout. On refuse à la porte.
  if nullif(btrim(coalesce(p_country, '')), '') is null then
    return jsonb_build_object('joined', false, 'reason', 'country_required');
  end if;

  -- Un COACH ne devient pas son propre élève. Son espace est /coach, et un lien
  -- `coach_clients` sur son propre compte lui donnerait un `access_tier`
  -- 'student' hérité et une place dans son propre registre de sièges.
  if exists (select 1 from public.coaches c where c.user_id = v_user) then
    return jsonb_build_object('joined', false, 'reason', 'caller_is_coach');
  end if;

  select c.id into v_coach_id
    from public.coaches c
   where c.coach_kind = 'house'
     and c.status = 'active';
  if v_coach_id is null then
    return jsonb_build_object('joined', false, 'reason', 'house_coach_unavailable');
  end if;
  if not public.keel_free_signup_available() then
    return jsonb_build_object('joined', false, 'reason', 'house_coach_unavailable');
  end if;

  -- Déjà rattaché à CE coach: on ressort 'joined' sans rien changer. C'est ce
  -- qui rend l'appel de réparation côté client sûr à rejouer.
  select u.email into v_email from auth.users u where u.id = v_user;

  v_outcome := public.keel_attach_student_to_coach(
    v_user, v_coach_id, v_email, p_country
  );
  if v_outcome <> 'attached' then
    return jsonb_build_object('joined', false, 'reason', v_outcome);
  end if;

  return jsonb_build_object('joined', true);
end;
$function$;

comment on function public.keel_join_house_coach(text) is
  'Rattache le caller au coach maison (inscription libre). Idempotent, et sûr à '
  'rejouer: c''est aussi le chemin de RÉPARATION quand le rattachement du '
  'trigger de signup a échoué. Le pays est OBLIGATOIRE — sans lui tout inscrit '
  'libre sortirait avec country NULL et hériterait de la hotline déduite de sa '
  'langue. Refuse un compte coach et un élève déjà suivi par un vrai coach.';

revoke all on function public.keel_join_house_coach(text) from public, anon;
grant execute on function public.keel_join_house_coach(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. handle_new_user() — l'intention d'inscription libre, et la garde nettoyée
-- ---------------------------------------------------------------------------

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
  v_signup_intent := nullif(trim(coalesce(new.raw_user_meta_data->>'keel_signup_intent', '')), '');
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

  return new;
end;
$function$;
