-- ============================================================================
-- LOT 1 · UN DÉPART REND SON FOYER — ET L'ÉCHÉANCE QU'ON AVAIT EN ARRIVANT.
--
-- Deux portes sortent quelqu'un d'un foyer:
--   `keel_household_remove_member`  le maître SUPPRIME la bouche;
--   `keel_household_detach_member`  le maître GARDE la bouche, sans le compte.
-- Les deux laissaient le compte concerné SANS FOYER. Depuis que « un compte
-- seul est un foyer d'une personne », cet état est exactement celui que le
-- lot 1 abolit: plus de plan, plus de couverture, un écran vide sans issue.
--
-- ⛔ ET ON NE REND PAS SEPT JOURS NEUFS. Sans mémoire, la boucle
-- « rejoindre → partir » rendrait un essai à chaque tour. `keel_household_join`
-- SUPPRIME le foyer personnel de l'invité: son échéance disparaissait avec lui.
-- On la range donc sur la ligne réclamée, et le départ la repose telle quelle.
--
-- ⚠️ `personal_free_until` NULL veut dire « on ne sait pas »: un compte
-- réclamé avant ce jour, ou une bouche jamais rattachée. Dans ce cas le
-- provisionnement rend l'essai standard — la décision du 2026-09-10 du
-- propriétaire, sept jours pour tout le monde.
-- ============================================================================

alter table public.household_members
  add column if not exists personal_free_until date;

comment on column public.household_members.personal_free_until is
  'Échéance que portait le foyer personnel de ce compte AVANT de rejoindre ce '
  'foyer-ci. Rangée par keel_household_join, reposée par les deux portes de '
  'départ. NULL = inconnue, le départ rend alors l''essai standard.';

-- ── LA RÉCLAMATION RANGE L'ÉCHÉANCE QU'ELLE EFFACE ─────────────────────────
create or replace function public.keel_household_join(p_token text, p_country text)
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
  v_goal text;
  v_current uuid;
  v_current_role text;
  v_members integer;
  v_open_inv integer;
  v_left_kind text;
  v_left_free_until date;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
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
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_email is null or v_email = '' or v_email <> v_inv.email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;
  if v_inv.consumed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  -- ⚠️ LA CONDITION PORTE SUR L'ÉTAT, PAS SUR LE MARQUEUR: une seule bouche,
  -- ce compte, maître, aucune invitation vivante. Un foyer collectif ne
  -- s'abandonne pas par ici.
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

    -- ⛔ LU AVANT LA SUPPRESSION, sinon la valeur part avec la ligne.
    select h.free_until into v_left_free_until
    from public.households h where h.id = v_current;

    delete from public.household_members
    where household_id = v_current and user_id = v_user;

    begin
      delete from public.households where id = v_current;
      v_left_kind := 'supprime';
    exception when foreign_key_violation then
      v_left_kind := 'vide_conserve';
    end;
  end if;

  select p.country into v_declared from public.profiles p where p.id = v_user;

  v_country := nullif(btrim(coalesce(p_country, '')), '');
  if v_country is not null then
    v_country := upper(v_country);
    if v_country !~ '^[A-Z]{2}$' then
      return jsonb_build_object('ok', false, 'reason', 'bad_country');
    end if;
  end if;

  if v_declared is null and v_country is null then
    return jsonb_build_object('ok', false, 'reason', 'country_required');
  end if;

  select hm.goal into v_goal
  from public.household_members hm
  where hm.member_id = v_inv.member_id;

  -- L'ATTACHEMENT. `and user_id is null` rend la réclamation non rejouable.
  -- ⚠️ `personal_free_until` est écrit DANS LE MÊME UPDATE: si la réclamation
  -- échoue, rien n'est rangé, et le foyer personnel n'a pas été supprimé non
  -- plus (tout est dans la même transaction).
  update public.household_members
     set user_id = v_user,
         personal_free_until = v_left_free_until
   where member_id = v_inv.member_id
     and user_id is null;
  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  if v_goal is not null and v_goal <> '' then
    insert into public.student_goals (user_id, goal, content_locale)
    values (v_user, v_goal, 'en-GB')
    on conflict (user_id) do nothing;
  end if;

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
$function$;

-- ── LE DÉTACHEMENT: LA BOUCHE RESTE, LE COMPTE REPART CHEZ LUI ─────────────
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
  v_rendu jsonb;
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

  select hm.member_id, hm.role, hm.user_id, hm.personal_free_until into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- LE MAÎTRE NE SE DÉTACHE PAS LUI-MÊME: un foyer sans compte maître laisse
  -- ses bouches sans personne pour composer, et personne pour reprendre la
  -- main, par construction.
  if v_target.role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'cannot_detach_owner');
  end if;

  if v_target.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_claimed');
  end if;

  -- ⛔ LE DÉTACHEMENT D'ABORD. `household_members_one_per_user` refuse deux
  -- appartenances: tant que cette ligne porte encore `user_id`, aucun foyer
  -- personnel ne peut être posé.
  --
  -- `departs_with_account` remis à false: la personne détachée n'a plus de
  -- compte attaché à cette ligne, donc plus d'intention de départ à honorer.
  -- `personal_free_until` remis à NULL: l'échéance vient d'être rendue, la
  -- garder ferait qu'un futur occupant de la ligne hérite de celle d'un autre.
  update public.household_members
     set user_id = null,
         departs_with_account = false,
         personal_free_until = null
   where member_id = p_member;

  v_rendu := public.keel__ensure_personal_household(v_target.user_id);

  -- ⚠️ ON REPOSE L'ÉCHÉANCE D'AVANT, quand on la connaît. Sinon on laisse le
  -- défaut — l'essai standard.
  if coalesce((v_rendu->>'ok')::boolean, false)
     and v_target.personal_free_until is not null then
    update public.households
       set free_until = v_target.personal_free_until,
           updated_at = now()
     where id = (v_rendu->>'household_id')::uuid;
    v_rendu := jsonb_set(v_rendu, '{free_until}',
                         to_jsonb(v_target.personal_free_until::text));
  end if;

  return jsonb_build_object('ok', true, 'member_id', p_member,
                            'foyer_rendu', v_rendu);
end;
$function$;

-- ── LE RETRAIT: LA BOUCHE PART, LE COMPTE REPART CHEZ LUI ─────────────────
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
  v_rendu jsonb;
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

  -- ⛔ `user_id` ET `personal_free_until` LUS AVANT LA SUPPRESSION: après, la
  -- ligne n'existe plus et on ne saurait plus à qui rendre un foyer.
  select hm.member_id, hm.role, hm.user_id, hm.personal_free_until into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_target.role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'cannot_remove_owner');
  end if;

  delete from public.household_members where member_id = p_member;

  -- Une bouche sans compte ne repart nulle part: il n'y a personne à reloger.
  if v_target.user_id is not null then
    v_rendu := public.keel__ensure_personal_household(v_target.user_id);
    if coalesce((v_rendu->>'ok')::boolean, false)
       and v_target.personal_free_until is not null then
      update public.households
         set free_until = v_target.personal_free_until,
             updated_at = now()
       where id = (v_rendu->>'household_id')::uuid;
      v_rendu := jsonb_set(v_rendu, '{free_until}',
                           to_jsonb(v_target.personal_free_until::text));
    end if;
  end if;

  return jsonb_build_object('ok', true, 'foyer_rendu', v_rendu);
end;
$function$;
