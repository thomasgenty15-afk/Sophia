-- ============================================================================
-- LES TROIS PRODUCTEURS DE LA PHASE 2 N'AVAIENT AUCUNE PORTE D'ÉCRITURE
-- lot 1F, 2026-08-18
-- ============================================================================
--
-- Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 2 (les deux
-- portées), §3 (la forme écrite), §5 (la matrice des droits).
-- Appelant unique: `supabase/functions/_shared/keel/retained_items_io.ts`
-- (`persistRetainedItemsFor`). Les magasins et leurs lecteurs sont ailleurs, et
-- ce fichier ne les redéfinit pas:
--   `_shared/keel/food_preference_promotion.ts`  `retained_items`     (durable)
--   `_shared/keel/retained_next_plan.ts`         `retained_next_plan` (provisoire)
--
-- ── LE DÉFAUT, MESURÉ ──────────────────────────────────────────────────────
--
-- Le lot 1D a livré `keel_write_retained_items` (migration `20260818240000`),
-- et elle est LÉGITIME: c'est le port de LA CARTE, appelée par le navigateur de
-- la personne, avec son jeton. Son identité vient d'`auth.uid()` — 11
-- occurrences dans ce fichier — et c'est la bonne garde là-bas, parce qu'un
-- `p_user` sur une fonction `security definer` accordée à `authenticated` est
-- un paramètre qu'on peut mentir.
--
-- ⚠️ MAIS `auth.uid()` EST `NULL` SOUS `service_role`. C'est une cicatrice
-- écrite de ce dépôt: toute RPC gatée dessus est MORTE côté serveur, et
-- l'échec est MUET — un `update` qui ne touche aucune ligne rend `204`, pas une
-- erreur. 1D s'en est protégée en ne s'accordant PAS à `service_role` (elle y
-- rendrait `no_user` à chaque appel, c'est-à-dire une porte qui a l'air
-- ouverte).
--
-- Or les trois producteurs de la phase 2 tournent tous en `service_role`:
--   · le memorizer            (cron `trigger-memorizer-daily`, `0 0 * * *`)
--   · le classifieur de retour sur brouillon   (fonction edge, après validation)
--   · le questionnaire de fin de plan          (extraction depuis `meal_plan_feedback`)
--
-- Et l'autre port serveur existant, `keel_write_food_preferences`
-- (`20260812210000`), ne connaît NI `retained_items` NI `retained_next_plan`
-- (vérifié: 0 occurrence). **Aucun des trois ne peut écrire quoi que ce soit.**
--
-- ── CE QUE CE PORT EST, ET CE QU'IL N'EST PAS ──────────────────────────────
--
-- ⛔ IL NE DONNE AUCUN POUVOIR NEUF. `service_role` peut déjà écrire n'importe
-- quelle ligne de `student_goals`: ce port ne réduit pas un privilège, il
-- contraint une FORME. Ce qu'il apporte, et c'est tout ce qu'il apporte:
--   ① l'écriture est CIBLÉE — `jsonb_set` sur les deux clés nommées, jamais la
--      colonne entière;
--   ② la concurrence est OPTIMISTE et vit DANS LE PRÉDICAT — une course perdue
--      rend `stale_snapshot` au lieu d'écraser le geste d'un tiers;
--   ③ chaque clé se touche INDÉPENDAMMENT, avec son propre témoin.
--
-- ── ⛔ CE QU'ON N'ÉCRIT PAS: LA COLONNE ENTIÈRE ────────────────────────────
-- Le défaut est mesuré DEUX FOIS dans ce dépôt. Le lot C3 a fermé une écriture
-- de colonne entière qui faisait disparaître le rythme de repas d'un autre
-- onglet, sans un mot (`20260812210000`, l'en-tête entier). Et la cicatrice
-- jumelle — « `current` périmé efface l'écriture d'avant » — se lit côté
-- personne comme « le bouton ne fait rien ».
--
-- ⚠️ ET RELIRE JUSTE AVANT D'ÉCRIRE NE FERME PAS LA FENÊTRE, ÇA LA RÉTRÉCIT.
-- C'est la cicatrice de `keel_validate_meal_plan` (2026-08-11), re-payée sur le
-- plafond de fusions (L7). La garde est donc dans le PRÉDICAT D'UN SEUL ÉNONCÉ.
--
-- ── LA CONCURRENCE: POURQUOI LE PORT SERVEUR EN A BESOIN AUSSI ─────────────
-- Le cron de minuit et une personne qui édite sa carte peuvent écrire LA MÊME
-- SECONDE, et sur LA MÊME CLÉ: `retained_items` a désormais deux écrivains
-- légitimes (la carte via `keel_write_retained_items`, le memorizer via ce
-- port). Sans témoin, la seconde écriture — construite depuis une copie lue
-- quelques millisecondes plus tôt — effacerait l'édition de la personne, et les
-- DEUX écritures rendraient `ok`. C'est exactement le défaut de C3, pris par
-- l'autre bout.
--
-- OPTION ÉCARTÉE: **pas de témoin, dernier arrivé gagne** — au motif qu'un cron
-- qui perd sa course perd une nuit de propositions. Refusée: l'asymétrie des
-- dégâts est écrasante. Une proposition du memorizer perdue revient la nuit
-- suivante (le souvenir, lui, est toujours en base); une ligne écrite à la main
-- et effacée par un cron ne revient JAMAIS, et la personne n'a rien fait qui
-- puisse le lui expliquer.
--
-- OPTION ÉCARTÉE AUSSI: **fusionner les deux listes en SQL** plutôt que de
-- refuser. Il faudrait décider que deux lignes sont « la même » — c'est-à-dire
-- un matcher, sur du texte libre, dans les deux langues servies. ⛔ « laitue »
-- ≠ « lait », 12 faux positifs sur 12 mesurés. La fusion par IDENTIFIANT, elle,
-- vit chez l'appelant (`retained_items_io.ts`), où les identifiants sont typés.
--
-- ── ⚠️ LES DEUX NOMS DE CLÉ SONT ÉPINGLÉS PAR UN TEST ──────────────────────
-- Ce fichier écrit `retained_items` et `retained_next_plan` en DUR; le code les
-- déclare en CONSTANTES (`RETAINED_ITEMS_KEY`, `NEXT_PLAN_ITEMS_KEY`). Deux
-- déclarations indépendantes que RIEN ne relie: renommer la constante laisse
-- toute la suite verte pendant que cette RPC écrit dans une clé que plus
-- personne ne lit. **Ce défaut a DÉJÀ failli être payé sur ce chantier**: le lot
-- 1B nommait sa clé `next_plan_items` pendant que 1D écrivait déjà
-- `retained_next_plan`; les deux côtés étaient verts, et aucun `next_plan`
-- n'aurait jamais transité.
-- `supabase/functions/_shared/keel/retained_items_io_test.ts` balaie
-- `supabase/migrations/`, trouve CE fichier, et exige d'y lire les deux
-- littéraux, le nom de la fonction, ET les cinq noms de paramètres.
--
-- ── AUCUNE TABLE NEUVE, ET C'EST DIT PLUTÔT QUE SOUS-ENTENDU ──────────────
-- Cette migration ne crée aucune table. Ça compte, parce que la cicatrice de ce
-- dépôt est là: les défauts Supabase donnent TOUT à `authenticated` sur toute
-- table neuve, `TRUNCATE` compris — et `TRUNCATE` échappe à RLS. Il n'y a donc
-- ici que des privilèges de FONCTION, et ils sont posés explicitement plus bas.
-- ============================================================================

create or replace function public.keel_write_retained_items_for(
  p_user uuid,
  p_expected jsonb,
  p_items jsonb,
  p_expected_next jsonb,
  p_next jsonb
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
begin
  -- ⚠️ `p_user` ET PAS `auth.uid()`, ET C'EST L'INVERSE EXACT DE 1D. Ce port
  -- est appelé par un CRON et par des fonctions edge en `service_role`, où
  -- `auth.uid()` est NULL: l'y gater rendrait `no_user` à chaque appel. La
  -- contrepartie est que `p_user` est un paramètre qu'on pourrait mentir —
  -- d'où le `grant` à `service_role` SEUL, tout en bas. Un rôle qui peut déjà
  -- écrire toute la table ne gagne rien à mentir sur cet argument.
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- ── QUELLE CLÉ EST TOUCHÉE: LA PRÉSENCE DE LA VALEUR, ET RIEN D'AUTRE ────
  --
  -- ⚠️ PAS DE DRAPEAU BOOLÉEN, et pas de `p_expected` obligatoire non plus.
  -- Un drapeau serait un paramètre de garde de plus à oublier — cicatrice
  -- nommée du dépôt (« paramètre de garde optionnel = garde désarmée », le
  -- `safetyBand` jamais passé).
  --
  -- ET LE TÉMOIN NE PEUT PAS ÊTRE DÉSARMÉ PAR OMISSION, c'est la propriété qui
  -- rend cette forme sûre: `p_expected` à NULL ne veut pas dire « ne vérifie
  -- rien », il veut dire « je m'attends à ce que la clé soit ABSENTE ». Un
  -- appelant qui l'oublie obtient donc la garde la PLUS STRICTE possible, et
  -- son écriture est refusée dès que la clé existe. Il faut bien ça, parce que
  -- NULL doit rester utilisable: c'est l'état de la toute première écriture de
  -- tout le monde, et « une garde a besoin d'un cas qui PASSE ».
  v_touches_items := p_items is not null;
  v_touches_next := p_next is not null;

  -- RIEN À ÉCRIRE EST UN REFUS, PAS UN SUCCÈS. Rendre `ok` ici donnerait à un
  -- appelant cassé — celui dont tous les items ont été refusés en amont — la
  -- réponse exacte d'un appelant qui a écrit.
  if not v_touches_items and not v_touches_next then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_write');
  end if;

  -- LA FORME EST EXIGÉE, jamais devinée. Les deux magasins sont des LISTES; y
  -- écrire un objet casserait la lecture en silence, et le seul symptôme serait
  -- un magasin qui a l'air vide (`readRetainedItems` / `readNextPlanEntries`
  -- comptent alors UNE ligne refusée, pas zéro — mais personne ne lit un
  -- compteur qu'on n'a pas su faire rougir).
  if v_touches_items and jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_items');
  end if;
  if v_touches_next and jsonb_typeof(p_next) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_next_plan');
  end if;

  -- ── L'ÉCRITURE, EN UN SEUL ÉNONCÉ ────────────────────────────────────────
  --
  -- `jsonb_set` sur LA CLÉ NOMMÉE, deux fois, et rien d'autre. Ce qui n'est pas
  -- nommé ici — rythme de repas, capacité de cuisine, absences, budget,
  -- préférences plates — est celui de la ligne VIVANTE, jamais celui d'une
  -- copie. Une modification concurrente sur une AUTRE clé survit par
  -- CONSTRUCTION, et pas par condition.
  --
  -- ⚠️ LE QUATRIÈME ARGUMENT (`create_if_missing`) PORTE LE « ON NE TOUCHE
  -- PAS ». À `false`, `jsonb_set` sur un chemin ABSENT rend sa cible inchangée:
  -- c'est le no-op qu'on veut. Et quand la clé existe alors qu'on ne la touche
  -- pas, la valeur réécrite est `sg.practical_constraints -> '<clé>'`,
  -- c'est-à-dire la valeur de LA MÊME LIGNE dans LE MÊME énoncé — une identité,
  -- pas une copie d'une lecture antérieure.
  --
  -- ⚠️ ET LE `'[]'::jsonb` DE QUEUE N'EST JAMAIS ÉCRIT. `jsonb_set` est STRICT:
  -- un seul argument NULL et TOUT le document devient NULL — c'est-à-dire toute
  -- la colonne effacée, pour la personne, en silence. Le `coalesce` existe pour
  -- ça et pour rien d'autre; sa dernière branche n'est atteinte que quand on ne
  -- touche pas une clé qui n'existe pas, et `create_if_missing = false` jette
  -- alors le résultat. Le contrôle ⑦ plus bas le prouve sur une ligne réelle.
  --
  -- `is not distinct from` et pas `=`: une clé peut être ABSENTE (jsonb NULL en
  -- SQL), et `null = null` vaut NULL — donc le `where` ne tirerait JAMAIS sur
  -- une ligne qui n'a encore aucun item, c'est-à-dire sur la toute première
  -- écriture de tout le monde.
  -- ⚠️ `array['…']` ET PAS `'{…}'` POUR LE CHEMIN, et ce n'est pas cosmétique:
  -- le test d'épinglage du lot 1B cherche le littéral `'retained_next_plan'`
  -- dans TOUTE migration qui définit une fonction `keel_write_retained_items*`.
  -- Écrit `'{retained_next_plan}'`, le nom de la clé n'est plus une chaîne
  -- isolée, l'épingle ne le trouve pas, et deux lots croiraient s'être reliés.
  -- Les deux formes sont le même `text[]` pour `jsonb_set`.
  update public.student_goals sg
     set practical_constraints = jsonb_set(
           jsonb_set(
             coalesce(sg.practical_constraints, '{}'::jsonb),
             array['retained_items'],
             coalesce(p_items, sg.practical_constraints -> 'retained_items', '[]'::jsonb),
             v_touches_items
           ),
           array['retained_next_plan'],
           coalesce(p_next, sg.practical_constraints -> 'retained_next_plan', '[]'::jsonb),
           v_touches_next
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
     );
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'written', true);
  end if;

  -- ── POURQUOI RIEN N'A ÉTÉ ÉCRIT ──────────────────────────────────────────
  -- Cette lecture arrive APRÈS l'écriture: elle NOMME l'échec, elle ne le
  -- décide pas. L'inverse — lire pour décider, puis écrire — est exactement la
  -- lecture-puis-écriture que le prédicat ci-dessus existe pour éviter.
  if not exists (select 1 from public.student_goals where user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'stale_snapshot');
end;
$function$;

comment on function public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb) is
  'Lot 1F — LE PORT D''ÉCRITURE SERVEUR des deux magasins de mémoire structurée '
  'sur student_goals.practical_constraints: retained_items (durable) et '
  'retained_next_plan (provisoire, [{item, anchor}]). Jumeau de '
  'keel_write_retained_items (1D) pour les appelants en service_role, où '
  'auth.uid() est NULL et où le port de la carte est donc MORT: l''identité '
  'vient de p_user, et le grant est service_role SEUL. jsonb_set par CLÉ '
  'NOMMÉE, jamais la colonne entière — ce qui n''est pas nommé reste celui de '
  'la ligne vivante. Chaque clé se touche indépendamment (valeur NULL = clé non '
  'touchée) avec SON témoin: la concurrence optimiste est dans le PRÉDICAT '
  '(p_expected* comparés aux valeurs live), jamais dans une relecture, et une '
  'course perdue rend stale_snapshot au lieu d''écraser le geste d''un tiers. '
  'La matrice des droits (canProduce) est tenue chez l''appelant, '
  '_shared/keel/retained_items_io.ts, qui est le SEUL appelant légitime.';

-- ---------------------------------------------------------------------------
-- LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- ⚠️ `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT
-- implicite, et toute fonction neuve est exécutable par tout le monde par
-- défaut. Cicatrice mesurée du dépôt (`20260818200000`, une migration entière
-- consacrée à ça). On révoque donc les quatre rôles NOMMÉMENT, et le contrôle
-- ⑧ le vérifie par `has_function_privilege('anon', …)` — jamais par lecture du
-- fichier.
--
-- `service_role` SEUL, et surtout PAS `authenticated`: ce port prend l'identité
-- en PARAMÈTRE. Accordé à `authenticated`, il laisserait n'importe quel compte
-- connecté écrire dans le magasin de mémoire de n'importe qui d'autre — la
-- carte a son port à elle, gaté par `auth.uid()` (`keel_write_retained_items`).
revoke all on function public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb)
  to service_role;

-- ============================================================================
-- CONTRÔLE — rejoué puis ANNULÉ.
--
-- ⚠️ CE PORT-CI EST TESTABLE, contrairement à celui de 1D: son identité est un
-- PARAMÈTRE, donc un bloc `do $$` peut l'appeler pour de vrai. Ce qui suit
-- monte la vraie course — le cron compose avec une copie, la personne écrit
-- entre-temps depuis sa carte — et exige un refus, pas un écrasement.
-- ============================================================================
do $$
declare
  v_user uuid;
  v_res jsonb;
  v_pc jsonb;
begin
  -- ① SANS UTILISATEUR, RIEN NE S'ÉCRIT. Le cas qui ÉCHOUE.
  v_res := public.keel_write_retained_items_for(
    null, null, jsonb_build_array(), null, null);
  if coalesce(v_res ->> 'reason', '') <> 'no_user' then
    raise exception '1F — une écriture sans utilisateur est passée: %', v_res;
  end if;

  -- ② LA SIGNATURE EXACTE QUE L'APPELANT UTILISE. Une signature qui bouge est
  --    une RPC que PostgREST rend en `PGRST202`, c'est-à-dire un « ça n'a rien
  --    fait » que rien d'autre n'attrape.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'keel_write_retained_items_for'
       and pg_get_function_identity_arguments(p.oid)
           = 'p_user uuid, p_expected jsonb, p_items jsonb, '
           || 'p_expected_next jsonb, p_next jsonb'
  ) then
    raise exception '1F — la signature attendue par l''appelant n''existe pas';
  end if;

  -- ⑧ LES PRIVILÈGES — vérifiés par `has_function_privilege`, JAMAIS par
  --    lecture. `revoke … from public` laisse `anon` debout: c'est mesuré.
  if has_function_privilege('anon',
       'public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb)',
       'execute') then
    raise exception '1F — anon peut exécuter le port serveur';
  end if;
  if has_function_privilege('authenticated',
       'public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb)',
       'execute') then
    raise exception '1F — authenticated peut exécuter le port serveur';
  end if;
  if not has_function_privilege('service_role',
       'public.keel_write_retained_items_for(uuid, jsonb, jsonb, jsonb, jsonb)',
       'execute') then
    raise exception '1F — service_role ne peut PAS exécuter le port serveur';
  end if;

  -- ── LES CAS QUI ÉCRIVENT: sur une ligne RÉELLE, annulée à la fin ─────────
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null
     or not exists (select 1 from public.student_goals where user_id = v_user)
  then
    raise notice '1F — aucun compte avec student_goals: contrôles ③-⑦ sautés.';
  else
    update public.student_goals
       set practical_constraints = jsonb_build_object(
             'eating_rhythm', jsonb_build_array('breakfast'),
             'cooking_time_min', 20,
             'food_preferences', jsonb_build_array('aime le poisson'))
     where user_id = v_user;

    -- ③ LE CAS QUI PASSE: la clé est ABSENTE, le témoin est NULL, ça écrit.
    --    Sans ce cas, la garde du témoin serait une garde qui bloque tout et
    --    qui ressemble à une garde qui marche.
    v_res := public.keel_write_retained_items_for(
      v_user, null, jsonb_build_array(jsonb_build_object('kind', 'food.exclude')),
      null, jsonb_build_array());
    if coalesce(v_res ->> 'ok', 'false') <> 'true' then
      raise exception '1F — la première écriture a été refusée: %', v_res;
    end if;

    -- ④ LA MOITIÉ QUI COMPTE: les clés voisines SURVIVENT.
    select practical_constraints into v_pc
      from public.student_goals where user_id = v_user;
    if v_pc -> 'eating_rhythm' is null then
      raise exception '1F — le rythme de repas a été écrasé: %', v_pc;
    end if;
    if v_pc -> 'cooking_time_min' is null then
      raise exception '1F — la clé d''un tiers a été écrasée: %', v_pc;
    end if;
    if v_pc -> 'food_preferences' is null then
      raise exception '1F — les préférences plates ont été écrasées: %', v_pc;
    end if;
    if v_pc -> 'retained_items' is null or v_pc -> 'retained_next_plan' is null then
      raise exception '1F — un des deux magasins n''a pas été écrit: %', v_pc;
    end if;

    -- ⑤ LA GARDE MORD: un témoin périmé sur la MÊME clé ne s'écrit pas. C'est
    --    la course réelle — la personne a édité sa carte pendant que le cron
    --    composait sa liste.
    v_res := public.keel_write_retained_items_for(
      v_user, jsonb_build_array(), jsonb_build_array(jsonb_build_object('kind', 'invente')),
      null, null);
    if coalesce(v_res ->> 'reason', '') <> 'stale_snapshot' then
      raise exception '1F — un témoin périmé est passé: %', v_res;
    end if;
    select practical_constraints into v_pc
      from public.student_goals where user_id = v_user;
    if v_pc -> 'retained_items' <> jsonb_build_array(jsonb_build_object('kind', 'food.exclude')) then
      raise exception '1F — le témoin périmé a quand même écrit: %', v_pc;
    end if;

    -- ⑥ LES FORMES ILLÉGALES SONT NOMMÉES, jamais devinées.
    v_res := public.keel_write_retained_items_for(
      v_user, null, jsonb_build_object(), null, null);
    if coalesce(v_res ->> 'reason', '') <> 'bad_items' then
      raise exception '1F — un objet est passé pour une liste d''items: %', v_res;
    end if;
    v_res := public.keel_write_retained_items_for(
      v_user, null, null, null, jsonb_build_object());
    if coalesce(v_res ->> 'reason', '') <> 'bad_next_plan' then
      raise exception '1F — un objet est passé pour une liste de next_plan: %', v_res;
    end if;
    v_res := public.keel_write_retained_items_for(v_user, null, null, null, null);
    if coalesce(v_res ->> 'reason', '') <> 'nothing_to_write' then
      raise exception '1F — une écriture vide a rendu autre chose: %', v_res;
    end if;

    -- ⑦ LE POINT DU LOT, ET LE PLUS SUBTIL: TOUCHER UNE SEULE CLÉ.
    --    On n'écrit QUE `retained_next_plan`, avec SON témoin, et
    --    `retained_items` doit rester EXACTEMENT ce qu'il était — sans que son
    --    témoin ait eu à être fourni, et sans être remplacé par le `'[]'` de
    --    queue du `coalesce`.
    v_res := public.keel_write_retained_items_for(
      v_user, null, null,
      jsonb_build_array(), jsonb_build_array(jsonb_build_object('anchor', '2026-08-17')));
    if coalesce(v_res ->> 'ok', 'false') <> 'true' then
      raise exception '1F — une écriture sur la seule clé provisoire a été refusée: %', v_res;
    end if;
    select practical_constraints into v_pc
      from public.student_goals where user_id = v_user;
    if v_pc -> 'retained_items' <> jsonb_build_array(jsonb_build_object('kind', 'food.exclude')) then
      raise exception '1F — écrire le provisoire a touché le durable: %', v_pc;
    end if;
    if v_pc -> 'eating_rhythm' is null or v_pc -> 'cooking_time_min' is null then
      raise exception '1F — écrire le provisoire a touché une clé voisine: %', v_pc;
    end if;
  end if;

  raise exception '1F — contrôle OK, on annule tout';
exception
  when others then
    if sqlerrm <> '1F — contrôle OK, on annule tout' then
      raise;
    end if;
    raise notice '1F — contrôle passé (8 cas), état restauré par le rollback';
end $$;
