-- ============================================================================
-- LOT M5 — LE CHAMP QUE LA PERSONNE VOIT EST CELUI QUI CHANGE
--
-- Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.4 ① et §3.5 M5.
--
-- ── LE DÉFAUT MESURÉ, ET IL ÉTAIT MUET ──────────────────────────────────────
-- Un `logistics.set` retenu n'écrivait RIEN. Les deux générateurs le posaient
-- en mémoire, à la lecture, juste avant de composer (`logisticsOverlayFor`):
--
--     goalRow.practical_constraints = { ...practical_constraints, ...patch }
--
-- Conséquence, vérifiable sur n'importe quel compte qui a répondu « non » à
-- « tu as pu cuisiner ce plan ? »: la personne ouvre ses réglages, y lit
-- **45 min**, et son plan est composé sur **30**. Aucun écran ne le dit, rien
-- ne peut le défaire, et la seule façon de le découvrir est de relire deux
-- prompts côte à côte.
--
-- ⛔ C'est une décision du produit qu'aucun écran ne montre — précisément ce
-- que le design nomme comme le vice de fond.
--
-- ── CE QUE CE PORT AJOUTE, ET POURQUOI IL EST UN SECOND PORT ────────────────
-- `keel_write_retained_items_for` (1F) écrit DEUX clés nommées, et sa signature
-- est épinglée par un test qui compte ses cinq paramètres. Y ajouter des
-- arguments casserait cette épingle et, pire, mélangerait deux gestes qui n'ont
-- pas le même témoin de concurrence: l'un compare des LISTES d'items, l'autre
-- des SCALAIRES que la personne édite depuis un autre écran.
--
-- ⚠️ ET LES DEUX ÉCRITURES DE CE PORT SONT INDISSOCIABLES. Le patch (les champs)
-- et le journal (leur cause + leur valeur d'AVANT) partent dans le MÊME énoncé.
-- Les séparer produirait l'un des deux états qu'on ne veut jamais:
--   · un champ changé sans sa cause  → indéfaisable, et inexplicable;
--   · une cause sans changement      → un fil qui annonce ce qui n'a pas eu lieu.
--
-- ── ⛔ LE TÉMOIN PORTE SUR LES CHAMPS, PAS SUR LE JOURNAL ───────────────────
-- `p_expected` est l'état des champs TOUCHÉS, relu à quelques millisecondes de
-- l'écriture. C'est la vraie course: la personne ouvre ses réglages et met
-- 60 min pendant que le bilan calcule 30 depuis 45. Sans témoin, le bilan
-- écraserait un réglage que la personne venait de choisir — et le symptôme
-- serait « le bouton ne fait rien », cicatrice nommée du dépôt.
-- ============================================================================

create or replace function public.keel_write_field_changes_for(
  p_user uuid,
  p_expected jsonb,
  p_patch jsonb,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
  v_key text;
  v_pc jsonb;
begin
  -- ⚠️ `p_user` ET PAS `auth.uid()`, comme 1F et pour la même raison: cet appel
  -- vient d'une fonction edge en `service_role`, où `auth.uid()` est NULL. La
  -- contrepartie est le `grant` à `service_role` SEUL, tout en bas.
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- LA FORME EST EXIGÉE, jamais devinée.
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'bad_patch');
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_changes');
  end if;
  if p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_write');
  end if;

  -- ⛔ AUCUNE CLÉ HORS DE LA LISTE FERMÉE. C'est la garde qui empêche ce port de
  -- devenir « écris n'importe quoi dans le profil »: un appelant qui passerait
  -- `food_preferences`, `away_days` ou une clé de sécurité les écrirait sans
  -- qu'aucune matrice ne l'ait autorisé. La liste est celle de
  -- `WRITABLE_FIELDS` (`_shared/keel/field_change.ts`), et le contrôle ⑤ plus
  -- bas exige que les deux disent la même chose.
  --
  -- ⚠️ ELLE EST ÉCRITE EN DUR ICI, et c'est voulu: un port SQL qui irait lire sa
  -- propre liste d'autorisation ailleurs ne serait plus une garde. Le prix est
  -- une recopie, et le prix de la recopie est un test qui compare les deux.
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in (
      'cook_days', 'cooking_time_min', 'budget_amount',
      'recipe_difficulty', 'variety', 'eating_rhythm'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'forbidden_field');
    end if;
  end loop;

  -- ── L'ÉCRITURE, EN UN SEUL ÉNONCÉ ──────────────────────────────────────────
  --
  -- `||` fusionne le patch clé par clé sur la ligne VIVANTE: ce qui n'est pas
  -- dans `p_patch` reste celui de la même ligne dans le même énoncé — une
  -- identité, pas une copie d'une lecture antérieure. Une modification
  -- concurrente sur une AUTRE clé survit par CONSTRUCTION.
  --
  -- ⚠️ LE TÉMOIN NE PORTE QUE SUR LES CLÉS TOUCHÉES. Le comparer à la colonne
  -- entière ferait échouer l'écriture parce que quelqu'un a changé ses jours
  -- d'absence — c'est-à-dire un refus sur une course qui n'existe pas.
  update public.student_goals sg
     set practical_constraints = jsonb_set(
           coalesce(sg.practical_constraints, '{}'::jsonb) || p_patch,
           array['field_changes'],
           p_changes,
           true
         )
   where sg.user_id = p_user
     and (
       select coalesce(
         jsonb_object_agg(k, sg.practical_constraints -> k),
         '{}'::jsonb
       )
         from jsonb_object_keys(p_patch) as k
     ) is not distinct from coalesce(p_expected, '{}'::jsonb);
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'written', true);
  end if;

  -- ── POURQUOI RIEN N'A ÉTÉ ÉCRIT ────────────────────────────────────────────
  -- Cette lecture arrive APRÈS l'écriture: elle NOMME l'échec, elle ne le décide
  -- pas. L'inverse — lire pour décider, puis écrire — est exactement la
  -- lecture-puis-écriture que le prédicat existe pour éviter.
  if not exists (select 1 from public.student_goals where user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'stale_snapshot');
end;
$function$;

comment on function public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb) is
  'Lot M5 — LE PORT D''ÉCRITURE SERVEUR DES CHAMPS QUE LA PERSONNE VOIT. '
  'Écrit un patch de student_goals.practical_constraints (liste FERMÉE de six '
  'clés) ET le journal field_changes, dans le MÊME énoncé: un champ changé '
  'sans sa cause est indéfaisable, une cause sans changement annonce ce qui '
  'n''a pas eu lieu. Remplace le correctif EN MÉMOIRE de logisticsOverlayFor, '
  'sous lequel la personne lisait 45 min dans ses réglages pendant que son '
  'plan était composé sur 30. Témoin de concurrence sur les seules clés '
  'touchées. service_role SEUL: l''identité est un paramètre.';

-- ---------------------------------------------------------------------------
-- LES DROITS
-- ---------------------------------------------------------------------------
--
-- ⚠️ `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT implicite,
-- et toute fonction neuve est exécutable par tout le monde par défaut.
-- Cicatrice mesurée du dépôt (`20260818200000`). On révoque donc les quatre
-- rôles NOMMÉMENT, et le contrôle ⑥ le vérifie par `has_function_privilege`.
--
-- `service_role` SEUL, et surtout PAS `authenticated`: ce port prend l'identité
-- en PARAMÈTRE. Accordé à `authenticated`, il laisserait n'importe quel compte
-- connecté réécrire le profil de n'importe qui d'autre.
revoke all on function public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)
  to service_role;

-- ============================================================================
-- CONTRÔLE — rejoué puis ANNULÉ.
--
-- ⛔ L'ANNULATION N'EST PAS UNE POLITESSE, ET CE BLOC A FAILLI S'EN PASSER.
-- Le contrôle ③ appelle le port sur une LIGNE RÉELLE — c'est la seule façon de
-- prouver le témoin de concurrence, qui n'existe que contre une vraie donnée.
-- Sans annulation, déployer cette migration mettrait `variety = 'varied'` et un
-- faux journal dans le profil de quelqu'un, en production, pour toujours. Mesuré
-- ici même le 2026-09-01: la première version l'a fait sur la base locale.
--
-- Le patron est celui de 1F: le bloc se termine par une exception SENTINELLE,
-- rattrapée et rendue muette. Un bloc PL/pgSQL avec `exception` ouvre une
-- sous-transaction; lever y annule TOUT ce que le bloc a écrit. Toute autre
-- exception est RE-LEVÉE — sinon ce filet avalerait les échecs de contrôle
-- qu'il est là pour faire remonter.
-- ============================================================================
do $$
declare
  v_user uuid;
  v_res jsonb;
  v_pc jsonb;
begin
  -- ① SANS UTILISATEUR, RIEN NE S'ÉCRIT.
  v_res := public.keel_write_field_changes_for(
    null, null, '{"variety":"varied"}'::jsonb, '[]'::jsonb);
  if coalesce(v_res ->> 'reason', '') <> 'no_user' then
    raise exception 'M5 — une écriture sans utilisateur est passée: %', v_res;
  end if;

  -- ② UNE CLÉ HORS LISTE EST REFUSÉE. C'est la garde qui empêche ce port de
  --    devenir « écris n'importe quoi dans le profil ».
  v_res := public.keel_write_field_changes_for(
    '00000000-0000-4000-8000-000000000001'::uuid,
    null,
    '{"food_preferences":["forgé"]}'::jsonb,
    '[]'::jsonb);
  if coalesce(v_res ->> 'reason', '') <> 'forbidden_field' then
    raise exception 'M5 — une clé hors liste est passée: %', v_res;
  end if;

  -- ③ LE CAS QUI PASSE, PUIS LA COURSE QUI ÉCHOUE — sur une ligne RÉELLE.
  --    Une garde sans cas passant est une garde cassée qui ressemble à une
  --    garde qui marche.
  select user_id into v_user from public.student_goals limit 1;
  if v_user is not null then
    select practical_constraints into v_pc
      from public.student_goals where user_id = v_user;

    -- ③-a le témoin CORRECT écrit.
    v_res := public.keel_write_field_changes_for(
      v_user,
      jsonb_build_object('variety', v_pc -> 'variety'),
      '{"variety":"varied"}'::jsonb,
      '[{"field":"variety","previous":null,"next":"varied","at":"2026-09-01","source":"questionnaire","quote":"contrôle"}]'::jsonb);
    if coalesce(v_res ->> 'ok', 'false') <> 'true' then
      raise exception 'M5 — le cas qui passe ne passe pas: %', v_res;
    end if;

    -- ③-b un témoin PÉRIMÉ est refusé — la personne a écrit entre-temps.
    v_res := public.keel_write_field_changes_for(
      v_user,
      '{"variety":"repeat"}'::jsonb,
      '{"variety":"some"}'::jsonb,
      '[]'::jsonb);
    if coalesce(v_res ->> 'reason', '') <> 'stale_snapshot' then
      raise exception 'M5 — un témoin périmé a écrasé: %', v_res;
    end if;

    -- ③-c ET LES AUTRES CLÉS N'ONT PAS BOUGÉ. C'est la moitié qui prouve que
    --     ce port n'est pas un écraseur de colonne.
    if (select practical_constraints - 'variety' - 'field_changes'
          from public.student_goals where user_id = v_user)
       is distinct from (v_pc - 'variety' - 'field_changes')
    then
      raise exception 'M5 — le port a touché des clés qu''il ne nommait pas';
    end if;
  end if;

  -- ④ LA SIGNATURE EXACTE QUE L'APPELANT UTILISE. Une signature qui bouge est
  --    une RPC que PostgREST rend en `PGRST202` — un « ça n'a rien fait » que
  --    rien d'autre n'attrape.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'keel_write_field_changes_for'
       and pg_get_function_identity_arguments(p.oid)
           = 'p_user uuid, p_expected jsonb, p_patch jsonb, p_changes jsonb'
  ) then
    raise exception 'M5 — la signature du port a bougé';
  end if;

  -- ⑤ LA LISTE FERMÉE EST CELLE DU TYPESCRIPT. La recopie est assumée (voir le
  --    bloc de la boucle), et c'est CE contrôle qui la rend sûre: il exige que
  --    le corps de la fonction nomme les six clés, ni plus ni moins.
  if (
    select count(*) from unnest(array[
      'cook_days', 'cooking_time_min', 'budget_amount',
      'recipe_difficulty', 'variety', 'eating_rhythm'
    ]) as k
    where position(quote_literal(k) in (
      select prosrc from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'keel_write_field_changes_for'
    )) = 0
  ) > 0 then
    raise exception 'M5 — une clé autorisée a disparu du corps de la fonction';
  end if;

  -- ⑥ LES DROITS, PROUVÉS SUR L'ÉTAT RÉEL et pas par lecture du fichier.
  if has_function_privilege('anon', 'public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)', 'execute')
  then
    raise exception 'M5 — le port est exécutable par anon ou authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)', 'execute') then
    raise exception 'M5 — service_role ne peut pas appeler le port';
  end if;

  raise exception 'M5 — contrôle OK, on annule tout';
exception
  when others then
    if sqlerrm <> 'M5 — contrôle OK, on annule tout' then
      raise;
    end if;
    raise notice 'M5 — contrôle passé (6 cas), état restauré par le rollback';
end;
$$;
