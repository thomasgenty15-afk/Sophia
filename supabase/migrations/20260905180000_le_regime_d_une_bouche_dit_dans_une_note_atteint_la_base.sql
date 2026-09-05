-- ════════════════════════════════════════════════════════════════════════════
-- LE RÉGIME OU L'ALLERGIE D'UNE BOUCHE, DIT DANS UNE NOTE, ATTEINT LA BASE
--
-- ── LE DÉFAUT, MESURÉ ──────────────────────────────────────────────────────
-- « Mon fils est devenu végétarien », « Tom est allergique aux arachides »,
-- écrits dans le retour sur un brouillon de plan, passent par le canal
-- sécurité du classifieur (`draft_note_safety_io.ts`), qui appelle pour une
-- bouche nommée `keel_household_set_member_diet` ou `keel_household_add_allergy`
-- avec le client `service_role`. Les deux RPC lisent `auth.uid()`, qui est
-- NULL sous ce rôle, et rendent `{"ok":false,"reason":"not_authenticated"}`
-- (joué le 2026-09-05 dans une transaction `set local role service_role`).
--
-- ⇒ Le régime ou l'allergie d'un ENFANT déclaré dans une note n'a JAMAIS été
-- écrit. Le compteur `failed` le disait dans un journal ; l'accusé « j'ai
-- noté » ne nomme que ce qui est écrit, donc la personne ne l'a jamais su.
-- Mesuré une première fois le 2026-09-03 sur la phrase 9 du banc des trois
-- portes ; réparé ici.
--
-- ── LA FORME : UNE VARIANTE `_for`, JAMAIS LA GARDE RETIRÉE ────────────────
-- Patron de `keel_write_retained_items_for` (20260818250000) : `p_user` à la
-- place de `auth.uid()`, et le `grant` à `service_role` SEUL. Un rôle qui
-- peut déjà écrire toute la table ne gagne rien à mentir sur `p_user` ; un
-- rôle qui ne le peut pas n'a pas `execute`. Les RPC d'écran gardent leur
-- garde `auth.uid()` intacte : ce fichier n'y touche pas.
--
-- ⛔ MÊMES REFUS QUE LES RPC D'ÉCRAN, DANS LE MÊME ORDRE, MÊMES MOTIFS. Le
-- classifieur ne doit pas pouvoir écrire ce que l'écran refuserait : un régime
-- sur une bouche qui a un compte (`has_account` — son régime vit dans SON
-- « about you », et le roster ne lirait pas la colonne : no-op silencieux),
-- une bouche hors du foyer de `p_user` (`not_a_member`), un régime hors des
-- quatre (`bad_diet`), une allergie posée par un non-maître (`not_owner`).
--
-- ⚠️ `has_function_privilege('anon', …)` DOIT ÊTRE FAUX APRÈS CE FICHIER. Les
-- privilèges par défaut donnent `execute` à `public` sur une fonction neuve,
-- et `revoke from public` seul laisse `anon` et `authenticated` : la liste du
-- `revoke` est écrite en entier, comme dans le patron.
-- ════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Le régime d'une bouche, pour le compte de `p_user`
-- ---------------------------------------------------------------------------
create or replace function public.keel_household_set_member_diet_for(
  p_user uuid,
  p_member uuid,
  p_diet text
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
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  if p_diet is not null and p_diet not in (
    'omnivore', 'vegetarian', 'vegan', 'pescatarian'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_diet');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = p_user;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_role <> 'owner' and v_target.user_id is distinct from p_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;

  update public.household_members
     set diet = p_diet
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_diet_for(uuid, uuid, text) is
  'Variante SERVEUR de `keel_household_set_member_diet` : `p_user` remplace '
  '`auth.uid()`, NULL sous `service_role`. Appelée par le canal sécurité du '
  'classifieur de notes (`draft_note_safety_io.ts`) quand une note nomme une '
  'bouche. Mêmes refus que l''écran : `no_user`, `bad_diet`, `not_a_member`, '
  '`not_your_line`, `has_account`. `service_role` seul.';

revoke all on function public.keel_household_set_member_diet_for(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_household_set_member_diet_for(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. L'allergie d'une bouche, pour le compte de `p_user`
-- ---------------------------------------------------------------------------
create or replace function public.keel_household_add_allergy_for(
  p_user uuid,
  p_member uuid,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_household uuid;
  v_role text;
  v_label text := btrim(coalesce(p_label, ''));
  v_target uuid;
  v_id uuid;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'bad_label');
  end if;

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

  insert into public.household_member_allergies
    (household_id, member_id, label, created_by)
  values (v_household, v_target, v_label, p_user)
  on conflict (member_id, label) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'allergy_id', v_id);
end;
$function$;

comment on function public.keel_household_add_allergy_for(uuid, uuid, text) is
  'Variante SERVEUR de `keel_household_add_allergy` : `p_user` remplace '
  '`auth.uid()`. Appelée par le canal sécurité du classifieur de notes pour '
  'une allergie ou une intolérance d''une bouche nommée. Mêmes refus que '
  'l''écran : `no_user`, `bad_label`, `no_household`, `not_owner`, '
  '`not_a_member`. `service_role` seul.';

revoke all on function public.keel_household_add_allergy_for(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_household_add_allergy_for(uuid, uuid, text)
  to service_role;
