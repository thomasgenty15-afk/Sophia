-- ===========================================================================
-- LOT 1 · LE RATTRAPAGE — paginé, relançable, par LA MÊME primitive
--
-- Plan: docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md, lot 1.
-- Amont: 20260910190000 (la primitive et son garde d'usurpation).
--
-- ⛔ POURQUOI UNE SECONDE MIGRATION PLUTÔT QU'UNE RETOUCHE DE LA PREMIÈRE.
-- La 190000 est déjà appliquée localement et son numéro est au registre.
-- Modifier un fichier déjà appliqué le rend invisible: le registre ne le
-- rejoue pas, et deux bases divergent sans que rien ne le dise. Le dépôt a
-- déjà payé « migration hors ordre = sautée en silence ».
--
-- CE QUE CETTE MIGRATION INSTALLE
-- -------------------------------
--   1. `keel__ensure_personal_household(uuid)` — le CORPS, sans aucun garde
--      d'identité. Privé: ni `anon`, ni `authenticated` ne peuvent l'appeler.
--   2. la RPC publique, réécrite pour DÉLÉGUER — un seul corps, deux portes.
--   3. `keel_backfill_personal_households(p_limit, p_dry_run)` — le rattrapage.
--
-- ⛔ « VIA LA MÊME PRIMITIVE » EST UNE EXIGENCE, PAS UN CONFORT. Un rattrapage
-- qui recopierait les deux `insert` finirait par diverger de la RPC — et c'est
-- celui qu'on relit le moins qui écrirait 1 400 foyers de travers.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) LE CORPS, SANS GARDE — il ne s'atteint que depuis une fonction definer
-- ---------------------------------------------------------------------------
create or replace function public.keel__ensure_personal_household(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hh      uuid;
  v_member  uuid;
  v_first   text;
  v_birth   date;
  v_deleted timestamptz;
  v_free    date;
  v_origin  text;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  select u.deleted_at into v_deleted from auth.users u where u.id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  if v_deleted is not null then
    return jsonb_build_object('ok', false, 'reason', 'account_deleted');
  end if;

  -- ⚠️ AVANT LA LECTURE. Voir la 190000: lire puis créer sans verrou laisse
  -- deux appels concurrents lire « aucun foyer » tous les deux.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select hm.household_id, hm.member_id into v_hh, v_member
  from public.household_members hm where hm.user_id = p_user limit 1;

  if v_hh is not null then
    select h.origin, h.free_until into v_origin, v_free
    from public.households h where h.id = v_hh;
    return jsonb_build_object(
      'ok', true, 'created', false, 'household_id', v_hh,
      'member_id', v_member, 'origin', v_origin, 'free_until', v_free);
  end if;

  select
    coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Me'),
    p.birth_date
    into v_first, v_birth
  from public.profiles p where p.id = p_user;

  -- ⛔ AUCUNE ÉCHÉANCE ÉCRITE ICI. Le défaut de la colonne s'applique — sept
  -- jours — et c'est la décision du propriétaire du 2026-09-10, qui renverse le
  -- § 1.4 du plan. Voir l'en-tête de 20260910190000 pour ce qu'elle coûte.
  insert into public.households (name, created_by, origin)
  values (coalesce(v_first, 'Me'), p_user, 'personal_auto')
  returning id, free_until into v_hh, v_free;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_hh, p_user, 'owner', coalesce(v_first, 'Me'), v_birth)
  returning member_id into v_member;

  return jsonb_build_object(
    'ok', true, 'created', true, 'household_id', v_hh,
    'member_id', v_member, 'origin', 'personal_auto', 'free_until', v_free);
end;
$function$;

comment on function public.keel__ensure_personal_household(uuid) is
  'LOT 1 — le CORPS du provisionnement, SANS garde d''identité. Privé: appelé '
  'seulement par `keel_ensure_personal_household` (qui porte le garde) et par '
  '`keel_backfill_personal_households`.';

revoke all on function public.keel__ensure_personal_household(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) LA PORTE PUBLIQUE — le garde, et rien d'autre
-- ---------------------------------------------------------------------------
create or replace function public.keel_ensure_personal_household(
  p_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_role  text := coalesce((select auth.role()), '');
begin
  -- ⛔ SANS CE GARDE, N'IMPORTE QUI FABRIQUE UN FOYER AU NOM DE N'IMPORTE QUI.
  if p_user is not null and p_user is distinct from v_actor and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if coalesce(p_user, v_actor) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  return public.keel__ensure_personal_household(coalesce(p_user, v_actor));
end;
$function$;

revoke all on function public.keel_ensure_personal_household(uuid) from public, anon;
grant execute on function public.keel_ensure_personal_household(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) LE RATTRAPAGE — paginé, relançable, et il COMPTE avant de compter
-- ---------------------------------------------------------------------------
--
-- ⚠️ `p_dry_run` EST LE DÉFAUT, et c'est voulu: un rattrapage qui écrit au
-- premier appel est un rattrapage qu'on lance « pour voir ».
--
-- ⛔ IL NE PREND QUE LES COMPTES SANS RATTACHEMENT ET NON SUPPRIMÉS. Le tri par
-- `id` rend la pagination stable et la relance sûre: un compte déjà traité
-- ressort `created = false` et ne coûte qu'une lecture.
create or replace function public.keel_backfill_personal_households(
  p_limit integer default 100,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r          record;
  v_res      jsonb;
  v_seen     integer := 0;
  v_created  integer := 0;
  v_already  integer := 0;
  v_failed   integer := 0;
  v_reasons  jsonb := '{}'::jsonb;
  v_before   integer;
  v_after    integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select count(*) into v_before
  from auth.users u
  where u.deleted_at is null and public.keel_household_of(u.id) is null;

  for r in
    select u.id
    from auth.users u
    where u.deleted_at is null
      and not exists (select 1 from public.household_members hm where hm.user_id = u.id)
    order by u.id
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  loop
    v_seen := v_seen + 1;
    if p_dry_run then
      v_created := v_created + 1;   -- ce qui SERAIT créé
      continue;
    end if;
    v_res := public.keel__ensure_personal_household(r.id);
    if coalesce((v_res->>'ok')::boolean, false) then
      if coalesce((v_res->>'created')::boolean, false)
        then v_created := v_created + 1;
        else v_already := v_already + 1;
      end if;
    else
      v_failed := v_failed + 1;
      v_reasons := jsonb_set(v_reasons, array[coalesce(v_res->>'reason', 'unknown')],
        to_jsonb(coalesce((v_reasons->>coalesce(v_res->>'reason','unknown'))::int, 0) + 1));
    end if;
  end loop;

  select count(*) into v_after
  from auth.users u
  where u.deleted_at is null and public.keel_household_of(u.id) is null;

  return jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'vus', v_seen,
    'crees', v_created,
    'deja_rattaches', v_already,
    'echecs', v_failed,
    'motifs', v_reasons,
    'sans_foyer_avant', v_before,
    'sans_foyer_apres', v_after,
    'reste', greatest(0, v_after)
  );
end;
$function$;

comment on function public.keel_backfill_personal_households(integer, boolean) is
  'LOT 1 — rattrapage paginé des comptes sans foyer, par `keel__ensure_'
  'personal_household`. `p_dry_run = true` par défaut. Réservée à '
  '`service_role`. Relançable: un compte déjà rattaché ne coûte qu''une lecture.';

revoke all on function public.keel_backfill_personal_households(integer, boolean)
  from public, anon, authenticated;
grant execute on function public.keel_backfill_personal_households(integer, boolean) to service_role;
