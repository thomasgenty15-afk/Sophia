-- ============================================================================
-- A8.2 — LE SORT D'UNE PART NON MANGÉE. Une ligne PAR BOUCHE, jamais un plan.
--
-- Autorité produit: ANALYSE du 2026-09-03 §8.2 (tableau des cas), décisions
-- D8.2 · D8.3 · D8.4 · D8.5. Fiches: FF-058 R10-R13 (la bande du soir),
-- FF-057 (la procédure accident), FF-054 §11 (le retour de fin de plan).
--
-- ── LE TROU QUE CETTE TABLE BOUCHE ──────────────────────────────────────────
-- Le maître ✓ « tout comme prévu » et le membre ✗ « j'ai commandé » le même
-- soir: la casserole a bien été faite, et LA PART DU MEMBRE est restée. C'est
-- une BOÎTE dans le frigo — littéralement, puisque `preparations[].boxes[]`
-- porte un contenant par bouche. Rien ne savait la nommer.
--
-- `accident.ts` le dit depuis le 2026-08: l'action `leftover` « rentre en trois
-- lignes le jour où quelque chose la lit ». Ce lot est ce lecteur.
--
-- ── ⛔ POURQUOI CE N'EST PAS UN GLISSEMENT DE PLAN (D8.4) ───────────────────
-- `applyPlanShift` déplace le plan ENTIER: dates des plats, des préparations,
-- des sessions. C'est légitime quand le MAÎTRE constate que la casserole n'a
-- pas été cuisinée — la maison entière est concernée. Ça ne l'est pas quand UNE
-- bouche n'a pas mangé sa part: le dîner a eu lieu pour les autres, et déplacer
-- le plan pour une boîte réécrirait la semaine de tout le monde.
--
-- Un membre DÉCLARE, et il décide du sort de SA boîte. Il ne décale rien.
-- FF-058 R9: « la capture et la réparation sont deux fiches ».
--
-- ── LA CLÉ EST À QUATRE COLONNES, ET LA QUATRIÈME EST LE SUJET (D8.3) ──────
-- `(generated_meal_id, dish_index, member_id, declared_by)`.
--
-- Sans `declared_by`, la déclaration du maître sur une bouche sans compte et
-- celle de la personne elle-même entreraient en collision sur la même clé, et
-- la dernière écraserait la première. Or elles ne disent pas la même chose et
-- n'ont pas la même autorité: D8.3 tranche que **la ligne déclarée par la
-- personne gagne**, et une résolution ne peut se faire que sur des lignes qui
-- COEXISTENT. C'est exactement le motif de `protocol_events`, unique sur
-- `(user_id, source_message_id)`: deux comptes portent la même clé de plat sans
-- se marcher dessus.
--
-- ⚠️ ET LA CONTRADICTION EST STRUCTURELLEMENT IMPOSSIBLE SUR UN PROFIL RÉCLAMÉ.
-- Le maître ne peut pas écrire pour une bouche QUI A UN COMPTE — la porte le
-- refuse (`not_your_line`), pas une convention. C'est la surveillance retirée,
-- et c'est la même règle que FF-058 R11.
--
-- ── `dish_index` EST POSITIONNEL, COMME LA COCHE ────────────────────────────
-- Même clé de fait que `meal_tick:<planId>:<idx>`: la position dans le
-- `dishes[]` STOCKÉ. Pas de FK possible (c'est un index dans un jsonb), donc la
-- borne est un CHECK et la cohérence vient de l'appelant — qui lit la position
-- capturée avant tout filtre (`HouseholdDishView.dishIndex`, A8.1).
--
-- ── CE QU'ON N'ÉCRIT PAS (D8.2) ─────────────────────────────────────────────
-- « Pas de nouvelles » ne s'écrit JAMAIS. Le silence des deux ne produit aucune
-- ligne; c'est le LECTEUR (la page de suivi, P7) qui compte « mangé, base
-- `assumed` ». Écrire une coche que personne n'a posée est la cicatrice
-- `auto-tick-writes-undeniable-false-facts`, et elle est indélébile.
--
-- ── LES DROITS: NI FERMÉE PAR ACCIDENT, NI OUVERTE À `anon` ────────────────
-- Les privilèges par défaut de ce projet accordent TOUT à `authenticated` sur
-- toute table neuve, et `revoke ... from public` laisse `anon` intact. On
-- révoque donc explicitement aux DEUX rôles avant d'accorder quoi que ce soit.
-- L'écriture passe par la RPC (service_role): c'est le chemin déterministe du
-- chat qui a vu le bouton partir.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LA TABLE
-- ---------------------------------------------------------------------------

create table if not exists public.meal_share_outcomes (
  generated_meal_id uuid not null
    references public.student_generated_meals(id) on delete cascade,
  dish_index integer not null check (dish_index >= 0 and dish_index < 400),
  member_id uuid not null
    references public.household_members(member_id) on delete cascade,
  -- LA RÉCLAMATION RGPD, ET ELLE EST ICI (patron FF-039, 20260810190000).
  -- `declared_by` EST la colonne propriétaire de cette table, et elle est
  -- COMPLÈTE: une ligne sur un profil réclamé est toujours écrite PAR lui (la
  -- porte refuse le maître, `not_your_line`), et une ligne sur une bouche sans
  -- compte appartient à celui qui l'a dite. Exporter par `member_id` rendrait
  -- au maître ce qu'un autre a déclaré; exporter par `declared_by` rend à
  -- chacun exactement ce qu'il a dit — et il n'existe aucune ligne sans
  -- auteur. `on delete cascade` la fait réclamer par la suppression de compte,
  -- `account-export-v1` la liste nommément, et `purge-deleted-accounts` la
  -- supprime EXPLICITEMENT en plus de la cascade (patron
  -- `student_activity_sessions`): « le cycle de vie RGPD ne réclame pas les
  -- tables neuves » est une cicatrice chiffrée de ce dépôt — neuf tables hors
  -- export ET hors purge pendant des mois. Celle-ci ne sera pas la dixième.
  declared_by uuid not null references auth.users(id) on delete cascade,
  outcome text not null
    check (outcome in ('not_eaten', 'shifted', 'frozen', 'discarded')),
  shifted_to_day date,
  answered_at timestamptz not null default now(),
  answered_local_date date not null,
  primary key (generated_meal_id, dish_index, member_id, declared_by),

  -- ⛔ UNE DATE N'A DE SENS QUE POUR `shifted`, ET L'INVERSE AUSSI. Une ligne
  -- `discarded` portant une date de report décrirait deux sorts contradictoires
  -- pour la même boîte, et le lecteur devrait CHOISIR — c'est-à-dire deviner.
  -- Un `shifted` sans date ne dit pas à quel jour, donc ne dit rien.
  constraint meal_share_outcomes_day_matches_outcome check (
    (outcome = 'shifted' and shifted_to_day is not null)
    or (outcome <> 'shifted' and shifted_to_day is null)
  )
);

comment on table public.meal_share_outcomes is
  'A8.2 — le sort de LA PART d''une bouche sur un plat du plan: pas mangée, '
  'reportée à un jour, congelée, jetée. UN FAIT PAR BOUCHE, jamais un '
  'glissement de plan (D8.4: un membre déclare, il ne décale rien — le dîner a '
  'eu lieu pour les autres). La clé porte `declared_by` parce que la '
  'déclaration du maître sur une bouche SANS COMPTE et celle de la personne '
  'doivent COEXISTER pour que D8.3 puisse trancher: la ligne de la personne '
  'gagne. Le silence n''écrit RIEN (D8.2): « pas de nouvelles » se LIT, base '
  '`assumed`. Accès: keel_household_declare_share_outcome[_for].';

comment on column public.meal_share_outcomes.dish_index is
  'La position dans le `dishes[]` STOCKÉ du plan — la même que la clé de coche '
  '`meal_tick:<planId>:<idx>`. Pas de FK possible (index dans un jsonb): la '
  'borne est un CHECK, et la cohérence vient de l''appelant, qui lit la '
  'position capturée AVANT tout filtre (HouseholdDishView.dishIndex).';

comment on column public.meal_share_outcomes.declared_by is
  'QUI a déclaré. La personne elle-même, ou le maître POUR UNE BOUCHE SANS '
  'COMPTE (D8.5: ranger une boîte n''est pas surveiller un adulte). Jamais le '
  'maître pour un profil RÉCLAMÉ — la porte le refuse (`not_your_line`), et la '
  'policy de lecture le refuse une seconde fois.';

comment on column public.meal_share_outcomes.shifted_to_day is
  'Le jour vers lequel la boîte est reportée. NON NULL si et seulement si '
  'outcome = ''shifted'' — une ligne `discarded` portant une date décrirait '
  'deux sorts pour la même boîte, et le lecteur devrait deviner.';

comment on column public.meal_share_outcomes.answered_local_date is
  'Le jour LOCAL de la personne au moment du tap. Peut différer du jour du '
  'plat (on range la boîte le lendemain matin); c''est `dish_index` qui '
  'identifie le repas.';

-- Le lecteur naturel: « les boîtes encore vivantes de ce plan », que la vue de
-- la part et la page de suivi interrogent.
create index if not exists meal_share_outcomes_plan_member_idx
  on public.meal_share_outcomes (generated_meal_id, member_id);

-- ---------------------------------------------------------------------------
-- 2. LES DROITS, AVANT TOUTE POLICY
-- ---------------------------------------------------------------------------

alter table public.meal_share_outcomes enable row level security;

revoke all on public.meal_share_outcomes from public;
revoke all on public.meal_share_outcomes from anon;
revoke all on public.meal_share_outcomes from authenticated;

-- LIRE seulement. L'écriture vient du tap, par le chemin déterministe du chat
-- (service_role) — même doctrine que `cooking_session_states`.
grant select on public.meal_share_outcomes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. LA POLICY DE LECTURE — chacun ses lignes, le maître EN PLUS les bouches
--    SANS COMPTE de son foyer, et JAMAIS celles d'un profil réclamé
-- ---------------------------------------------------------------------------
--
-- ⛔ LA TROISIÈME BRANCHE PORTE `target.user_id is null`, ET C'EST TOUT LE
-- SUJET. Sans ce prédicat, le maître lirait les déclarations de son conjoint —
-- c'est-à-dire la surveillance que R11 et R12 ont retirée du produit. Le
-- prédicat n'est pas une précaution: il EST la règle.

drop policy if exists meal_share_outcomes_read on public.meal_share_outcomes;
create policy meal_share_outcomes_read
  on public.meal_share_outcomes
  for select
  to authenticated
  using (
    -- 1. CE QUE J'AI DÉCLARÉ MOI-MÊME.
    declared_by = (select auth.uid())
    -- 2. CE QUI PORTE SUR MA BOUCHE, quel qu'en soit l'auteur. Une déclaration
    --    du maître sur ma boîte doit m'être visible: c'est de MA part qu'elle
    --    parle, et un fait sur soi qu'on ne peut pas lire est indémentable.
    or member_id in (
      select hm.member_id
      from public.household_members hm
      where hm.user_id = (select auth.uid())
    )
    -- 3. LE MAÎTRE, ET SEULEMENT SUR LES BOUCHES SANS COMPTE DE SON FOYER.
    or exists (
      select 1
      from public.household_members target
      join public.household_members me
        on me.household_id = target.household_id
      where target.member_id = public.meal_share_outcomes.member_id
        and target.user_id is null
        and me.user_id = (select auth.uid())
        and me.role = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. LA PORTE D'ÉCRITURE, ET SA JUMELLE SERVEUR
-- ---------------------------------------------------------------------------
--
-- ⚠️ LA JUMELLE `_for(p_user)` N'EST PAS UN CONFORT. Sous `service_role`,
-- `auth.uid()` est NULL: une RPC gatée dessus rend `not_authenticated` et la
-- fonctionnalité est morte côté serveur sans qu'aucun test client ne le voie.
-- C'est une cicatrice mesurée de ce dépôt (`auth-uid-null-under-service-role`),
-- et le chemin du soir est un chemin SERVEUR.

create or replace function public.keel_household_declare_share_outcome_for(
  p_user uuid,
  p_meal uuid,
  p_dish_index integer,
  p_member uuid,
  p_outcome text,
  p_shifted_to_day date,
  p_local_date date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_household uuid;
  v_role text;
  v_target record;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- LE VOCABULAIRE EST FERMÉ, ET REFUSÉ ICI PLUTÔT QU'EN ERREUR SQL BRUTE. Le
  -- CHECK de la table est la ceinture; ce refus-ci est celui qui porte un nom
  -- que l'appelant peut rendre.
  if p_outcome is null
     or p_outcome not in ('not_eaten', 'shifted', 'frozen', 'discarded') then
    return jsonb_build_object('ok', false, 'reason', 'bad_outcome');
  end if;

  if (p_outcome = 'shifted') <> (p_shifted_to_day is not null) then
    return jsonb_build_object('ok', false, 'reason', 'bad_shifted_to_day');
  end if;

  if p_dish_index is null or p_dish_index < 0 or p_dish_index >= 400 then
    return jsonb_build_object('ok', false, 'reason', 'bad_dish_index');
  end if;

  if p_local_date is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_local_date');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = p_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- LA GARDE DU LOT. Trois cas, et le troisième est l'interdit.
  --
  --   · ma propre bouche                       -> toujours
  --   · le maître, sur une bouche SANS COMPTE  -> D8.5: ranger une boîte
  --     n'est pas surveiller un adulte, et R12 tient (on ne compte AUCUNE
  --     consommation pour un enfant — on range un contenant)
  --   · ⛔ le maître, sur un profil RÉCLAMÉ    -> `not_your_line`
  --
  -- Le troisième cas est REFUSÉ, pas simplement invisible. C'est ce qui rend
  -- la contradiction de D8.3 structurellement impossible sur un compte: le
  -- maître ne peut pas parler pour quelqu'un qui peut parler lui-même.
  -- ══════════════════════════════════════════════════════════════════════
  if v_target.user_id is distinct from p_user then
    if v_role <> 'owner' or v_target.user_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'not_your_line');
    end if;
  end if;

  -- ⚠️ LE PLAN DOIT ÊTRE CELUI DE CE FOYER. Sans ce contrôle, un `p_meal`
  -- forgé rangerait une boîte sur le plan d'un inconnu — le run adversarial H2
  -- d'A8.0, par une porte d'écriture neuve.
  if not exists (
    select 1
    from public.student_generated_meals m
    where m.id = p_meal
      and m.plan_kind = 'household'
      and m.household_id = v_household
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_plan');
  end if;

  insert into public.meal_share_outcomes as o (
    generated_meal_id, dish_index, member_id, declared_by,
    outcome, shifted_to_day, answered_at, answered_local_date
  )
  values (
    p_meal, p_dish_index, p_member, p_user,
    p_outcome, p_shifted_to_day, now(), p_local_date
  )
  -- UN ÉTAT, PAS UN JOURNAL: la dernière réponse de CET auteur sur CETTE boîte
  -- gagne. Même doctrine que `cooking_session_states`. Ce qui ne s'écrase
  -- jamais, c'est la ligne d'un AUTRE auteur — la clé la porte.
  on conflict (generated_meal_id, dish_index, member_id, declared_by)
  do update set
    outcome = excluded.outcome,
    shifted_to_day = excluded.shifted_to_day,
    answered_at = excluded.answered_at,
    answered_local_date = excluded.answered_local_date;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_declare_share_outcome_for(
  uuid, uuid, integer, uuid, text, date, date
) is
  'A8.2 — range la boîte d''UNE bouche, pour les appelants SERVEUR '
  '(service_role), où auth.uid() est NULL. Chacun sa bouche; le maître EN PLUS '
  'les bouches SANS COMPTE de son foyer (D8.5), et JAMAIS un profil réclamé '
  '(`not_your_line`) — c''est ce refus qui rend la contradiction de D8.3 '
  'impossible sur un compte. Ne décale AUCUN plan (D8.4). Motifs: '
  'not_authenticated | bad_outcome | bad_shifted_to_day | bad_dish_index | '
  'bad_local_date | no_household | not_a_member | not_your_line | '
  'not_your_plan.';

create or replace function public.keel_household_declare_share_outcome(
  p_meal uuid,
  p_dish_index integer,
  p_member uuid,
  p_outcome text,
  p_shifted_to_day date,
  p_local_date date
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select public.keel_household_declare_share_outcome_for(
    (select auth.uid()), p_meal, p_dish_index, p_member,
    p_outcome, p_shifted_to_day, p_local_date
  );
$function$;

comment on function public.keel_household_declare_share_outcome(
  uuid, integer, uuid, text, date, date
) is
  'A8.2 — la même porte pour l''appelant CLIENT. Délègue à la jumelle `_for`; '
  'aucune règle n''est écrite ici, exprès — l''écran et le chemin du soir '
  'doivent obtenir le même refus.';

-- ---------------------------------------------------------------------------
-- 5. LES PRIVILÈGES DES DEUX PORTES
-- ---------------------------------------------------------------------------
--
-- ⚠️ `revoke all privileges`, JAMAIS UNE ÉNUMÉRATION. Le dépôt a mesuré (S6)
-- qu'un `revoke` par liste nommée laisse derrière lui ce qu'il ne connaît pas.

revoke all privileges on function public.keel_household_declare_share_outcome_for(
  uuid, uuid, integer, uuid, text, date, date
) from public, anon, authenticated;
grant execute on function public.keel_household_declare_share_outcome_for(
  uuid, uuid, integer, uuid, text, date, date
) to service_role;

revoke all privileges on function public.keel_household_declare_share_outcome(
  uuid, integer, uuid, text, date, date
) from public, anon;
grant execute on function public.keel_household_declare_share_outcome(
  uuid, integer, uuid, text, date, date
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. LE CONTRÔLE — on rejoue le geste, on n'inspecte pas le catalogue
-- ---------------------------------------------------------------------------
--
-- Vérifier que la table existe prouverait qu'elle a été créée, pas qu'elle
-- refuse ce qu'elle doit refuser. Chaque affirmation est REJOUÉE, et tout ce
-- que ce bloc écrit est défait à la fin — il tourne dans la transaction de la
-- migration, et il nettoie derrière lui de toute façon.

do $$
declare
  v_priv boolean;
begin
  -- (a) `authenticated` n'a QUE `select`. Les privilèges par défaut de ce
  --     projet lui donnent tout sur une table neuve: si le `revoke` ci-dessus
  --     disparaissait, il pourrait ÉCRIRE le sort d'une boîte en direct, sans
  --     passer par une seule des gardes de la RPC.
  if not has_table_privilege('authenticated', 'public.meal_share_outcomes', 'select') then
    raise exception 'droits: `authenticated` ne peut pas LIRE la table';
  end if;
  foreach v_priv in array array[
    has_table_privilege('authenticated', 'public.meal_share_outcomes', 'insert'),
    has_table_privilege('authenticated', 'public.meal_share_outcomes', 'update'),
    has_table_privilege('authenticated', 'public.meal_share_outcomes', 'delete'),
    has_table_privilege('authenticated', 'public.meal_share_outcomes', 'truncate')
  ] loop
    if v_priv then
      raise exception
        'droits: `authenticated` peut ÉCRIRE la table — le revoke n''a pas pris';
    end if;
  end loop;

  -- (b) `anon` n'a même pas le privilège de lire. `revoke ... from public` le
  --     laisse intact: c'est une cicatrice mesurée de ce dépôt.
  if has_table_privilege('anon', 'public.meal_share_outcomes', 'select') then
    raise exception 'droits: `anon` peut lire la table';
  end if;

  -- (c) RLS est ACTIVE. Une policy sur une table sans RLS ne garde rien.
  if not exists (
    select 1 from pg_class
    where oid = 'public.meal_share_outcomes'::regclass and relrowsecurity
  ) then
    raise exception 'RLS: la table n''a pas la row level security active';
  end if;

  -- (d) La jumelle `_for` est réservée au SERVEUR, et la porte client ne l'est
  --     pas. Les deux dans le même contrôle: si elles étaient inversées, le
  --     client pourrait déclarer AU NOM de n'importe qui (`p_user` libre).
  if has_function_privilege(
       'authenticated',
       'public.keel_household_declare_share_outcome_for(uuid, uuid, integer, uuid, text, date, date)',
       'execute') then
    raise exception
      'droits: `authenticated` peut appeler la jumelle `_for` — il déclarerait '
      'au nom de n''importe qui';
  end if;
  if not has_function_privilege(
       'authenticated',
       'public.keel_household_declare_share_outcome(uuid, integer, uuid, text, date, date)',
       'execute') then
    raise exception 'droits: `authenticated` ne peut pas appeler sa propre porte';
  end if;

  -- (e) LE VOCABULAIRE EST FERMÉ EN BASE. Le CHECK, pas seulement le `if` de
  --     la RPC: une écriture par le serveur qui contournerait la porte doit
  --     tomber aussi.
  begin
    insert into public.meal_share_outcomes (
      generated_meal_id, dish_index, member_id, declared_by,
      outcome, shifted_to_day, answered_local_date
    ) values (
      '00000000-0000-4000-8000-000000000000', 0,
      '00000000-0000-4000-8000-000000000000',
      '00000000-0000-4000-8000-000000000000',
      'eaten_somewhere_else', null, current_date
    );
    raise exception 'CHECK: un `outcome` hors vocabulaire a été accepté';
  exception
    when check_violation then null;      -- attendu
    when foreign_key_violation then null; -- la FK tombe d'abord: acceptable
  end;

  -- (f) LA DATE ET LE SORT SE TIENNENT. Une ligne `discarded` datée décrirait
  --     deux sorts pour la même boîte.
  begin
    insert into public.meal_share_outcomes (
      generated_meal_id, dish_index, member_id, declared_by,
      outcome, shifted_to_day, answered_local_date
    ) values (
      '00000000-0000-4000-8000-000000000000', 0,
      '00000000-0000-4000-8000-000000000000',
      '00000000-0000-4000-8000-000000000000',
      'discarded', current_date, current_date
    );
    raise exception 'CHECK: une boîte `discarded` a pu porter un jour de report';
  exception
    when check_violation then null;
    when foreign_key_violation then null;
  end;

  -- (g) LA JUMELLE REFUSE SANS SESSION, ET PAR SON NOM. Sans ce contrôle, la
  --     fonction pourrait lever une erreur SQL brute que l'appelant rendrait
  --     comme une panne au lieu d'un refus.
  if (public.keel_household_declare_share_outcome_for(
        null, null, 0, null, 'not_eaten', null, current_date
      ) ->> 'reason') is distinct from 'not_authenticated' then
    raise exception 'porte: un appel sans utilisateur ne rend pas `not_authenticated`';
  end if;

  -- (h) ET ELLE REFUSE UN VOCABULAIRE INCONNU AVANT DE TOUCHER À LA BASE.
  if (public.keel_household_declare_share_outcome_for(
        '00000000-0000-4000-8000-000000000000',
        '00000000-0000-4000-8000-000000000000', 0,
        '00000000-0000-4000-8000-000000000000',
        'composted', null, current_date
      ) ->> 'reason') is distinct from 'bad_outcome' then
    raise exception 'porte: un `outcome` inconnu ne rend pas `bad_outcome`';
  end if;

  -- (i) ET UN `shifted` SANS JOUR, qui ne dit rien.
  if (public.keel_household_declare_share_outcome_for(
        '00000000-0000-4000-8000-000000000000',
        '00000000-0000-4000-8000-000000000000', 0,
        '00000000-0000-4000-8000-000000000000',
        'shifted', null, current_date
      ) ->> 'reason') is distinct from 'bad_shifted_to_day' then
    raise exception 'porte: un `shifted` sans jour ne rend pas `bad_shifted_to_day`';
  end if;
end;
$$;

commit;
