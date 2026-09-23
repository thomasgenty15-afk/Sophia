-- ══════════════════════════════════════════════════════════════════════════
-- UNE NOTE COCHE LA CASE « REPAS LÉGER » — 2026-09-21
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── LE DÉFAUT QUE CETTE FONCTION FERME, MESURÉ SUR UN FOYER RÉEL ──────────
-- Note du 2026-09-20: « le matin c'est plutôt quelque chose de très léger…
-- fruit, bol de muesli, mais les œufs ça lui convient pas ». Ce qui a été
-- retenu: deux `food.prefer` et un `food.exclude`. La TAILLE du moment n'avait
-- aucune destination — et pourtant le levier existe depuis le 2026-09-07:
-- `household_member_habits.slots[].light`, lu par `parseMemberLight`, pesé par
-- `LIGHT_SLOT_WEIGHT` (0,15 · 0,25 · 0,20). Son petit-déjeuner est resté à
-- 500 kcal.
--
-- ── POURQUOI UN `_for`, ET PAS LA FONCTION QUI EXISTE ─────────────────────
-- `keel_household_set_member_habits` lit `auth.uid()`. Sous `service_role` —
-- c'est-à-dire depuis une fonction edge — `auth.uid()` est NULL, et elle rend
-- `not_authenticated` à chaque appel. Cicatrice nommée du dépôt, déjà payée
-- une fois sur les RPC de sécurité par bouche. La personne qui compose arrive
-- donc EN PARAMÈTRE, et la fonction n'est donnée qu'à `service_role`.
--
-- ── ⛔ ELLE FUSIONNE, ELLE NE REMPLACE PAS ────────────────────────────────
-- `keel_household_set_member_habits` réécrit `slots` EN ENTIER: c'est le geste
-- d'un écran qui affiche toutes les cases. Ici on répond à UNE phrase, sur UN
-- moment. Réécrire la colonne effacerait ce que la personne a déclaré
-- elle-même — le plat qu'elle prend à côté (`own_usual`), ses extras — sur une
-- note qui n'en parlait pas.
--
-- ── ⛔ ET SEULEMENT TROIS MOMENTS ─────────────────────────────────────────
-- `breakfast`, `lunch`, `dinner`. La liste est celle de `LIGHT_BEARING_SLOTS`
-- (`meal_extras.ts`), et l'écart est arithmétique: une collation pèse déjà
-- 0,10 de la journée, la marquer légère demanderait au plan ≈ 40 kcal. Un
-- moment accepté ici et jeté par `parseMemberLight` serait une écriture qui
-- réussit sans rien faire — le défaut d'origine de ce lot, vu par l'autre bout.

create or replace function public.keel_household_set_slot_light_for(
  p_user uuid,
  p_member uuid,
  p_slot text,
  p_light boolean
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
  v_slot text := nullif(btrim(coalesce(p_slot, '')), '');
  v_slots jsonb;
  v_next jsonb;
  v_found boolean := false;
  v_entry jsonb;
  v_previous boolean;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;
  if p_light is null then
    -- ⛔ BOOLÉEN STRICT, COMME LA CONTRAINTE DE COLONNE. Un `null` n'est pas
    -- « pas léger »: c'est « on ne m'a rien dit », et l'écrire poserait une
    -- déclaration que personne n'a faite.
    return jsonb_build_object('ok', false, 'reason', 'bad_light');
  end if;
  if v_slot is null or v_slot not in ('breakfast', 'lunch', 'dinner') then
    return jsonb_build_object('ok', false, 'reason', 'bad_slot');
  end if;

  -- ⛔ LES MÊMES TROIS GARDES QUE `keel_household_set_member_appetite_for`,
  -- DANS LE MÊME ORDRE. Le seul écart est d'où vient l'utilisateur.
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = p_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select hm.member_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
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
  -- ⚠️ LE PREMIER GAGNE, comme `parseMemberLight` côté lecture: deux entrées
  -- d'un même moment sont une erreur d'écrivain, et en fusionner les réponses
  -- inventerait une déclaration que personne n'a faite.
  v_next := '[]'::jsonb;
  for v_entry in select * from jsonb_array_elements(v_slots) loop
    if not v_found
       and jsonb_typeof(v_entry) = 'object'
       and (v_entry ->> 'slot') = v_slot then
      if jsonb_typeof(v_entry -> 'light') = 'boolean' then
        v_previous := (v_entry ->> 'light')::boolean;
      end if;
      v_next := v_next || jsonb_build_array(
        v_entry || jsonb_build_object('light', p_light)
      );
      v_found := true;
    else
      v_next := v_next || jsonb_build_array(v_entry);
    end if;
  end loop;

  if not v_found then
    -- ⚠️ UNE ENTRÉE SANS `kind`, ET C'EST VOULU. `parseMemberHabits` jette les
    -- entrées sans prose (une entrée muette fait inventer le modèle), et
    -- `parseMemberLight` les garde: les deux lisent la MÊME colonne avec deux
    -- questions. Écrire `kind: 'household_dish'` ici ferait dire à la fiche
    -- « elle mange le plat de la maison à ce moment » — un fait que la note
    -- n'a pas déclaré.
    if jsonb_array_length(v_next) >= 6 then
      return jsonb_build_object('ok', false, 'reason', 'slots_full');
    end if;
    v_next := v_next || jsonb_build_array(
      jsonb_build_object('slot', v_slot, 'light', p_light)
    );
  end if;

  -- RIEN À FAIRE EST UN REFUS, PAS UN SUCCÈS. Sans ce motif, un appelant qui
  -- recoche la même case lirait « écrit » et compterait un mouvement qui n'a
  -- pas eu lieu — le compteur dirait que la mémoire agit alors qu'elle répète.
  if v_previous is not null and v_previous = p_light then
    return jsonb_build_object(
      'ok', false, 'reason', 'unchanged', 'light', p_light
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

  return jsonb_build_object('ok', true, 'slot', v_slot, 'light', p_light);
end;
$function$;

comment on function public.keel_household_set_slot_light_for(uuid, uuid, text, boolean) is
  'Coche ou décoche « repas léger » sur UN moment d''UNE bouche, depuis une '
  'note de brouillon (tiroir 6, 2026-09-21). `p_user` EN PARAMÈTRE: sous '
  'service_role, auth.uid() est NULL et la fonction de l''écran rendrait '
  'not_authenticated à chaque appel. FUSIONNE dans `slots` au lieu de la '
  'réécrire: une phrase sur le matin ne doit pas effacer ce que la personne a '
  'déclaré pour le soir. Trois moments seulement (breakfast|lunch|dinner), la '
  'liste de LIGHT_BEARING_SLOTS — une collation pèse déjà 0,10 de la journée. '
  'Motifs: no_user | bad_light | bad_slot | no_household | not_owner | '
  'not_a_member | bad_slots | slots_full | unchanged.';

-- ⛔ `service_role` SEUL. `p_user` est un paramètre qu'on pourrait mentir; un
-- rôle qui peut déjà écrire toute la table ne gagne rien à le faire, et
-- `authenticated` y gagnerait la fiche des autres foyers.
revoke all on function public.keel_household_set_slot_light_for(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.keel_household_set_slot_light_for(uuid, uuid, text, boolean)
  to service_role;
