-- ============================================================================
-- LES DEUX MAGASINS DE MÉMOIRE N'AVAIENT AUCUNE PORTE D'ÉCRITURE
-- lot 1D, 2026-08-18
-- ============================================================================
--
-- Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 2 (les deux
-- portées), §3 (la forme écrite) et §6 (« Ce que Sophia sait de toi »).
-- Lecteurs: `_shared/keel/food_preference_promotion.ts` (`readRetainedItems`,
-- `withRetainedItems`), `_shared/keel/retained_next_plan.ts` (l'expiration), et
-- leur miroir front `frontend/src/keel/api/retainedItems.ts`.
--
-- ── LES DEUX CLÉS, ET POURQUOI ELLES SONT DEUX ─────────────────────────────
--
--   `practical_constraints.retained_items`      les `RetainedItem` DURABLES
--   `practical_constraints.retained_next_plan`  les PROVISOIRES, chacun avec
--                                               l'ancre de la semaine visée:
--                                               `[{ item, anchor }]`
--
-- ⚠️ LE PROVISOIRE A DÉMÉNAGÉ ICI LE 2026-08-18, PAR ARBITRAGE HUMAIN, et il
-- faut lire pourquoi avant de vouloir le remettre sur le canal d'envies.
-- `household_envy_submissions.household_id` est `not null`, et une personne
-- SEULE n'a pas de foyer (`SetupPage.tsx`: « LE SOLO NE CRÉE PAS DE FOYER »).
-- Un compte solo n'aurait donc JAMAIS pu porter une seule ligne `next_plan`,
-- alors que l'entrée du produit est à UNE bouche (PIVOT-FOYER §5). Le canal
-- d'envies redevient ce qu'il a toujours été: la phrase libre du maître pour
-- tout le foyer. Un magasin par PORTÉE, identique pour un solo et pour un
-- foyer.
--
-- ⛔ DEUX CLÉS ET PAS UNE, ET C'EST STRUCTUREL. Le magasin durable ne prend que
-- du `durable` — `withRetainedItems` filtre à l'écriture, `readRetainedItems`
-- compte `notDurable` à la lecture. Mélanger les deux referait exactement la
-- confusion que l'axe 2 existe pour empêcher: « une contrainte d'une semaine
-- s'y lisait comme une propriété permanente ».
--
-- ⚠️ L'EXPIRATION N'EST PAS STOCKÉE, ET ELLE NE LE SERA PAS. Elle se calcule à
-- la lecture depuis l'ancre (vivant tant que `jour <= ancre + 6`, parti à
-- partir de `ancre + 7`), dans `retained_next_plan.ts`. Un drapeau serait un
-- SECOND ÉTAT à invalider, et « un second état à invalider est un état dont
-- l'écrivain finit par disparaître » (`accident.ts`).
--
-- ── LE TROU, NOMMÉ PAR LE LOT 1A ───────────────────────────────────────────
-- La seule RPC d'écriture existante, `keel_write_food_preferences` (migration
-- 20260812210000), fait un `jsonb_set` sur `{food_preferences}` et
-- `{food_preferences_origin}` UNIQUEMENT: elle ne clobbe aucune des deux clés
-- ci-dessus, mais elle ne les écrit pas non plus. Et elle est réservée à
-- `service_role` — c'est la réconciliation serveur, déclenchée par la
-- composition de QUELQU'UN D'AUTRE (L6/D4), donc `auth.uid()` n'y est pas la
-- personne concernée.
--
-- La surface « Ce que Sophia sait de toi » est l'inverse exact: c'est LA
-- PERSONNE qui édite sa propre ligne, depuis son navigateur, avec son jeton.
-- `auth.uid()` EST la garde ici, et il n'a pas besoin d'un `p_user` — un
-- paramètre d'identité sur une fonction `security definer` accordée à
-- `authenticated` serait un paramètre qu'on peut mentir.
--
-- ── ⛔ CE QU'ON N'ÉCRIT PAS: LA COLONNE ENTIÈRE ────────────────────────────
-- C'est le défaut que le lot C3 a fermé dans ce dépôt, et le rythme de repas en
-- a été la victime mesurée: écrire tout `practical_constraints` fait
-- disparaître, sans un mot, ce qu'un autre onglet ou un autre écran vient d'y
-- poser. Cicatrice jumelle: « `current` périmé efface l'écriture d'avant » —
-- deux écritures sur `practical_constraints`, et l'utilisateur voit « le bouton
-- ne fait rien ».
--
-- ⚠️ ET RELIRE JUSTE AVANT D'ÉCRIRE NE FERME PAS LA FENÊTRE, ÇA LA RÉTRÉCIT.
-- C'est écrit dans la migration de `keel_write_food_preferences`, et c'est la
-- cicatrice de `keel_validate_meal_plan` (2026-08-11). La garde est donc dans
-- le PRÉDICAT d'un seul énoncé: la valeur LIVE est comparée à celle que l'écran
-- a lue, et la fonction refuse `stale_snapshot` au lieu d'écraser un tiers.
--
-- ── POURQUOI LES DEUX CLÉS D'ANCIENNES NOTES SONT LÀ AUSSI ────────────────
-- Elles n'entrent que pour UN geste, le RECLASSEMENT d'une ancienne note (§7:
-- « elles se reclassent quand la personne les édite »). Ce geste RETIRE une
-- phrase plate de `food_preferences` et AJOUTE une ligne rangée dans
-- `retained_items`. Le faire en deux écritures laisserait une fenêtre où la
-- personne a perdu sa note sans avoir gagné sa ligne — ou l'inverse, où elle
-- lit la même chose deux fois. Les deux moitiés partent donc dans le MÊME
-- énoncé, sous TOUS les prédicats.
--
-- ⚠️ CHAQUE COUPLE (attendu, nouveau) EST EXIGÉ ENTIER, jamais deviné.
-- Cicatrice nommée du dépôt: « paramètre de garde optionnel = garde désarmée »
-- (le `safetyBand` qui n'était jamais passé). Un `p_notes` sans son
-- `p_expected_notes` rend `bad_notes` — un refus, pas une écriture sans garde.
--
-- ── ⚠️ LES TROIS `p_expected*` SONT DU JSONB BRUT CÔTÉ APPELANT ────────────
-- Ce n'est pas une préférence de style, c'est ce qui rend le prédicat capable
-- de matcher. Le front envoyait `p_expected_notes` RECONSTRUIT (la liste rendue
-- par `keptFrom`, qui `trim()` et jette les vides) pendant que ses deux voisins
-- partaient bruts: une entrée stockée porteuse d'une espace ne matchait donc
-- PLUS JAMAIS, et tout reclassement d'ancienne note rendait `stale_snapshot` à
-- l'infini — un bouton mort qui accuse un fantôme. Corrigé au lot 1I.
--
-- ── ⚠️ ET `p_items` PORTE AUSSI CE QUE LE FRONT N'A PAS SU LIRE ────────────
-- Cette fonction remplace la CLÉ ENTIÈRE. Le front réémet donc, à leur rang,
-- les lignes que sa lecture a refusées (`reglueOpaqueRows`): sans ça, un simple
-- retrait de note effaçait toute ligne illisible, pendant que l'écran affichait
-- « Nothing was deleted ». Un appelant qui composerait `p_items` depuis ses
-- seules lignes PARSÉES rouvrirait ce trou — la garde vit chez l'appelant,
-- parce que lui seul sait ce qu'il n'a pas compris.
--
-- ── ⚠️ LES QUATRE NOMS DE CLÉ CI-DESSOUS SONT ÉPINGLÉS PAR UN TEST ─────────
-- Ce fichier écrit les clés en DUR; le front les déclare en CONSTANTES
-- (`RETAINED_ITEMS_KEY`, `NEXT_PLAN_ITEMS_KEY`, `FOOD_PREFERENCES_KEY`,
-- `FOOD_PREFERENCES_ORIGIN_KEY`). Ce sont deux déclarations indépendantes que
-- RIEN ne relie: renommer une constante TypeScript laisserait toute la suite
-- verte pendant que cette RPC écrirait dans une clé que plus personne ne lit.
-- C'est le défaut que le vérificateur du lot 1A a trouvé sur la première
-- version, et il ne se reconstruit pas deux fois:
-- `frontend/src/keel/api/retainedItems.int.test.ts` compose les quatre chaînes
-- attendues À PARTIR DES CONSTANTES et exige de les trouver ici — dans
-- l'écriture ET dans le prédicat.
-- ============================================================================

create or replace function public.keel_write_retained_items(
  p_expected jsonb,
  p_items jsonb,
  p_expected_next jsonb,
  p_next jsonb,
  p_expected_notes jsonb,
  p_notes jsonb,
  p_origins jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid;
  v_rows integer;
  v_touches_next boolean;
  v_touches_notes boolean;
begin
  -- ⚠️ `auth.uid()` ET PAS UN PARAMÈTRE. Cette fonction est appelée par le
  -- NAVIGATEUR de la personne, avec son jeton: son identité est dans la
  -- session, jamais dans un argument qu'on pourrait lui substituer.
  -- Corollaire assumé: elle est MORTE sous `service_role`, où `auth.uid()` est
  -- NULL — cicatrice « auth.uid() est NULL en service_role ». C'est pour ça
  -- qu'elle n'y est PAS accordée: la réconciliation serveur a sa fonction à
  -- elle.
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- LA FORME EST EXIGÉE, jamais devinée. Les deux magasins sont des LISTES;
  -- y écrire un objet casserait la lecture en silence, et le seul symptôme
  -- serait un magasin qui a l'air vide.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_items');
  end if;

  v_touches_next := p_next is not null or p_expected_next is not null;
  if v_touches_next and (p_next is null or jsonb_typeof(p_next) <> 'array') then
    return jsonb_build_object('ok', false, 'reason', 'bad_next_plan');
  end if;

  -- LE COUPLE DES NOTES EST ENTIER, OU IL N'EST PAS. Voir l'en-tête: un
  -- paramètre de garde optionnel est une garde désarmée.
  --
  -- ⚠️ UNE SEULE EXCEPTION, ET ELLE N'EST PAS UN ASSOUPLISSEMENT: un
  -- `p_expected_notes` NULL veut dire « j'ai lu, ET LA CLÉ N'ÉTAIT PAS LÀ ».
  -- C'est une attente VÉRIFIABLE, exactement comme celle de `p_expected` sur le
  -- magasin durable — le prédicat plus bas la compare à `'null'::jsonb`. Exiger
  -- un tableau ici rendrait `bad_notes` sur la toute première écriture de
  -- quelqu'un qui n'a jamais eu de `food_preferences`, c'est-à-dire un refus
  -- sur le cas nominal: « une garde a besoin d'un cas qui PASSE ».
  v_touches_notes := p_notes is not null or p_origins is not null
    or p_expected_notes is not null;
  if v_touches_notes then
    if p_notes is null or jsonb_typeof(p_notes) <> 'array'
       or p_origins is null or jsonb_typeof(p_origins) <> 'object'
       or (p_expected_notes is not null
           and jsonb_typeof(p_expected_notes) <> 'array')
    then
      return jsonb_build_object('ok', false, 'reason', 'bad_notes');
    end if;
  end if;

  -- ── L'ÉCRITURE, EN UN SEUL ÉNONCÉ ────────────────────────────────────────
  --
  -- `||` sur deux objets jsonb est une FUSION DE SURFACE: les clés nommées à
  -- droite remplacent celles de gauche, et TOUTES LES AUTRES sont recopiées
  -- telles quelles. C'est exactement « écrire ces clés-ci, et elles seules » —
  -- même effet qu'un empilement de `jsonb_set`, sans la pyramide de `case`
  -- qu'une clé optionnelle y imposerait. Une clé optionnelle non demandée
  -- apporte `'{}'` , c'est-à-dire rien.
  --
  -- Ce qui n'est pas nommé ici — rythme de repas, capacité de cuisine,
  -- absences, budget — est celui de la ligne VIVANTE, jamais celui d'une copie.
  -- Une modification concurrente sur une AUTRE clé survit par CONSTRUCTION, et
  -- pas par condition.
  --
  -- `is not distinct from` et pas `=`: une clé peut être ABSENTE (jsonb NULL en
  -- SQL), et `null = null` vaut NULL — donc le `where` ne tirerait JAMAIS sur
  -- une ligne qui n'a encore aucun item, c'est-à-dire sur la toute première
  -- écriture de tout le monde. Une garde a besoin d'un cas qui PASSE.
  update public.student_goals sg
     set practical_constraints =
           coalesce(sg.practical_constraints, '{}'::jsonb)
           || jsonb_build_object('retained_items', p_items)
           || (case when v_touches_next
                 then jsonb_build_object('retained_next_plan', p_next)
                 else '{}'::jsonb end)
           || (case when v_touches_notes
                 then jsonb_build_object(
                        'food_preferences', p_notes,
                        'food_preferences_origin', p_origins)
                 else '{}'::jsonb end)
   where sg.user_id = v_user
     and coalesce(sg.practical_constraints -> 'retained_items', 'null'::jsonb)
         is not distinct from coalesce(p_expected, 'null'::jsonb)
     and (
       not v_touches_next
       or coalesce(sg.practical_constraints -> 'retained_next_plan', 'null'::jsonb)
          is not distinct from coalesce(p_expected_next, 'null'::jsonb)
     )
     and (
       not v_touches_notes
       or coalesce(sg.practical_constraints -> 'food_preferences', 'null'::jsonb)
          is not distinct from coalesce(p_expected_notes, 'null'::jsonb)
     );
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'written', true);
  end if;

  -- ── POURQUOI RIEN N'A ÉTÉ ÉCRIT ──────────────────────────────────────────
  -- Cette lecture arrive APRÈS l'écriture: elle NOMME l'échec, elle ne le
  -- décide pas. L'inverse — lire pour décider, puis écrire — est exactement la
  -- lecture-puis-écriture que le prédicat ci-dessus existe pour éviter.
  if not exists (select 1 from public.student_goals where user_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'stale_snapshot');
end;
$function$;

comment on function public.keel_write_retained_items(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Lot 1D — LE PORT D''ÉCRITURE des deux magasins de mémoire structurée sur '
  'student_goals.practical_constraints: retained_items (durable) et '
  'retained_next_plan (provisoire, [{item, anchor}]). jsonb_set par CLÉ, jamais '
  'la colonne entière — ce qui n''est pas nommé reste celui de la ligne vivante. '
  'Les deux clés d''anciennes notes n''entrent que pour le reclassement du §7, '
  'et alors dans le MÊME énoncé: les deux moitiés d''un reclassement ne se '
  'séparent pas. La concurrence optimiste est dans le PRÉDICAT (p_expected* '
  'comparés aux valeurs live), jamais dans une relecture: refuse stale_snapshot '
  'au lieu d''écraser le geste d''un tiers. La propriété de la ligne vient '
  'd''auth.uid(), pas d''un paramètre — donc MORTE sous service_role, où '
  'auth.uid() est NULL; la réconciliation serveur a sa propre fonction '
  '(keel_write_food_preferences).';

-- ---------------------------------------------------------------------------
-- LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- ⚠️ `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT
-- implicite, et toute fonction neuve est exécutable par tout le monde par
-- défaut. Cicatrice mesurée du dépôt (20260818200000).
--
-- `authenticated` SEUL, et pas `service_role`: la garde est `auth.uid()`, qui
-- est NULL sous service_role — l'accorder là donnerait une fonction qui rend
-- `no_user` à chaque appel, c'est-à-dire une porte qui a l'air ouverte.
revoke all on function public.keel_write_retained_items(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_write_retained_items(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated;

-- ============================================================================
-- CONTRÔLE — rejoué puis ANNULÉ.
--
-- ⚠️ IL NE PEUT PAS TESTER `auth.uid()`, et c'est dit plutôt que contourné: un
-- bloc `do $$` tourne sous le rôle de la migration, où `auth.uid()` est NULL.
-- Ce qu'il vérifie est donc ce qu'il PEUT vérifier honnêtement: la garde
-- d'identité mord (①), la signature est celle que le front appelle (②), les
-- privilèges sont ceux qu'on a écrits (③), et — le point du lot — l'écriture
-- ciblée NE TOUCHE PAS les clés voisines (④).
-- ============================================================================
do $$
declare
  v_res jsonb;
  v_pc jsonb;
  v_user uuid;
begin
  -- ① SANS SESSION, RIEN NE S'ÉCRIT. C'est le cas qui ÉCHOUE, et il prouve que
  --    la garde d'identité n'est pas décorative.
  v_res := public.keel_write_retained_items(
    null, jsonb_build_array(), null, null, null, null, null);
  if coalesce(v_res ->> 'reason', '') <> 'no_user' then
    raise exception '1D — une écriture sans session est passée: %', v_res;
  end if;

  -- ② LA SIGNATURE EXACTE QUE LE FRONT APPELLE. Une signature qui bouge est une
  --    RPC que PostgREST rend en `PGRST202`, c'est-à-dire un « ça n'a rien
  --    fait » que rien d'autre n'attrape.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'keel_write_retained_items'
       and pg_get_function_identity_arguments(p.oid)
           = 'p_expected jsonb, p_items jsonb, p_expected_next jsonb, '
           || 'p_next jsonb, p_expected_notes jsonb, p_notes jsonb, p_origins jsonb'
  ) then
    raise exception '1D — la signature attendue par le front n''existe pas';
  end if;

  -- ③ LES PRIVILÈGES: `anon` NE DOIT PAS POUVOIR L'EXÉCUTER. `revoke from
  --    public` seul l'aurait laissé debout — cicatrice mesurée.
  if has_function_privilege('anon',
       'public.keel_write_retained_items(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)',
       'execute') then
    raise exception '1D — anon peut exécuter le port d''écriture';
  end if;
  if not has_function_privilege('authenticated',
       'public.keel_write_retained_items(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)',
       'execute') then
    raise exception '1D — authenticated ne peut PAS exécuter le port d''écriture';
  end if;

  -- ④ LA MOITIÉ QUI COMPTE: l'écriture ciblée ne touche pas ses voisines. On la
  --    rejoue À LA MAIN, avec les mêmes `jsonb_set`, sur une ligne réelle — la
  --    fonction elle-même est inatteignable sans session.
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null
     or not exists (select 1 from public.student_goals where user_id = v_user)
  then
    raise notice '1D — aucun compte avec student_goals: contrôle ④ sauté.';
  else
    update public.student_goals
       set practical_constraints = jsonb_build_object(
             'eating_rhythm', jsonb_build_array('breakfast'),
             'cooking_time_min', 20)
     where user_id = v_user;
    update public.student_goals
       set practical_constraints = jsonb_set(
             jsonb_set(
               coalesce(practical_constraints, '{}'::jsonb),
               '{retained_items}', jsonb_build_array(), true),
             '{retained_next_plan}', jsonb_build_array(), true)
     where user_id = v_user;
    select practical_constraints into v_pc
      from public.student_goals where user_id = v_user;
    if v_pc -> 'eating_rhythm' is null then
      raise exception '1D — le rythme de repas a été écrasé: %', v_pc;
    end if;
    if v_pc -> 'cooking_time_min' is null then
      raise exception '1D — la clé d''un tiers a été écrasée: %', v_pc;
    end if;
    if v_pc -> 'retained_items' is null then
      raise exception '1D — le magasin durable n''a pas été écrit: %', v_pc;
    end if;
    if v_pc -> 'retained_next_plan' is null then
      raise exception '1D — le magasin provisoire n''a pas été écrit: %', v_pc;
    end if;
  end if;

  raise exception '1D — contrôle OK, on annule tout';
exception
  when others then
    if sqlerrm <> '1D — contrôle OK, on annule tout' then
      raise;
    end if;
    raise notice '1D — contrôle passé (4 cas), état restauré par le rollback';
end $$;
