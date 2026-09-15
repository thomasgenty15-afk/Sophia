-- ============================================================================
-- D17 — LE RÉGLAGE DISCRET, ET D8 — « REFUSER », LA TROISIÈME SORTIE
--
-- Décidé le 2026-08-12 (docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
-- lot L5). Deux réglages, une table, et une règle qui les gouverne tous les
-- deux:
--
--   ⚠️ ILS COUPENT LA **PROPOSITION**, JAMAIS LA **FUSION**.
--
-- Un maître peut décider de ne plus se voir proposer la fusion pour une
-- personne (D17, « assumé comme un peu brutal, donc caché »), et il peut
-- écarter UNE proposition précise sans rien décider pour l'avenir (D8, la
-- troisième sortie: « refuser — ne rien faire »). Dans les deux cas, s'il
-- demande explicitement la fusion, elle marche: `operation: "merge"` ne lit pas
-- cette table, et un test de source le tient. Un réglage qui bloquerait le
-- geste serait une punition, pas un filtre.
--
-- ── POURQUOI UNE TABLE, ET POURQUOI CELLE-CI ────────────────────────────────
--   · Une COLONNE sur `household_members` aurait mélangé un réglage d'écran du
--     MAÎTRE avec l'identité d'une bouche — et `household_members` est déjà lu
--     par le roster à chaque tour de chat et à chaque composition.
--   · Deux tables (une par réglage) auraient fait deux lectures là où le
--     lecteur de propositions n'en veut qu'une: les deux réglages se lisent
--     TOUJOURS ensemble, parce qu'ils répondent à la même question — « ai-je le
--     droit de montrer ceci au maître ? »
--   · Le RETOUR ARRIÈRE est un `drop table`: rien d'autre ne dépend d'elle, et
--     son absence rend simplement toutes les propositions visibles, ce qui est
--     l'état d'avant ce lot.
--
-- ── « REFUSER » EST BORNÉ À UNE VALIDATION, PAS À UNE PERSONNE ──────────────
-- `dismissed_validated_at` porte l'instant de validation que le maître a
-- écarté. Le jour où la personne valide un plan de PLUS, la date change et la
-- question se repose. Sans cette borne, « refuser » serait soit un silence d'un
-- instant — l'écran reposerait la question au rechargement suivant — soit un
-- silence définitif, c'est-à-dire D17 déguisé, décidé sans que le maître l'ait
-- demandé.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LA TABLE
-- ---------------------------------------------------------------------------

create table if not exists public.household_merge_settings (
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null
    references public.household_members(member_id) on delete cascade,
  -- D17. `false` est le DÉFAUT et le restera: un produit qui masque par défaut
  -- les propositions n'en ferait aucune, et personne ne saurait pourquoi.
  proposals_muted boolean not null default false,
  -- D8, 3e sortie. NULL = rien n'a été écarté.
  dismissed_validated_at timestamptz,
  updated_at timestamptz not null default now(),
  -- QUI a réglé ça. Une décision domestique qui retire quelque chose de la vue
  -- d'un foyer doit être attribuable: c'est la même règle que les restrictions
  -- parentales (PIVOT-FOYER §8.5 règle 3).
  updated_by uuid references auth.users(id) on delete set null,
  primary key (household_id, member_id)
);

comment on table public.household_merge_settings is
  'L5 / D17 · D8 — ce que le maître ne veut plus se voir PROPOSER à propos '
  'd''une bouche de son foyer. NE BLOQUE JAMAIS LA FUSION: '
  'generate-household-meal-v1 (operation=merge) ne lit pas cette table, et un '
  'test de source le tient. Une ligne absente = tout est proposé, ce qui est '
  'l''état d''avant le lot.';
comment on column public.household_merge_settings.proposals_muted is
  'D17 — « ne plus me proposer la fusion pour cette personne ». Réglage '
  'DISCRET (assumé comme un peu brutal), donc jamais un bouton sur la carte. '
  'Il ne coupe PAS l''avertissement de D8: celui-là parle du plan du MAÎTRE, '
  'qui contient la reprise d''un plan que l''intéressé a remplacé — le taire '
  'rendrait un plan périmé invisible ET indéfaisable.';
comment on column public.household_merge_settings.dismissed_validated_at is
  'D8, 3e sortie — la validation que le maître a explicitement écartée. Bornée '
  'à CET instant: une validation POSTÉRIEURE repose la question. Écrite par '
  'keel_household_dismiss_merge_notice, qui refuse si la date proposée n''est '
  'plus celle du plan vivant (`notice_moved_on`).';

alter table public.household_merge_settings enable row level security;

-- ---------------------------------------------------------------------------
-- 2. LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- ⚠️ DEUX CICATRICES DU DÉPÔT, REJOUÉES ICI. Les privilèges par défaut de ce
-- projet donnent TOUT à `authenticated` sur toute table neuve, et
-- `revoke ... from public` NE RETIRE PAS `anon`. On nomme donc les trois rôles,
-- puis on rend le seul droit utile: LIRE.
--
-- L'ÉCRITURE PASSE PAR LES DEUX RPC, et par elles seules. Un `grant update`
-- laisserait un maître écrire `dismissed_validated_at` dans le futur et se
-- taire à jamais une proposition — c'est-à-dire obtenir D17 sans l'avoir
-- choisi, par une porte que personne ne relit.
revoke all on public.household_merge_settings from public;
revoke all on public.household_merge_settings from anon;
revoke all on public.household_merge_settings from authenticated;
grant select on public.household_merge_settings to authenticated;

-- SEUL LE MAÎTRE LIT. Ce n'est pas la même règle que les restrictions
-- parentales, qui sont visibles de tout le foyer EXPRÈS (§8.5 règle 3) — et
-- l'écart est assumé: une restriction est un fait DOMESTIQUE qui s'applique à
-- l'assiette d'un membre, tandis que « je ne veux plus qu'on me propose de
-- fusionner le plan de Zoé » est une préférence d'ÉCRAN du maître, qui ne
-- change rien à ce que Zoé mange. Zoé garde son plan dans tous les cas — c'est
-- l'invariant de D8. La montrer ferait lire à Zoé un jugement sur elle, pour
-- une décision qui n'a aucun effet sur elle.
drop policy if exists household_merge_settings_owner_read
  on public.household_merge_settings;
create policy household_merge_settings_owner_read
  on public.household_merge_settings
  for select to authenticated
  using (
    household_id = public.keel_household_of((select auth.uid()))
    and exists (
      select 1 from public.household_members hm
       where hm.user_id = (select auth.uid())
         and hm.household_id = household_merge_settings.household_id
         and hm.role = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. D17 — « NE PLUS ME PROPOSER LA FUSION POUR CETTE PERSONNE »
-- ---------------------------------------------------------------------------

create or replace function public.keel_household_mute_merge_proposals(
  p_member uuid,
  p_muted boolean
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
  -- ⚠️ `auth.uid()` EST NULL SOUS service_role. Ce refus n'est donc pas une
  -- politesse: sans lui, un appelant serveur recevrait un 200 qui n'écrit rien
  -- — le défaut exact mesuré sur `keel_validate_meal_plan` le 2026-08-11.
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_muted is null then
    return jsonb_build_object('ok', false, 'reason', 'muted_required');
  end if;

  select hm.household_id, hm.role into v_household, v_role
    from public.household_members hm
   where hm.user_id = v_user;
  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  -- SEUL LE MAÎTRE. La proposition lui est adressée à LUI (D10: « la fusion est
  -- manuelle, déclenchée par le maître »); un secondaire qui pourrait la
  -- masquer se retirerait lui-même de la cuisine commune en silence.
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select hm.member_id, hm.role into v_target
    from public.household_members hm
   where hm.member_id = p_member and hm.household_id = v_household;
  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  -- D2 — le plan du maître EST le plan du foyer: rien ne lui est jamais
  -- proposé, donc il n'y a rien à masquer. Sans ce refus, la ligne existerait
  -- et ne servirait à rien, ce qui est pire qu'un refus: elle ferait croire à
  -- un réglage actif.
  if v_target.role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'member_is_owner');
  end if;

  insert into public.household_merge_settings
    (household_id, member_id, proposals_muted, updated_at, updated_by)
  values (v_household, p_member, p_muted, now(), v_user)
  on conflict (household_id, member_id) do update
    set proposals_muted = excluded.proposals_muted,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'muted', p_muted);
end;
$function$;

comment on function public.keel_household_mute_merge_proposals(uuid, boolean) is
  'D17 (2026-08-12) — le maître ne veut plus qu''on lui PROPOSE de fusionner le '
  'plan de cette bouche. Ne bloque PAS la fusion: s''il la demande, elle '
  'marche. Ne coupe pas non plus l''avertissement de D8, qui parle de SON plan '
  'à lui. Réglage discret, donc pas un bouton sur la carte (D17).';

-- ---------------------------------------------------------------------------
-- 4. D8, 3e SORTIE — « REFUSER », POUR CETTE VALIDATION-LÀ
-- ---------------------------------------------------------------------------
--
-- ⚠️ LA DATE NE VIENT PAS DU CLIENT, ELLE EST **VÉRIFIÉE** CONTRE LA SIENNE.
-- C'est la même doctrine que la fenêtre de fusion, qui se déduit et ne se
-- demande pas: un client qui pourrait écrire n'importe quelle date écrirait
-- l'an 3000 et se tairait la proposition pour toujours — c'est-à-dire
-- obtiendrait D17 sans l'avoir choisi. On exige donc la date que le maître
-- CROIT écarter, on la compare à celle du plan vivant, et on écrit LA NÔTRE.
--
-- LA COMPARAISON EST À LA MILLISECONDE, exprès. PostgREST rend un timestamptz à
-- la microseconde; un aller-retour par `Date` en JavaScript le tronque à la
-- milliseconde. Comparer à la microseconde ferait échouer un refus parfaitement
-- légitime, à jamais, sans que rien ne le dise.
create or replace function public.keel_household_dismiss_merge_notice(
  p_member uuid,
  p_validated_at timestamptz
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
  v_plans jsonb;
  v_latest timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_validated_at is null then
    return jsonb_build_object('ok', false, 'reason', 'validated_at_required');
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
  if v_target.role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'member_is_owner');
  end if;

  -- ⚠️ LA LISTE DES PLANS VIENT DU ROSTER, PAS D'UN `select` DE PLUS.
  -- `keel_household_roster_for` porte DÉJÀ le prédicat de D7 (personnel ·
  -- vivant · validé · rattaché à ce foyer), et c'est lui que la proposition
  -- montre au maître. Le réécrire ici ferait une seconde définition de « le
  -- plan validé de cette personne », et le refus cesserait de porter sur ce que
  -- l'écran affichait le jour où l'une des deux bouge.
  select r.own_plans into v_plans
    from public.keel_household_roster_for(v_user) r
   where r.member_id = p_member;

  select max((e ->> 'validated_at')::timestamptz) into v_latest
    from jsonb_array_elements(coalesce(v_plans, '[]'::jsonb)) e;

  if v_latest is null then
    return jsonb_build_object('ok', false, 'reason', 'no_validated_plan');
  end if;
  if date_trunc('milliseconds', v_latest)
     <> date_trunc('milliseconds', p_validated_at) then
    -- LE MONDE A BOUGÉ ENTRE L'ÉCRAN ET LE CLIC. Écarter quand même écarterait
    -- une proposition que le maître n'a pas lue.
    return jsonb_build_object(
      'ok', false, 'reason', 'notice_moved_on', 'validated_at', v_latest);
  end if;

  insert into public.household_merge_settings
    (household_id, member_id, dismissed_validated_at, updated_at, updated_by)
  values (v_household, p_member, v_latest, now(), v_user)
  on conflict (household_id, member_id) do update
    set dismissed_validated_at = excluded.dismissed_validated_at,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'dismissed_validated_at', v_latest);
end;
$function$;

comment on function public.keel_household_dismiss_merge_notice(uuid, timestamptz) is
  'D8, 3e sortie (2026-08-12) — le maître écarte CETTE proposition/alerte, pas '
  'la personne. Bornée à l''instant de validation en cours: une validation '
  'postérieure repose la question. Refuse `notice_moved_on` si la date '
  'proposée n''est plus celle du plan vivant — sinon un client pourrait écrire '
  'une date lointaine et se taire la proposition pour toujours, c''est-à-dire '
  'obtenir D17 sans l''avoir choisi.';

-- ---------------------------------------------------------------------------
-- 5. LES PRIVILÈGES DES DEUX RPC
-- ---------------------------------------------------------------------------
--
-- ⚠️ `revoke from public` NE RETIRE PAS `anon`, et une fonction neuve est
-- exécutable par tout le monde. On nomme les rôles.
--
-- `service_role` N'EN A PAS BESOIN et ne doit pas l'avoir: les deux fonctions
-- sont gatées sur `auth.uid()`, qui est NULL sous service_role — un appelant
-- serveur recevrait un 200 qui n'écrit rien. Le refuser à la porte vaut mieux
-- qu'un no-op silencieux (mesuré sur `keel_validate_meal_plan`, 2026-08-11).
revoke all on function public.keel_household_mute_merge_proposals(uuid, boolean)
  from public, anon, service_role;
revoke all on function public.keel_household_dismiss_merge_notice(uuid, timestamptz)
  from public, anon, service_role;
grant execute on function public.keel_household_mute_merge_proposals(uuid, boolean)
  to authenticated;
grant execute on function public.keel_household_dismiss_merge_notice(uuid, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. CONTRÔLE FINAL — ON REJOUE LES GESTES, PUIS ON ANNULE TOUT
-- ---------------------------------------------------------------------------
--
-- ⚠️ CE QUI NE PEUT PAS ÊTRE VÉRIFIÉ ICI, ET IL FAUT LE DIRE: le chemin
-- NOMINAL des deux RPC. Elles sont gatées sur `auth.uid()`, qui est NULL dans
-- psql — donc tout ce qu'on peut prouver d'elles ici, c'est qu'elles REFUSENT.
-- Leur cas passant se prouve par PostgREST, sous un vrai jeton, et c'est écrit
-- dans le rapport du lot plutôt que suggéré par un contrôle qui n'y touche pas.
--
-- CE QUI EST VÉRIFIÉ ICI, en revanche, ne se prouve nulle part ailleurs: les
-- PRIVILÈGES. « `authenticated` reçoit TOUT sur toute table neuve » est la
-- cicatrice la plus chère de ce dépôt, et un `grant` oublié ne se voit sur
-- aucun écran — il se voit le jour où quelqu'un écrit la ligne d'un autre.
do $$
declare
  v_user uuid;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_res jsonb;
  v_priv text;
begin
  -- 1. LES PRIVILÈGES DE TABLE. Le cas qui PASSE d'abord: `authenticated` DOIT
  --    lire, sinon l'écran du maître ne saurait jamais ce qu'il a masqué.
  if not has_table_privilege('authenticated', 'public.household_merge_settings', 'SELECT') then
    raise exception
      'household_merge_settings: `authenticated` ne peut pas LIRE — le maître '
      'ne pourrait pas voir ce qu''il a masqué, et le réglage discret '
      'deviendrait un réglage invisible même à lui';
  end if;
  foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.household_merge_settings', v_priv) then
      raise exception
        'household_merge_settings: `authenticated` a le droit % — il pourrait '
        'écrire `dismissed_validated_at` dans le futur et se taire une '
        'proposition pour toujours, sans passer par la RPC qui vérifie la date',
        v_priv;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.household_merge_settings', 'SELECT') then
    raise exception
      'household_merge_settings: `anon` lit la table — `revoke from public` ne '
      'retire pas `anon`, cicatrice connue de ce dépôt';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'household_merge_settings'
       and c.relrowsecurity
  ) then
    raise exception 'household_merge_settings: RLS n''est pas active';
  end if;

  -- 2. LES DEUX RPC REFUSENT SOUS service_role. C'est `auth.uid() is null`, et
  --    c'est exactement le no-op silencieux que ce dépôt a déjà payé.
  v_res := public.keel_household_mute_merge_proposals(gen_random_uuid(), true);
  if v_res ->> 'reason' <> 'not_authenticated' then
    raise exception
      'mute_merge_proposals sous service_role rend % — une RPC gatée sur '
      'auth.uid() qui ne refuse pas rend 200 sans rien écrire', v_res::text;
  end if;
  v_res := public.keel_household_dismiss_merge_notice(gen_random_uuid(), now());
  if v_res ->> 'reason' <> 'not_authenticated' then
    raise exception
      'dismiss_merge_notice sous service_role rend % — même défaut', v_res::text;
  end if;

  -- 3. LA CASCADE. Une bouche qui quitte le foyer emporte son réglage: sans
  --    ça, une ligne survivrait à la personne et masquerait les propositions
  --    d'un `member_id` réattribué. (Un `member_id` est un UUID, donc la
  --    collision est théorique — mais la ligne morte, elle, ne l'est pas.)
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'household_merge_settings: aucun utilisateur, cascade non vérifiée';
  elsif public.keel_household_of(v_user) is not null then
    raise notice 'household_merge_settings: % déjà dans un foyer, cascade non vérifiée', v_user;
  else
    insert into public.households (name, created_by)
    values ('__qa_merge_settings__', v_user) returning id into v_house;
    insert into public.household_members
      (household_id, user_id, role, first_name, birth_date)
    values (v_house, v_user, 'owner', 'Owner', '1990-01-01')
    returning member_id into v_owner;
    insert into public.household_members
      (household_id, user_id, role, first_name, birth_date)
    values (v_house, null, 'member', 'Zoe', '2000-01-01')
    returning member_id into v_kid;

    insert into public.household_merge_settings (household_id, member_id, proposals_muted)
    values (v_house, v_kid, true);

    delete from public.household_members where member_id = v_kid;
    if exists (select 1 from public.household_merge_settings where member_id = v_kid) then
      raise exception
        'household_merge_settings: le réglage survit à la bouche — une ligne '
        'morte masquerait des propositions que personne ne peut plus démasquer';
    end if;
    raise notice 'household_merge_settings: privilèges, refus et cascade vérifiés';
  end if;

  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
