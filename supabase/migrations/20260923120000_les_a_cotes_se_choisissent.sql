-- ═══════════════════════════════════════════════════════════════════════════
-- LES À-CÔTÉS SE CHOISISSENT, PERSONNE PAR PERSONNE ET MOMENT PAR MOMENT
-- 2026-09-23
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chantier: plan « assiettes normales » du 2026-09-23 (décision 2 du
-- propriétaire), audit `docs/keel/AUDIT-DOSAGES-2026-09-23.md`.
-- Patrons: `20260907170000_le_repas_leger_est_un_choix_par_moment.sql` (la
-- clé et sa contrainte) et `20260921210000_une_note_coche_la_case_repas_leger.sql`
-- (la RPC `_for` qui fusionne UNE clé depuis une note).
--
-- ── CE QUE LE RÉGLAGE DIT ────────────────────────────────────────────────
-- Le moteur sert désormais un petit à-côté au déjeuner et au dîner (entrée,
-- fromage, dessert, pain), choisi selon l'objectif de la personne. Ce réglage
-- dit, type par type, ce que la personne veut À LA PLACE du défaut:
--
--   [{"slot":"dinner","side_courses":{"dessert":false,"cheese":true}}]
--
-- TROIS ÉTATS PAR TYPE, ET LA CLÉ ABSENTE EST LE PREMIER:
--   · type ABSENT ⇒ le défaut de l'objectif (le moteur décide);
--   · `false`     ⇒ jamais ce type à ce moment;
--   · `true`      ⇒ toujours ce type à ce moment.
-- ⚠️ Les deux premiers DOIVENT rester distincts: un écran qui les confond
-- repose la question à quelqu'un qui a déjà répondu (cicatrice
-- `jsonb-default-hides-answered-vs-unasked`). D'où ni valeur par défaut, ni
-- rétro-remplissage: cette migration n'écrit AUCUNE donnée.
--
-- ⛔ AUCUNE COLONNE NEUVE, pour la raison que les extras et le « léger » ont
-- déjà donnée: `household_member_habits.slots` est clé par (bouche, moment) et
-- déjà bornée. Une colonne jumelle ferait deux endroits où lire « ce qui se
-- passe à ce moment-là ».
--
-- ⛔ ET PAS `household_members.takes_dessert / takes_cheese / takes_bread`.
-- Ces trois colonnes portaient le sens INVERSE (« ce que la personne prend
-- déjà à côté, à retrancher du plat »), elles ne sont plus lues depuis le
-- 2026-09-10 et leurs valeurs sont périmées. Les relire ferait servir un
-- dessert à quelqu'un parce qu'il avait dit en août qu'il en prenait déjà un.
--
-- ⛔ DEUX MOMENTS SEULEMENT: `lunch`, `dinner`. C'est la liste de
-- `SIDE_COURSE_SLOTS` (`_shared/keel/side_courses_types.ts`): le moteur ne sert
-- d'à-côté qu'au déjeuner et au dîner. Un réglage accepté au petit-déjeuner
-- serait une écriture qui réussit sans rien faire — la contrainte le refuse,
-- et `parseMemberSideCourses` le jette de la même façon.
--
-- ── ⚠️ HORODATAGE ──────────────────────────────────────────────────────────
-- Le dernier registre appliqué en local est `20260922201500`. Une migration
-- antérieure au dernier registre est SAUTÉE EN SILENCE par la CLI (cicatrice
-- `out-of-order-migration-is-silently-skipped`): celle-ci est donc datée après.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LA FORME EST TENUE EN BASE, PAS SEULEMENT PAR LE PARSEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ MÊME RAISON QUE `extras` ET `light`: le parseur ÉCARTE ce qu'il ne
-- reconnaît pas, en silence et par conception. Un `side_courses` mal formé se
-- lirait « rien de réglé » — quelqu'un aurait dit « jamais de dessert » et on
-- lui en servirait, sans une erreur nulle part. Le refus doit arriver à
-- L'ÉCRITURE.
--
-- ⛔ UNE FONCTION, PARCE QU'UNE CONTRAINTE `check` N'ACCEPTE PAS DE
-- SOUS-REQUÊTE — la raison écrite dans `keel_habit_extras_ok`.
create or replace function public.keel_habit_side_courses_ok(p_slots jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- ⚠️ UN `slots` QUI N'EST PAS UN TABLEAU REND `true` ICI, ET CE N'EST PAS UN
  -- TROU: `household_member_habits_slots_check` le refuse déjà. Rendre un
  -- verdict sur une forme dont une autre contrainte est propriétaire ferait
  -- deux erreurs pour un seul défaut. Mot pour mot le raisonnement de
  -- `keel_habit_extras_ok` et de `keel_habit_light_ok`.
  select case
    when pg_catalog.jsonb_typeof(p_slots) <> 'array' then true
    else coalesce(
      (
        select bool_and(
          -- ⛔ UN `case` ET PAS UN `and`: SQL ne garantit pas l'ordre
          -- d'évaluation d'un `and`, et `jsonb_each` sur une CHAÎNE lève
          -- `cannot call jsonb_each on a non-object` — une exception au lieu
          -- d'un refus lisible. Le `case`, lui, évalue ses branches dans
          -- l'ordre.
          case
            when pg_catalog.jsonb_typeof(entry -> 'side_courses') <> 'object' then false
            when (entry ->> 'slot') is null
              or (entry ->> 'slot') not in ('lunch', 'dinner') then false
            else not exists (
              select 1
              from pg_catalog.jsonb_each(entry -> 'side_courses') as kv(key, value)
              where kv.key not in ('starter', 'cheese', 'dessert', 'bread')
                 -- ⛔ BOOLÉEN STRICT: `"yes"`, `1`, `"true"` sont refusés.
                 -- Deviner ici ferait passer en base ce que le lecteur jette.
                 or pg_catalog.jsonb_typeof(kv.value) <> 'boolean'
            )
          end
        )
        from pg_catalog.jsonb_array_elements(p_slots) as entry
        -- ⛔ `jsonb_typeof(entry) = 'object'` D'ABORD. Sur une entrée qui est
        -- la CHAÎNE "side_courses", `?` rend vrai et `->` rend NULL. Même
        -- piège que pour les extras et le léger.
        where pg_catalog.jsonb_typeof(entry) = 'object' and entry ? 'side_courses'
      ),
      -- ⚠️ AUCUNE ENTRÉE NE PORTE LA CLÉ ⇒ `true`. C'est le cas de TOUTE la
      -- base d'avant ce lot: `bool_and` sur zéro ligne rend NULL, et une
      -- contrainte qui rend NULL passe — mais par accident. On le dit.
      true
    )
  end;
$$;

comment on function public.keel_habit_side_courses_ok(jsonb) is
  '2026-09-23 — valide la clé `side_courses` des entrées de '
  '`household_member_habits.slots`: un objet dont les clés sont parmi '
  'starter|cheese|dessert|bread et les valeurs des booléens stricts, et '
  'seulement sur lunch|dinner (SIDE_COURSE_SLOTS). Existe UNIQUEMENT parce '
  'qu''une contrainte `check` n''accepte pas de sous-requête; ne pas '
  'l''appeler ailleurs.';

alter table public.household_member_habits
  drop constraint if exists household_member_habits_side_courses_check;
alter table public.household_member_habits
  add constraint household_member_habits_side_courses_check
  check (public.keel_habit_side_courses_ok(slots));

comment on constraint household_member_habits_side_courses_check
  on public.household_member_habits is
  '2026-09-23 — `side_courses` est facultatif sur une entrée de moment. Type '
  'ABSENT = le défaut de l''objectif (le moteur décide); `false` = jamais ce '
  'type à ce moment; `true` = toujours. Les quatre jetons sont ceux de '
  '`SIDE_COURSE_KINDS` (`_shared/keel/side_courses_types.ts`), les deux '
  'moments ceux de `SIDE_COURSE_SLOTS`.';

comment on column public.household_member_habits.slots is
  'Les moments de la bouche. Chaque entrée: slot, kind, usual, et trois clés '
  'FACULTATIVES qui ne parlent qu''au calcul — « extras » (plus lue depuis le '
  '2026-09-10), « light » (ce moment pèse moins que d''habitude, '
  'petit-déjeuner/midi/soir) et « side_courses » (les à-côtés voulus ou '
  'refusés, midi/soir, un booléen par type). Pour toutes, la clé ABSENTE et la '
  'réponse négative sont des états DISTINCTS: absente = la question n''a pas '
  'été posée. Aucune valeur par défaut, aucun rétro-remplissage.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LA PORTE D'ÉCRITURE DE LA MÉMOIRE — UNE CLÉ, UN MOMENT, UNE BOUCHE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── POURQUOI UN `_for` ────────────────────────────────────────────────────
-- L'appelant est `draft_note_classify_io.ts` (une note sur un plan, ou le
-- retour de fin de plan, qui passe par le même classifieur), sous
-- `service_role`: `auth.uid()` y est NULL (cicatrice
-- `auth-uid-null-under-service-role`). La personne qui a écrit la note arrive
-- donc EN PARAMÈTRE, et la fonction n'est donnée qu'à `service_role`.
--
-- ── ⛔ ELLE FUSIONNE, ELLE NE REMPLACE PAS ────────────────────────────────
-- « Il ne prend jamais de dessert le soir » parle d'UN type à UN moment.
-- Réécrire `slots` effacerait ce que la personne a déclaré elle-même — son
-- plat à elle (`own_usual`), son « léger », les autres types d'à-côtés — sur
-- une phrase qui n'en parlait pas.
--
-- ── ⚠️ L'ÉCART AVEC LE MODÈLE `set_slot_light_for`: LE MEMBRE ÉCRIT SA LIGNE ─
-- Le modèle ne laisse écrire que le titulaire (`not_owner`). Ici la règle est
-- celle de `keel_household_set_member_habits`, mot pour mot: le titulaire
-- vise n'importe quelle bouche de son foyer; un membre non-titulaire ne vise
-- que SA propre ligne; sinon `not_your_line`. Décision du propriétaire du
-- 2026-09-23: « la personne peut le changer elle-même ». Le réglage vit dans
-- `household_member_habits`, où un membre écrit déjà sa ligne par l'écran —
-- la mémoire ne lui donne pas un droit qu'il n'a pas.
--
-- ── `p_takes` À NULL RETIRE LA CLÉ ───────────────────────────────────────
-- C'est le retour au défaut de l'objectif (« Auto » à l'écran). Une entrée
-- qui n'a plus rien à dire (ni `side_courses`, ni rien d'autre que `slot`)
-- est retirée du tableau: elle occuperait une des six places pour rien.
create or replace function public.keel_household_set_slot_side_courses_for(
  p_user uuid,
  p_member uuid,
  p_slot text,
  p_kind text,
  p_takes boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_household uuid;
  v_role text;
  v_target uuid;
  v_target_user uuid;
  v_slot text := nullif(btrim(coalesce(p_slot, '')), '');
  v_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  v_slots jsonb;
  v_next jsonb;
  v_found boolean := false;
  v_entry jsonb;
  v_side jsonb;
  v_previous boolean;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;
  -- ⛔ LES DEUX MOMENTS DE `SIDE_COURSE_SLOTS`, ET PAS UN DE PLUS. Un réglage
  -- accepté au petit-déjeuner serait une écriture que la contrainte refuserait
  -- ensuite — mieux vaut un motif nommé qu'une `check_violation`.
  if v_slot is null or v_slot not in ('lunch', 'dinner') then
    return jsonb_build_object('ok', false, 'reason', 'bad_slot');
  end if;
  if v_kind is null or v_kind not in ('starter', 'cheese', 'dessert', 'bread') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;

  -- ⛔ LES GARDES DE `keel_household_set_member_habits`, DANS LE MÊME ORDRE.
  -- Le seul écart est d'où vient l'utilisateur (paramètre, pas `auth.uid()`),
  -- et le motif `no_household`, gardé du modèle `set_slot_light_for` parce
  -- qu'il sépare « pas de foyer » de « pas cette bouche » dans le journal de
  -- l'appelant.
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = p_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  select hm.member_id, hm.user_id into v_target, v_target_user
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if v_role <> 'owner' and v_target_user is distinct from p_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  select coalesce(h.slots, '[]'::jsonb) into v_slots
  from public.household_member_habits h
  where h.member_id = v_target;

  v_slots := coalesce(v_slots, '[]'::jsonb);
  if jsonb_typeof(v_slots) <> 'array' then
    -- Une colonne qu'on ne sait pas ouvrir ne se « répare » pas en l'écrasant:
    -- on ne sait pas ce qu'elle portait.
    return jsonb_build_object('ok', false, 'reason', 'bad_slots');
  end if;

  -- ── LA FUSION, ENTRÉE PAR ENTRÉE ────────────────────────────────────────
  -- ⚠️ LE PREMIER GAGNE, comme `parseMemberSideCourses` côté lecture: deux
  -- entrées d'un même moment sont une erreur d'écrivain, et fusionner leurs
  -- réponses inventerait une déclaration que personne n'a faite.
  v_next := '[]'::jsonb;
  for v_entry in select * from jsonb_array_elements(v_slots) loop
    if not v_found
       and jsonb_typeof(v_entry) = 'object'
       and (v_entry ->> 'slot') = v_slot then
      v_found := true;
      v_side := coalesce(v_entry -> 'side_courses', '{}'::jsonb);
      if jsonb_typeof(v_side) <> 'object' then
        -- Même raison que `bad_slots`: la contrainte l'interdit, et si elle
        -- existe quand même on ne sait pas ce qu'elle voulait dire.
        return jsonb_build_object('ok', false, 'reason', 'bad_slots');
      end if;
      if jsonb_typeof(v_side -> v_kind) = 'boolean' then
        v_previous := (v_side ->> v_kind)::boolean;
      end if;
      if p_takes is null then
        v_side := v_side - v_kind;
      else
        v_side := v_side || jsonb_build_object(v_kind, p_takes);
      end if;
      if v_side = '{}'::jsonb then
        v_entry := v_entry - 'side_courses';
      else
        v_entry := v_entry || jsonb_build_object('side_courses', v_side);
      end if;
      -- Une entrée réduite à son seul moment ne dit plus rien: elle part.
      if v_entry - 'slot' <> '{}'::jsonb then
        v_next := v_next || jsonb_build_array(v_entry);
      end if;
    else
      v_next := v_next || jsonb_build_array(v_entry);
    end if;
  end loop;

  -- RIEN À FAIRE EST UN REFUS, PAS UN SUCCÈS. Sans ce motif, un appelant qui
  -- redit la même chose lirait « écrit » et compterait un mouvement qui n'a
  -- pas eu lieu — le compteur dirait que la mémoire agit alors qu'elle répète.
  -- Les deux cas: la même valeur, ou retirer une clé qui n'était pas là.
  if (p_takes is not null and v_previous is not null and v_previous = p_takes)
     or (p_takes is null and v_previous is null) then
    return jsonb_build_object(
      'ok', false, 'reason', 'unchanged', 'kind', v_kind, 'takes', p_takes
    );
  end if;

  if not v_found then
    -- ⚠️ UNE ENTRÉE SANS `kind`, ET C'EST VOULU — la raison écrite dans
    -- `keel_household_set_slot_light_for`: `parseMemberHabits` jette les
    -- entrées sans prose, `parseMemberSideCourses` les garde. Écrire
    -- `kind: 'household_dish'` ferait dire à la fiche un fait que la note n'a
    -- pas déclaré.
    if jsonb_array_length(v_next) >= 6 then
      return jsonb_build_object('ok', false, 'reason', 'slots_full');
    end if;
    v_next := v_next || jsonb_build_array(
      jsonb_build_object(
        'slot', v_slot,
        'side_courses', jsonb_build_object(v_kind, p_takes)
      )
    );
  end if;

  insert into public.household_member_habits
    (member_id, household_id, slots, updated_by, updated_at)
  values
    (v_target, v_household, v_next, p_user, now())
  on conflict (member_id) do update
    set slots = excluded.slots,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true, 'slot', v_slot, 'kind', v_kind, 'takes', p_takes,
    'previous', v_previous
  );
end;
$function$;

comment on function public.keel_household_set_slot_side_courses_for(uuid, uuid, text, text, boolean) is
  'Pose (true/false) ou retire (null) le réglage d''UN type d''à-côté '
  '(starter|cheese|dessert|bread) sur UN moment (lunch|dinner) d''UNE bouche, '
  'depuis une note de brouillon ou un retour de fin de plan (2026-09-23). '
  '`p_user` EN PARAMÈTRE: sous service_role, auth.uid() est NULL. FUSIONNE '
  'dans `slots` au lieu de la réécrire. Accès: le titulaire vise toute bouche '
  'de son foyer, un membre sa seule ligne. Motifs: no_user | bad_slot | '
  'bad_kind | no_household | not_a_member | not_your_line | bad_slots | '
  'slots_full | unchanged.';

-- ⛔ `service_role` SEUL. `p_user` est un paramètre qu'on pourrait mentir; un
-- rôle qui peut déjà écrire toute la table ne gagne rien à le faire, et
-- `authenticated` y gagnerait la fiche des autres foyers.
revoke all on function public.keel_household_set_slot_side_courses_for(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.keel_household_set_slot_side_courses_for(uuid, uuid, text, text, boolean)
  to service_role;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. BLOC DE CONTRÔLE — ON REJOUE LES GESTES, PUIS ON ANNULE TOUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⛔ LE CAS QUI PASSE EST ÉCRIT EN PREMIER, ET C'EST DÉLIBÉRÉ. Une contrainte
-- ou une porte cassée qui refuse TOUT ressemble exactement à une qui marche
-- (`guards-need-a-passing-case`).
--
-- ⚠️ ON EMPRUNTE DEUX COMPTES EXISTANTS SANS FOYER, ON N'EN CRÉE PAS — le
-- patron de `20260814100000_household_member_habits.sql`. Écrire dans
-- `auth.users` depuis une migration est accepté en local et refusé en prod.
-- Sans deux comptes libres, la partie « porte » est sautée et le DIT; la
-- partie « contrainte » n'a besoin d'aucun compte et tourne toujours.
--
-- Tout est annulé par une exception nommée, rattrapée en fin de bloc.
do $$
declare
  v_owner_user uuid;
  v_member_user uuid;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_adult uuid;
  v_res jsonb;
  v_slots jsonb;
  v_refused int := 0;
  v_case text;
begin
  insert into public.households (name) values ('__qa_side_courses__')
  returning id into v_house;
  insert into public.household_members (household_id, first_name, role)
  values (v_house, 'Enfant', 'member')
  returning member_id into v_kid;

  -- ── ⓐ LA CONTRAINTE — LE CAS NOMINAL D'ABORD ────────────────────────────
  insert into public.household_member_habits (member_id, household_id, slots)
  values (
    v_kid, v_house,
    '[{"slot":"dinner","kind":"household_dish","usual":"","light":true,
       "side_courses":{"dessert":false,"cheese":true}},
      {"slot":"lunch","side_courses":{}},
      {"slot":"breakfast","kind":"own_usual","usual":"une pomme"}]'::jsonb
  );
  delete from public.household_member_habits where member_id = v_kid;

  -- ── ⓑ LA CONTRAINTE MORD ────────────────────────────────────────────────
  foreach v_case in array array[
    '[{"slot":"breakfast","side_courses":{"dessert":false}}]',  -- moment sans à-côté
    '[{"slot":"snack_pm","side_courses":{"bread":true}}]',      -- collation
    '[{"slot":"dinner","side_courses":{"soup":true}}]',         -- type inconnu
    '[{"slot":"dinner","side_courses":{"dessert":"no"}}]',      -- pas un booléen
    '[{"slot":"dinner","side_courses":["dessert"]}]',           -- pas un objet
    '[{"slot":"dinner","side_courses":"dessert"}]',             -- une chaîne
    '[{"side_courses":{"dessert":false}}]'                      -- aucun moment
  ] loop
    begin
      insert into public.household_member_habits (member_id, household_id, slots)
      values (v_kid, v_house, v_case::jsonb);
      raise exception 'side_courses: NON REFUSÉ, et il aurait dû l''être: %', v_case;
    exception when check_violation then
      v_refused := v_refused + 1;
    end;
  end loop;
  if v_refused <> 7 then
    raise exception 'side_courses: % refus sur 7 attendus', v_refused;
  end if;

  -- ── ⓒ LA PORTE — SEULEMENT AVEC DEUX COMPTES LIBRES ─────────────────────
  select u.id into v_owner_user
  from auth.users u
  where public.keel_household_of(u.id) is null
  order by u.created_at
  limit 1;
  select u.id into v_member_user
  from auth.users u
  where public.keel_household_of(u.id) is null and u.id <> v_owner_user
  order by u.created_at
  limit 1;

  if v_owner_user is null or v_member_user is null then
    raise notice 'side_courses: moins de deux comptes sans foyer, contrôle de la porte sauté';
  else
    insert into public.household_members (household_id, user_id, role, first_name)
    values (v_house, v_owner_user, 'owner', 'Titulaire')
    returning member_id into v_owner;
    insert into public.household_members (household_id, user_id, role, first_name)
    values (v_house, v_member_user, 'member', 'Adulte')
    returning member_id into v_adult;

    -- LE CAS QUI PASSE: le titulaire écrit sur une bouche sans compte, et la
    -- fusion garde ce qui était là (le « léger » du dîner).
    insert into public.household_member_habits (member_id, household_id, slots)
    values (v_kid, v_house, '[{"slot":"dinner","light":true}]'::jsonb);
    v_res := public.keel_household_set_slot_side_courses_for(
      v_owner_user, v_kid, 'dinner', 'dessert', false);
    if v_res ->> 'ok' is distinct from 'true' then
      raise exception 'side_courses: le titulaire ne peut pas écrire sur une bouche sans compte: %', v_res;
    end if;
    select slots into v_slots from public.household_member_habits where member_id = v_kid;
    if v_slots <> '[{"slot":"dinner","light":true,"side_courses":{"dessert":false}}]'::jsonb then
      raise exception 'side_courses: la fusion a perdu ou mal posé une clé: %', v_slots;
    end if;

    -- La même phrase une seconde fois ne bouge rien, et le DIT.
    v_res := public.keel_household_set_slot_side_courses_for(
      v_owner_user, v_kid, 'dinner', 'dessert', false);
    if v_res ->> 'reason' is distinct from 'unchanged' then
      raise exception 'side_courses: une répétition n''est pas rendue `unchanged`: %', v_res;
    end if;

    -- `null` retire la clé; l'entrée garde son « léger ».
    v_res := public.keel_household_set_slot_side_courses_for(
      v_owner_user, v_kid, 'dinner', 'dessert', null);
    select slots into v_slots from public.household_member_habits where member_id = v_kid;
    if v_res ->> 'ok' is distinct from 'true'
       or v_slots <> '[{"slot":"dinner","light":true}]'::jsonb then
      raise exception 'side_courses: le retour au défaut n''a pas retiré la clé: % / %', v_res, v_slots;
    end if;

    -- Un moment absent se crée, sans `kind`.
    v_res := public.keel_household_set_slot_side_courses_for(
      v_owner_user, v_kid, 'lunch', 'cheese', true);
    select slots into v_slots from public.household_member_habits where member_id = v_kid;
    if v_res ->> 'ok' is distinct from 'true'
       or v_slots <> '[{"slot":"dinner","light":true},{"slot":"lunch","side_courses":{"cheese":true}}]'::jsonb then
      raise exception 'side_courses: l''entrée neuve est mal formée: % / %', v_res, v_slots;
    end if;

    -- Un membre écrit SA ligne…
    v_res := public.keel_household_set_slot_side_courses_for(
      v_member_user, v_adult, 'lunch', 'bread', false);
    if v_res ->> 'ok' is distinct from 'true' then
      raise exception 'side_courses: un membre ne peut pas écrire sa propre ligne: %', v_res;
    end if;
    -- …et pas celle d'un autre.
    if public.keel_household_set_slot_side_courses_for(
         v_member_user, v_kid, 'lunch', 'bread', false) ->> 'reason' is distinct from 'not_your_line' then
      raise exception 'side_courses: un membre écrit sur une ligne qui n''est pas la sienne';
    end if;

    -- Les refus nommés.
    if public.keel_household_set_slot_side_courses_for(
         v_owner_user, v_kid, 'breakfast', 'dessert', false) ->> 'reason' is distinct from 'bad_slot' then
      raise exception 'side_courses: un petit-déjeuner n''est pas refusé `bad_slot`';
    end if;
    if public.keel_household_set_slot_side_courses_for(
         v_owner_user, v_kid, 'dinner', 'soup', false) ->> 'reason' is distinct from 'bad_kind' then
      raise exception 'side_courses: un type inconnu n''est pas refusé `bad_kind`';
    end if;
    if public.keel_household_set_slot_side_courses_for(
         v_owner_user, gen_random_uuid(), 'dinner', 'dessert', false) ->> 'reason' is distinct from 'not_a_member' then
      raise exception 'side_courses: une bouche hors foyer n''est pas refusée `not_a_member`';
    end if;
    if public.keel_household_set_slot_side_courses_for(
         gen_random_uuid(), v_kid, 'dinner', 'dessert', false) ->> 'reason' is distinct from 'no_household' then
      raise exception 'side_courses: un compte sans foyer n''est pas refusé `no_household`';
    end if;
  end if;

  raise notice
    'household_member_habits_side_courses_check: 1 passage, 7 refus; '
    'keel_household_set_slot_side_courses_for: fusion, répétition, retour au '
    'défaut, entrée neuve, droits du membre et quatre refus — vérifiés';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;
