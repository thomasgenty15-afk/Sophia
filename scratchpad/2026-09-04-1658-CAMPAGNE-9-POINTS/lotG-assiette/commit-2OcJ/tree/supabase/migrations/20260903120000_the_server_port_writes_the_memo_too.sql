-- ═══════════════════════════════════════════════════════════════════════════
-- LE PORT D'ÉCRITURE SERVEUR ÉCRIT AUSSI LE MÉMO — lot A du chantier « la
-- mémoire à trois destinations » (2026-09-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2.2 ③, §4-ter.
--
-- ── LE DÉFAUT QUE ÇA FERME ────────────────────────────────────────────────
-- Le mémo (`practical_constraints.memo`, lot M4) n'avait AUCUN producteur: un
-- magasin lu par les deux générateurs, visible sur la carte, et que personne ne
-- remplissait — « un mémo sans producteur n'est pas un mémo cassé, c'est un
-- mémo vide ». Le lot A en fait la destination ③, « ce que Sophia sait », et le
-- classifieur du retour sur brouillon y écrit. Il lui faut donc une PORTE.
--
-- ── POURQUOI LA MÊME FONCTION, ET PAS UNE TROISIÈME ─────────────────────
-- Un retour sur brouillon range en UN passage une préférence (`retained_items`),
-- une envie (`retained_next_plan`) et une note (`memo`). « Les deux moitiés
-- d'un reclassement ne se séparent pas » (`api/retainedItems.ts`): trois RPC
-- laisseraient une fenêtre où la personne a sa préférence sans sa note, ou
-- l'inverse. Une seule fonction, un seul énoncé SQL, trois clés nommées.
--
-- ── LA FORME, INCHANGÉE ──────────────────────────────────────────────────
-- Même contrat que `20260818250000`: un témoin PAR CLÉ (`p_expected_*` est la
-- valeur LUE), `jsonb_set` sur la clé NOMMÉE et rien d'autre, `NULL` = « je
-- ne touche pas cette clé », `create_if_missing` porté par la présence de la
-- valeur, et `service_role` seul.
--
-- ⚠️ L'ANCIENNE SURCHARGE À CINQ ARGUMENTS EST SUPPRIMÉE. Deux surcharges
-- laisseraient PostgREST choisir sur les noms de paramètres, et un appelant
-- resté sur cinq écrirait toujours — sans mémo, sans qu'aucun compteur ne
-- le dise. Le seul appelant est `_shared/keel/retained_items_io.ts`, qui passe
-- les sept dans le même commit.
--
-- ⚠️ « APPLIQUÉE EN LOCAL » ≠ LE CONTRÔLE A TOURNÉ: le `db push` distant est
-- le premier vrai run du bloc de contrôle en bas de ce fichier.

drop function if exists public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb);

create or replace function public.keel_write_retained_items_for(
  p_user uuid,
  p_expected jsonb,
  p_items jsonb,
  p_expected_next jsonb,
  p_next jsonb,
  p_expected_memo jsonb,
  p_memo jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
  v_touches_items boolean;
  v_touches_next boolean;
  v_touches_memo boolean;
begin
  -- ⚠️ `p_user` ET PAS `auth.uid()`: ce port est appelé par des fonctions edge
  -- en `service_role`, où `auth.uid()` est NULL. La contrepartie est le
  -- `grant` à `service_role` SEUL, tout en bas.
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- QUELLE CLÉ EST TOUCHÉE: LA PRÉSENCE DE LA VALEUR, ET RIEN D'AUTRE.
  -- `p_expected_*` à NULL ne veut pas dire « ne vérifie rien », il veut dire
  -- « je m'attends à ce que la clé soit ABSENTE » — la garde la plus stricte,
  -- et l'état de la toute première écriture de tout le monde.
  v_touches_items := p_items is not null;
  v_touches_next := p_next is not null;
  v_touches_memo := p_memo is not null;

  if not v_touches_items and not v_touches_next and not v_touches_memo then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_write');
  end if;

  -- LA FORME EST EXIGÉE, jamais devinée. Les trois magasins sont des LISTES.
  if v_touches_items and jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_items');
  end if;
  if v_touches_next and jsonb_typeof(p_next) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_next_plan');
  end if;
  if v_touches_memo and jsonb_typeof(p_memo) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_memo');
  end if;

  -- L'ÉCRITURE, EN UN SEUL ÉNONCÉ — `jsonb_set` sur LES CLÉS NOMMÉES, trois
  -- fois, et rien d'autre. Ce qui n'est pas nommé ici est celui de la ligne
  -- VIVANTE. Le `coalesce` de queue n'est jamais écrit (`create_if_missing`
  -- à false jette le résultat quand on ne touche pas une clé absente); il
  -- existe parce que `jsonb_set` est STRICT et qu'un seul NULL effacerait
  -- toute la colonne.
  -- ⚠️ `array['…']` ET PAS `'{…}'` POUR LE CHEMIN: les épingles de test
  -- cherchent chaque nom de clé comme un littéral isolé.
  update public.student_goals sg
     set practical_constraints = jsonb_set(
           jsonb_set(
             jsonb_set(
               coalesce(sg.practical_constraints, '{}'::jsonb),
               array['retained_items'],
               coalesce(p_items, sg.practical_constraints -> 'retained_items', '[]'::jsonb),
               v_touches_items
             ),
             array['retained_next_plan'],
             coalesce(p_next, sg.practical_constraints -> 'retained_next_plan', '[]'::jsonb),
             v_touches_next
           ),
           array['memo'],
           coalesce(p_memo, sg.practical_constraints -> 'memo', '[]'::jsonb),
           v_touches_memo
         )
   where sg.user_id = p_user
     and (
       not v_touches_items
       or coalesce(sg.practical_constraints -> 'retained_items', 'null'::jsonb)
          is not distinct from coalesce(p_expected, 'null'::jsonb)
     )
     and (
       not v_touches_next
       or coalesce(sg.practical_constraints -> 'retained_next_plan', 'null'::jsonb)
          is not distinct from coalesce(p_expected_next, 'null'::jsonb)
     )
     and (
       not v_touches_memo
       or coalesce(sg.practical_constraints -> 'memo', 'null'::jsonb)
          is not distinct from coalesce(p_expected_memo, 'null'::jsonb)
     );
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'written', true);
  end if;

  -- POURQUOI RIEN N'A ÉTÉ ÉCRIT — nommé APRÈS l'écriture, jamais décidé avant.
  if not exists (select 1 from public.student_goals where user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'stale_snapshot');
end;
$function$;

comment on function public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Lot A (2026-09-03) — LE PORT D''ÉCRITURE SERVEUR des TROIS magasins de '
  'mémoire sur student_goals.practical_constraints: retained_items (①, '
  'durable), retained_next_plan (l''encart) et memo (③, « ce que Sophia '
  'sait »). Un témoin par clé, jsonb_set sur la clé nommée, NULL = clé non '
  'touchée. service_role seul: appelé par les fonctions edge.';

-- ── LES DROITS: `service_role` SEUL ──────────────────────────────────────
-- ⚠️ `revoke … from public` NE RETIRE PAS `anon` — cicatrice mesurée du dépôt
-- (`20260818200000`). Les quatre rôles sont révoqués NOMMÉMENT.
revoke all on function public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;

-- ── LE BLOC DE CONTRÔLE — l'état RÉEL, pas le texte ───────────────────────
do $$
declare
  v_overloads integer;
begin
  -- ① Une seule surcharge: l'ancienne à cinq arguments est partie.
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'keel_write_retained_items_for';
  if v_overloads <> 1 then
    raise exception 'keel_write_retained_items_for: % surcharges, attendu 1', v_overloads;
  end if;

  -- ② Les droits: anon et authenticated n'ont RIEN, service_role a EXECUTE.
  if has_function_privilege('anon', 'public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)', 'execute') then
    raise exception 'keel_write_retained_items_for: anon peut exécuter le port serveur';
  end if;
  if has_function_privilege('authenticated', 'public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)', 'execute') then
    raise exception 'keel_write_retained_items_for: authenticated peut exécuter le port serveur';
  end if;
  if not has_function_privilege('service_role', 'public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)', 'execute') then
    raise exception 'keel_write_retained_items_for: service_role ne peut pas exécuter le port';
  end if;

  -- ③ `nothing_to_write` quand aucune clé n'est touchée — la forme est tenue.
  if (public.keel_write_retained_items_for('00000000-0000-4000-8000-000000000000', null, null, null, null, null, null) ->> 'reason') <> 'nothing_to_write' then
    raise exception 'keel_write_retained_items_for: trois NULL ne rendent pas nothing_to_write';
  end if;
  -- ④ Un mémo qui n'est pas une liste est refusé AVANT toute écriture.
  if (public.keel_write_retained_items_for('00000000-0000-4000-8000-000000000000', null, null, null, null, null, '{}'::jsonb) ->> 'reason') <> 'bad_memo' then
    raise exception 'keel_write_retained_items_for: un mémo objet n''est pas refusé bad_memo';
  end if;
end $$;
