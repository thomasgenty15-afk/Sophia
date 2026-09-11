-- ===========================================================================
-- LOT 1 · L'INVITATION TRAVERSE UN FOYER PERSONNEL
--
-- Plan: docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md, lot 1 (cycle de vie).
-- Amont: 20260910191000. Définition reprise de la fonction VIVANTE, pas d'une
-- migration ancienne — le dépôt exige de lire la dernière applicable.
--
-- ⛔ CE QUE CETTE MIGRATION NE FAIT PAS: elle ne transfère ni plan privé, ni
-- essai, ni moyen de paiement au foyer cible. Elle détache, puis elle attache.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.keel_household_join(p_token text, p_country text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv record;
  v_claimed integer;
  v_declared text;
  v_country text;
  v_goal text;
  v_current uuid;
  v_current_role text;
  v_members integer;
  v_open_inv integer;
  v_left_kind text;
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

  -- ══════════════════════════════════════════════════════════════════════
  -- LOT 1 · UN FOYER PERSONNEL NE BLOQUE PAS UNE INVITATION
  -- ══════════════════════════════════════════════════════════════════════
  --
  -- ⛔ CE REFUS ÉTAIT JUSTE TANT QUE PERSONNE N'AVAIT DE FOYER PAR DÉFAUT. Le
  -- jour où chaque compte en reçoit un (`keel_ensure_personal_household`),
  -- « already_in_household » refuserait TOUTES les invitations: l'invité en a
  -- toujours un.
  --
  -- ⚠️ LA CONDITION PORTE SUR L'ÉTAT, PAS SUR LE MARQUEUR. `households.origin`
  -- dit d'où vient le foyer; il ne dit pas s'il est vide. Un foyer constitué à
  -- la main puis vidé de tout le monde sauf son maître est aussi « réellement
  -- personnel », et un foyer `personal_auto` où quelqu'un a été ajouté ne l'est
  -- plus. On lit donc: une seule bouche, ce compte, maître, aucune invitation
  -- vivante.
  --
  -- ⛔ UN FOYER COLLECTIF NE S'ABANDONNE PAS PAR ICI. Le parcours explicite de
  -- transfert/départ existe, et il pose des questions que cette porte-ci ne
  -- pose pas.
  v_current := public.keel_household_of(v_user);
  if v_current is not null then
    select count(*) into v_members
    from public.household_members hm where hm.household_id = v_current;

    select count(*) into v_open_inv
    from public.household_invitations hi
    where hi.household_id = v_current
      and hi.consumed_at is null
      and hi.expires_at > now();

    select hm.role into v_current_role
    from public.household_members hm
    where hm.household_id = v_current and hm.user_id = v_user;

    if v_members <> 1 or coalesce(v_current_role, '') <> 'owner' or v_open_inv > 0 then
      return jsonb_build_object('ok', false, 'reason', 'already_in_household');
    end if;

    -- ⛔ DANS LA MÊME TRANSACTION QUE LA RÉCLAMATION. Une erreur plus bas
    -- annule le détachement: on ne laisse jamais quelqu'un sans foyer parce
    -- qu'un jeton était périmé.
    delete from public.household_members
    where household_id = v_current and user_id = v_user;

    -- ⚠️ ET LE FOYER VIDE NE PART QUE S'IL NE PORTE RIEN. `student_generated_
    -- meals.household_id` est en NO ACTION: un foyer qui porte des plans REFUSE
    -- d'être supprimé, et c'est la bonne direction — l'historique privé reste
    -- lisible par son auteur (`student_generated_meals_owner_read`, `user_id =
    -- auth.uid()`), et un foyer sans membre n'est lisible par personne d'autre.
    begin
      delete from public.households where id = v_current;
      v_left_kind := 'supprime';
    exception when foreign_key_violation then
      v_left_kind := 'vide_conserve';
    end;
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
$function$

;
