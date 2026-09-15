-- ============================================================================
-- L'ACCEPTATION D'UNE INVITATION ÉCRIT LE PAYS ET LA LANGUE DE L'ÉLÈVE
--
-- LE DÉFAUT, MESURÉ EN CONDITIONS RÉELLES (QA WEB L2, 2026-08-04)
-- ---------------------------------------------------------------
-- Un élève invité par un coach BRITANNIQUE, arrivé par `/join` en étant déjà
-- connecté, se retrouvait avec :
--
--     profiles.country = NULL     profiles.locale = 'fr-FR'
--
-- `accept_coach_invitation_for_user` n'écrivait que `keel_role`. Le `fr-FR`
-- vient du défaut legacy de `handle_new_user()`, que personne n'a choisi.
--
-- Ce que ça donnait, en jouant le résolveur de crise sur ce profil :
--
--     crisisCountryForProfile({country:null, locale:'fr-FR'})
--       → { country: 'FR', source: 'locale' }
--     resolveCrisisResources('FR', 'suicide')
--       → 3114, « National suicide prevention line », fallbackUsed: FALSE
--
-- C'est-à-dire : un élève britannique en détresse reçoit un numéro français
-- qui ne décroche pas depuis le Royaume-Uni, et **rien ne signale** la
-- dégradation — `fallbackUsed` est faux, parce que du point de vue du
-- résolveur la réponse est parfaitement fondée. Le commentaire de
-- `crisis_resources.ts` décrit exactement ce scénario comme le défaut que
-- `profiles.country` devait fermer ; la colonne existe, personne ne la
-- remplissait sur ce chemin.
--
-- CE QUE CETTE MIGRATION ÉCRIT, ET POURQUOI CHAQUE CHAMP
-- ------------------------------------------------------
-- `locale = 'en-US'` — KEEL est un produit anglais. Le formulaire de `/join`
--   le passe DÉJÀ en dur dans les métadonnées de `signUp`; le seul chemin qui
--   ne l'écrivait pas est celui du visiteur DÉJÀ connecté, qui n'appelle que
--   la RPC. La ligne se contentait donc de mentir : `resolveResponseLocale`
--   force `en-US` pendant le pilote, mais toute ceinture gatée sur
--   `isFrenchLocale` et tout repli de crise lisaient le `fr-FR`.
--   Écrit UNIQUEMENT quand on pose aussi `keel_role` — jamais sur un coach qui
--   accepterait l'invitation d'un pair sur son propre compte.
--
-- `country` ← le pays DÉCLARÉ DU COACH, et seulement si celui de l'élève est
--   NULL. Ce n'est pas une devinette : c'est le pays que le coach a choisi
--   dans un sélecteur à l'inscription, en sachant qu'il sert aux ressources de
--   crise. Un défaut hérité d'une déclaration vaut mieux qu'un pays dérivé
--   d'une langue que personne n'a choisie — c'est la règle même que ce dépôt
--   s'est donnée : « country is not a language ». Il reste écrasable : l'élève
--   qui déclare le sien gagne (la condition `country is null`).
--
-- CE QU'ELLE NE FAIT PAS : le FUSEAU. Aucune valeur serveur n'est honnête ici
--   — le fuseau n'est connu que du navigateur. Il est écrit côté client après
--   l'acceptation (`JoinPage.tsx`). C'est important : un fuseau NULL fait
--   rendre `null` à `localHourFor`, ce qui range l'élève en `outside_window`
--   à CHAQUE tick du tap du soir. Silencieusement, pour toujours.
-- ============================================================================

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
  v_link_id uuid;
  v_link_coach uuid;
begin
  if p_user_id is null then
    raise exception 'accept_coach_invitation: no user' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,200}$' then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;

  v_hash := public.coach_invite_token_hash(p_token);

  -- FOR UPDATE: the invitation row is the mutex of this whole operation. Two
  -- tabs clicking "Accept" serialise here instead of racing on coach_clients.
  select i.id, i.coach_id, i.status, i.expires_at,
         c.user_id, c.status,
         coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(p.full_name), '')),
         p.country
    into v_invitation_id, v_coach_id, v_status, v_expires_at,
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
    -- Burn it while we hold the lock: an expired invitation stops being
    -- 'pending' the first time anyone looks at it, so the coach's screen shows
    -- the truth without a sweeper job.
    update public.coach_invitations set status = 'expired' where id = v_invitation_id;
    return jsonb_build_object('accepted', false, 'reason', 'expired');
  end if;
  if v_coach_status <> 'active' then
    return jsonb_build_object('accepted', false, 'reason', 'coach_unavailable');
  end if;
  if v_coach_user_id = p_user_id then
    return jsonb_build_object('accepted', false, 'reason', 'self_invitation');
  end if;

  -- A LIVE link with somebody else is a refusal, not a silent takeover. The
  -- student leaves a coach through revoke_coach_access(), never through a
  -- second coach's invitation.
  select cc.id, cc.coach_id into v_link_id, v_link_coach
    from public.coach_clients cc
   where cc.student_user_id = p_user_id
     and cc.status in ('invited', 'active')
   limit 1
     for update;

  if v_link_id is not null and v_link_coach <> v_coach_id then
    return jsonb_build_object('accepted', false, 'reason', 'already_coached');
  end if;

  begin
    if v_link_id is not null then
      -- Same coach, already live: idempotent re-acceptance.
      update public.coach_clients
         set status = 'active',
             consent_granted_at = coalesce(consent_granted_at, now()),
             started_at = coalesce(started_at, now()),
             ended_at = null,
             updated_at = now()
       where id = v_link_id;
    else
      -- A paused or ended link with THIS coach is resumed rather than
      -- duplicated: the audit trail and the billing history of the previous
      -- period stay attached to one row.
      select cc.id into v_link_id
        from public.coach_clients cc
       where cc.student_user_id = p_user_id
         and cc.coach_id = v_coach_id
         and cc.status in ('paused', 'ended')
       order by cc.updated_at desc
       limit 1
         for update;

      if v_link_id is not null then
        update public.coach_clients
           set status = 'active',
               consent_granted_at = now(),
               started_at = coalesce(started_at, now()),
               ended_at = null,
               updated_at = now()
         where id = v_link_id;
      else
        insert into public.coach_clients
          (coach_id, student_user_id, invited_email, status,
           consent_granted_at, started_at)
        values
          (v_coach_id, p_user_id,
           (select lower(i.email) from public.coach_invitations i where i.id = v_invitation_id),
           'active', now(), now())
        returning id into v_link_id;
      end if;
    end if;
  exception when unique_violation then
    -- one_live_coach_per_student fired: another coach won the race between our
    -- SELECT and this write. Same answer as the explicit check above.
    return jsonb_build_object('accepted', false, 'reason', 'already_coached');
  end;

  update public.coach_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_invitation_id;

  -- The student app's route guard reads profiles.keel_role. Accepting an
  -- invitation is what makes someone a student, so the role is set here — but
  -- only when it is unset: it never demotes a coach who accepted a peer's
  -- invitation on their own account.
  --
  -- `locale` part de la MÊME condition (`keel_role is null`), délibérément: on
  -- n'écrit la langue du produit que sur quelqu'un qui DEVIENT élève ici.
  update public.profiles
     set keel_role = 'student',
         locale = 'en-US',
         updated_at = now()
   where id = p_user_id
     and keel_role is null;

  -- Le pays, séparément et sans condition de rôle: un élève déjà lié à ce
  -- coach qui ré-accepte (chemin idempotent ci-dessus) doit lui aussi sortir
  -- d'ici avec un pays. `country is null` est la seule garde — une déclaration
  -- de l'élève ne se fait jamais écraser par le défaut du coach.
  if v_coach_country is not null and btrim(v_coach_country) <> '' then
    update public.profiles
       set country = v_coach_country,
           updated_at = now()
     where id = p_user_id
       and country is null;
  end if;

  return jsonb_build_object(
    'accepted', true,
    'coach_first_name', nullif(split_part(coalesce(v_coach_name, ''), ' ', 1), '')
  );
end;
$function$;

comment on function public.accept_coach_invitation_for_user(uuid, text) is
  'Accepte une invitation coach. Pose keel_role, la langue du produit (en-US) '
  'et, à défaut, le pays DÉCLARÉ du coach — sans quoi le résolveur de crise '
  'dérive le pays de la locale legacy fr-FR et sert un numéro français à un '
  'élève britannique, sans lever de fallback. Le fuseau reste au client: '
  'aucune valeur serveur ne serait honnête, et un fuseau NULL range l''élève '
  'en outside_window à chaque tick du tap du soir.';
