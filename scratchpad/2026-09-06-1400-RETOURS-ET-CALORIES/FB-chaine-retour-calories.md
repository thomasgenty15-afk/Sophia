# FB — La chaîne d'un retour alimentaire, de l'écriture aux kcal du plan suivant

Audit en lecture seule, 2026-09-06, dépôt `Sophia 2`, branche `ff-001-quotidien-du-coach`
(HEAD lu : `2b5e4f83`, pas `fa224681` — une session a commité entre-temps ; toutes les lignes
ci-dessous sont celles du disque au moment de la lecture, working tree compris).

Question : « J'aime pas trop le rougaille saucisse » — comment ça entre, ce que voit le modèle,
ce que fait la ceinture, et qui recalcule les grammes/kcal après une morsure.

Convention : `H` = `supabase/functions/generate-household-meal-v1/index.ts`,
`S` = `supabase/functions/generate-meal-v1/index.ts`, `K/` = `supabase/functions/_shared/keel/`.

---

## 0. Le schéma en une page

```
ÉCRITURE (3 sources)                          MAGASIN                         LECTURE → PROMPT
─────────────────────                         ───────                         ────────────────
① note sur brouillon ──(prompt SEUL, gen N)──────────────────────────────▶ draftNoteSuffix  H:2519-2549
   └─ classifiée APRÈS l'écriture du plan (H:9681) ─▶ student_goals.practical_constraints
② bilan de fin de plan  never_again ─▶ food.exclude ─▶   .retained_items      (durable)
   keel-plan-feedback-v1:328,461,544                     .retained_next_plan  (next_plan)
③ carte « ce que Sophia sait » ─▶ RPC keel_write_retained_items               .memo
   frontend/src/keel/api/retainedItems.ts:2085
                                                          │ H:2913 readRetainedItems
                                                          │ H:2931 nextPlanItemsFor (userId du COMPOSEUR seul)
                                                          ▼
                                              H:3005 compositionLinesByMouth ─▶ bloc des voix (household_voices.ts)
                                                          │ household → ligne brute sous le titulaire
                                                          │ member:<id> → ligne + « THIS PERSON ONLY »
                                                          ▼
                                                       MODÈLE (plan, boxes[] par plat)
                                                          │
CEINTURE (dans le parseur, K/meal_generation.ts) ◀────────┘
  7228-7277  par boîte × par nom sur le couvercle : dishBitesExclusion(surface "ingredients")
             morsure ⇒ le NOM sort de box.memberIds, les GRAMMES de la boîte restent
  7362-7370  boîte sans plus aucun nom ⇒ boîte JETÉE (grammes partis)
  7682       dish.heldOff[] = {memberId, cause:"exclusion", boxId, via, preparationId, matched}
CEINTURE FOYER (H:5951-6067) : exclusion `household` (+ union des bouches sur un plat sans boîte)
  ⇒ RELANCE modèle « rewrite ONLY these dishes » ; accepté ⇒ meal = retried  (H:6038, SANS mealSourceText)
                                                          │
PERSONNE SANS REPAS (H:6146-6586)                         ▼
  mealsDelivered ⇒ cause held_off_exclusion ─▶ jusqu'à 3 relances (H:6206) ─▶ restoreHeldOff (H:6421-6447)
  = la bouche est REMISE sur la boîte qui porte ce qu'elle évite ─▶ sinon 422 mouth_unfed (compose)
                                                          │
CALCUL (H:6624 → 8602), sur les box.memberIds APRÈS ceinture/relance/restauration
  6694 regramMeal (gramsRaw ingrédients)                  ▼
  7851 mouthDayEnergy : kcal/bouche/jour = Σ boîtes à UN nom ; bac commun = common_pot (null)
  ~7930 householdAnchors : cible = Σ moments où elle a SA boîte (ownSlots) ─▶ facteur = cible/livré
  7998 sizableBoxes ; 8021-8072 potFactorFor (bacs communs, eaters = memberIds)
  8112-8200 croissance des casseroles (jamais à la baisse) ; 8196 courses × facteur moyen
  8201 sizeBoxesFromTarget (grammes × facteur, plafond casserole ×1,1)
  8318 unmetDemand ; 8341 densifyBoxes (factor_clamped/both seulement)
  8451 log keel.household_meal.box_sizing
                                                          ▼
COURSES / CASSEROLES : shopping_list et preparations[].ingredients ne RÉTRÉCISSENT jamais
```

---

## 1. ÉCRITURE — d'où vient un retour, et sa forme en base

### 1.1 La forme d'une ligne (`K/retained_item.ts`)

Union fermée `RetainedItem` (`retained_item.ts:455-484`) ; kinds (`:91`), scopes `durable | next_plan`
(`:121`), sujet `household | member:<uuid>` (`:140-141`), sources `written | questionnaire |
conversation | draft_note` (`:187-193`, `conversation` retirée `:619`).

Objet complet, tel que le test d'écriture le construit (`K/retained_items_io_test.ts:46-60`) :

```json
{
  "kind": "food.exclude",
  "scope": "durable",
  "subject": "household",
  "text": "les rochers coco",
  "value": null,
  "source": "questionnaire",
  "at": "2026-08-18",
  "item": "",
  "confidence": null,
  "quote": "les rochers coco, plus jamais"
}
```

`quote` est obligatoire côté serveur depuis le lot M2 (`unquoted` ⇒ refus, `retained_items_io.ts:57-59`
du test). Pour « Paul n'aime pas le poulet » : `subject: "member:<uuid de Paul>"`, `text` = les mots.

### 1.2 Où ça vit

`student_goals.practical_constraints` — trois clés : `retained_items` (durable), `retained_next_plan`
(semaine), `memo` (notes libres). Écriture serveur unique :
`persistRetainedItemsFor` (`K/retained_items_io.ts:335`) → RPC `keel_write_retained_items_for`
(`:160`, corps dans `supabase/migrations/20260818250000_the_server_had_no_write_port.sql:103-236`) :
compare-and-swap sur l'instantané attendu ⇒ `stale_snapshot` si la colonne a bougé.
Journal : `keel/retained_items_write` (`retained_items_io.ts:620-640`).

Les régimes/allergies **ne passent pas par là** : `household_food_restrictions` (`H:2286`),
`household_safety.ts`, `restriction_guard.ts`. Un `food.exclude` est un goût, jamais une sécurité
(`draft_note_classify.ts:331` : « never file an allergy… at most a food.exclude »).

### 1.3 Les trois producteurs

| Source | Chemin | Kind / scope / sujet | Filtre qui fait tomber la ligne |
|---|---|---|---|
| **Bilan de fin de plan** | `keel-plan-feedback-v1/index.ts:328-340` lit `never_again[_foods]` / `make_again[_foods]` → `:461 retainedItemsFromPlanFeedback` → `:544 persistRetainedItemsFor({durable})` | `never_again → food.exclude`, `make_again → food.prefer` (`K/plan_feedback_retained.ts:616-617`) ; sujet `household` sauf `subject` explicite → `member:` (`:639-650`) ; scope `durable` | **`notInPlan`** (`:655-658`) : le mot doit être EXACTEMENT (trim) un titre de plat ou un terme d'ingrédient du plan. « rougaille saucisse » tapé librement ≠ « Rougail saucisses, riz » ⇒ refusé, compté, jamais écrit. |
| **Note sur brouillon** | `H:2519-2549` `readDraftNote` → `draftNoteSuffix` (prompt), puis `classifyAndPersistDraftNote` `H:9681` (après écriture) ou `H:6501` (sur refus `mouth_unfed`) → `K/draft_note_classify_io.ts:202` | le classifieur (modèle) range en `preferences` ⇒ `durable`, `next_plan` ⇒ `next_plan` (`draft_note_classify.ts:845-847`), sujet par `member_id` du roster (`:210`) | modèle indisponible ⇒ `model_unavailable`, rien d'écrit ; journal `keel/draft_note_classify` (`draft_note_classify_io.ts:603-625`) |
| **Carte « ce que Sophia sait »** | `frontend/src/keel/api/retainedItems.ts:2085` → RPC `keel_write_retained_items` (`migrations/20260818240000…`) | `source: "written"` | port client, même forme |

**Fait clé sur la note (①)** : dans la génération qui porte la note, elle n'est qu'une consigne de
prompt (`K/plan_draft_note.ts:429-441` : « Change only what they ask for here: - <note> … Say nothing
about this instruction »). La ceinture de cette génération lit `routedRetained.composition`, construit
à `H:2947` à partir du magasin lu à `H:2913/2931` — **avant** que la note soit classée (`H:9681`).
« J'aime pas trop le rougaille saucisse » ne devient un terme de ceinture qu'à la génération N+1.

---

## 2. LECTURE AVANT LE MODÈLE

`H:2913` `readRetainedItems(practical_constraints)` (durable) + `H:2931` `nextPlanItemsFor({userId})`
(next_plan, **par le user_id du composeur seul** — commentaire `H:2926-2945` : les envies déposées par
les autres titulaires ne sont lues par personne, trou nommé) → `H:2947 routeRetainedItems` →
`H:3005 compositionLinesByMouth({items, mouths: members, ownerMemberId})`.

`K/retained_items_routing.ts:436-520` :
- `subject === "household"` ⇒ la ligne sort **inchangée** dans le sac du titulaire (`:470`) ;
  sans titulaire à table ⇒ `householdUnattached`, non servie.
- `member:<id>` du roster ⇒ `"${text}${reachSuffix(kind)}"` = marquée `THIS PERSON ONLY` (`:482`).
- membre hors roster ⇒ `otherSubjects`, compté, jamais servi.
- `source: "written"` ⇒ sac `written`, sinon `remembered` daté, trié plus récent d'abord.

Ce que le modèle lit avec la marque (`K/household_voices.ts:571-580`, `VOICE_REACH_RULE`) : laisser
l'aliment hors du plat commun si rien ne l'appelle ; si la table l'a demandé, servir la table et donner
à cette personne **une boîte du même plat où le composant est remplacé, cuit dans une préparation à
part** ; « never a separate dish for a dislike, never a ban for everyone ».

Donc :
- « pas de rougaille saucisse » (household) ⇒ ligne brute sous le titulaire, vaut pour la table.
- « Paul n'aime pas le poulet » (member:Paul) ⇒ `Paul n'aime pas le poulet — THIS PERSON ONLY` sous Paul,
  et la hiérarchie ci-dessus une fois pour tout le bloc.

Compteurs : `keel.household_meal.retained_items` (`H:3191`) — `composition, portion, rhythm, logistics,
craving, unrouted, portion_excluded, refused, legacy_notes, other_subjects, portion_applied` ;
`keel.household_meal.notes` (`H:5462`) — `lines, household_lines, member_lines, served, block_served,
other_subjects` ; `member_voices` (`H:4717`), `voices_used` (`H:5284`).

**Lane solo** (`S:1450`) : `compositionLinesFor({speaksFor:[household]})` ; après le modèle,
`checkWrittenInstructions` (`S:3661-3673`) ne fait que pousser `written_instruction_unanswered` dans
`issues`. Le parseur y reçoit `boxMemberExclusions: []` (`S:2659`) : **aucune ceinture sur la lane
solo** ; un plat qui contredit l'exclusion est gardé et ses kcal comptés tels quels.

---

## 3. CEINTURE APRÈS LE MODÈLE

### 3.1 Les termes (`K/food_exclusion_belt.ts:134` `exclusionTermsFor`)

`termsOfInstruction(text)` (`K/written_instruction_check.ts`, mots-outils retirés, pluriel déposé,
≥ 3 lettres) puis `categoryFormsOf` (`K/dietary_regime.ts`, **à sens unique** : « poisson » déplie
saumon/cabillaud…, « saumon » ne déplie rien). Chaque jeton ⇒ un `ForbiddenTerm {ruleId: texte, token}`.

**Mesuré ce jour** (script `FB/probe_terms.ts`, module pur, aucune écriture) :

| Phrase | Jetons | Conséquence |
|---|---|---|
| « J'aime pas trop le rougaille saucisse » | `["rougaille","saucisse"]` | **deux interdictions indépendantes** : « Lentilles aux saucisses » mord (ingrédients), « Rougaille de tomates » mord en surface `all` (titre). |
| « Rougail saucisses, riz » (titre) + ingrédient « saucisses de Toulouse » | | mord par `saucisses` seulement — « Rougail » ≠ « rougaille ». |
| « Paul n'aime pas le poulet » | `["paul","poulet"]` | `paul` est du bruit (inoffensif tant qu'aucun ingrédient ne s'appelle ainsi) — c'est pour ça que la surface par bouche est `"ingredients"` (`food_exclusion_belt.ts`, doc de `surface`). |
| « Gratin », méthode « sans saucisse » | | ne mord pas : mode ceinture, la négation dans le PLAT vaut ce qu'elle dit. |

Appariement : `findForbiddenMatches` (`K/forbidden_matcher.ts`, frontières de mot, « lait » ≠ « laitue »).
Préparations pliées dans le plat (`dishBitesExclusion`, `uses[] → preparationById`).

### 3.2 La ceinture par bouche — dans le parseur (`K/meal_generation.ts`)

Entrée : `H:5613-5621` `memberExclusionTerms` (un jeu par membre, `subject: member:<id>`) →
`H:5755 boxMemberExclusions` → `meal_generation.ts:5813-5820 mouthExclusions` (bouches du roster seulement).

Par boîte, par nom sur le couvercle (`:7228-7277`) :
- surface = items **de cette boîte** si elle en a (`box_scoped++`), sinon le plat entier ;
  toujours `"ingredients"` — jamais titre ni méthode.
- morsure ⇒ `exclusionBelt.refused++`, `boxHeldOff.push({memberId, cause:"exclusion", boxId, via,
  preparationId, matched})`, issue « … mouth dropped from the box », **`continue` : le nom n'est pas
  poussé dans `memberIds`**. Rien d'autre ne bouge : les `items[].grams` de la boîte restent.
- `:7362-7370` : `memberIds.length === 0` ⇒ la boîte entière est **jetée** (`boxesRefused++`).
- `:7470-7485` : par plat, `bites` / `separated` (le modèle avait donné une boîte sans l'aliment) /
  `not_separated` (retrait).
- `:7682` : `dish.heldOff = boxHeldOff`.

Compteurs `exclusion_belt` (`:1677-1686`) : `mouths, checked, kept, refused, bites, separated,
not_separated, box_scoped`. Même mécanique pour le régime (`:7192-7215`, `regime_belt`, `:1611-1633`).

**Donc une morsure par bouche ≠ grammes à 0, ≠ plat retiré, ≠ composant séparé.** C'est une
APPARTENANCE retirée (nom ôté du couvercle). La boîte d'échange n'existe que si le modèle l'a écrite
(`separated`) ou si la relance « personne sans repas » l'obtient.

### 3.3 La ceinture du foyer — relance (`H:5951-6067`)

`householdExclusionTerms` (sujet `household`) ; pour un plat **sans aucune boîte attribuée**, l'union
avec tous les termes de toutes les bouches (`H:5978-5981`). Surface `"all"` (titre + méthode).
Morsure ⇒ `exclusionRetryInstruction` (« Rewrite ONLY these dishes … Do NOT drop the dish ») →
`generateWithGemini(.exclusion_retry)` → accepté si `retried.dishes.length >= meal.dishes.length
&& after < before` (`H:6031-6040`). Morsure survivante ⇒ `issues` (`H:6046-6051`), jamais un retrait.
Log `keel.household_meal.exclusion_belt` (`H:6053-6067`) : `terms, terms_unallocated, bites_before,
retried, bites_after` + les 8 compteurs du parseur.

### 3.4 Personne sans repas (`H:6146-6586`)

`mealsDelivered` (`K/meals_delivered.ts:144`) : une bouche est nourrie à une case si son propre plat,
ou un plat de table sans boîte qui ne mord pas son régime (`:249-256`), ou **exactement un** couvercle
à son nom. Sinon cause (`:288-296`) : `held_off_regime` > `held_off_exclusion` > `not_named`, avec
`boxId` de la boîte d'où elle est sortie.

- `H:6206 UNFED_RETRIES_MAX = 3` — `unfedRetryInstruction({partial:true})` nomme la bouche, la case,
  le plat, le remède ; accepté en entier (`H:6265-6272`, **avec** `mealSourceText`) ou par cellule
  (`mergeRetryByCell`, `K/retry_merge.ts`, `H:6282-6305`, log `unfed_retry_merged`).
- `swapPresence` (`H:6338`) : régime seulement, pas les goûts.
- **Dernier recours** `restoreHeldOff` (`H:6421-6447`, `K/meals_delivered.ts:507`) — **pour un goût
  seulement** : la bouche est **remise sur la boîte même** qui porte ce qu'elle évite (`restored`),
  ou sur la boîte de table du même plat si la sienne a été jetée (`fallback`). Issue : « kept on the
  shared box although it carries what they avoid ». `delivered` est recalculé (`H:6447`).
- Reste une bouche sans repas et `!isDraft` ⇒ **422 `mouth_unfed`** (`H:6575-6586`) ; en aperçu, on
  garde et on montre.

Log `keel.household_meal.meals_delivered` (`H:6458-6477`) : `mouths, expected, fed, missing,
missing_before, held_off_regime, held_off_exclusion, not_named, double, no_dish, cells_without_dish,
unplaced_dishes, retried, retry_attempts, retry_accepted, retry_merged_cells, retry_on, restored,
restored_fallback`.

---

## 4. LE CALCUL CALORIQUE APRÈS LA MORSURE

Ordre d'exécution dans `H` (numéros de ligne croissants = ordre réel) :
parseur+ceinture (`5795`) → ancre protéique (`5853`) → ceinture foyer (`5951`) → livraison, relances,
restauration (`6146-6447`) → refus (`6575`) → `fillPlanComposition`/`regramMeal` (`6624/6694`) →
`mouthDayEnergy` + `householdAnchors` (`7851-7941`) → `sizableBoxes` (`7998`) → facteurs de bac
(`8021-8072`) → `resolveBoxFactors` (`8073`) → croissance des casseroles (`8112-8200`) →
`sizeBoxesFromTarget` (`8201`) → `unmetDemand` (`8318`) → `densifyBoxes` (`8341`) → log (`8451`).

**⇒ La ceinture tourne AVANT tout le calcul ; le calcul ne voit que `box.memberIds` finaux.**
Il n'existe aucune variable « cette bouche a été retirée » côté énergie : `heldOff` n'est lu que par
`mealsDelivered`/`restoreHeldOff` et le classement des relances.

### (a) Une bouche qui perd un plat : ses autres boîtes regrossissent-elles ?

**Non, et sa journée ne tombe pas « sous le besoin » aux yeux des compteurs, parce que le besoin est
réduit avec elle.**

- `mouthDayEnergy` (`K/mouth_energy.ts:628-750`) : pour chaque plat, une tranche par bouche **présente
  sur une boîte** (`dishSlices :279-299` / `boxKcalByItems :389`). Un nom retiré du couvercle ⇒ aucune
  tranche ⇒ le plat n'entre ni dans `row.kcal`, ni dans `row.slots`, ni dans `row.ownSlots`
  (`:700-720` : `slots` reçoit le moment si elle est sur une boîte du plat, `ownSlots` si elle y est
  seule).
- `anchorFactorFor` (`K/mouth_anchor.ts:1001-1210`) : cible du jour = `slotPlanTargets({coveredSlots:
  day.ownSlots, wholeSlots: declared ∪ day.slots})` (`:1144-1152`) — **la part du moment perdu sort
  du numérateur** (il n'est plus couvert) tout en restant au dénominateur (déclaré). `raw =
  effectiveTarget / day.kcal` (`:1160`) : les deux côtés baissent ensemble, le facteur ne monte pas,
  ses autres boîtes ne grossissent pas.
- `unmetDemand` (`K/pot_demand.ts:109-175`) compare `anchor.targetKcal` — la cible **réduite** — au
  livré : `unmetKcal = 0`, cause `none`. La journée à deux repas sur trois est « fermée ».

Le seul compteur qui voit le repas manquant est `meals_delivered.held_off_exclusion` — et il est
**ramené à zéro par la restauration** (`H:6447`, `restored++`). Une fois remise sur le bac, la bouche
redevient mangeuse de ce bac : `common_pot` (`mouth_energy.ts:284-288`), `potFactorFor` la compte parmi
`eaters` (`H:8021-8072`), `tubServed` lui attribue `kcal/memberIds.length` (`H:8283-8316`). Sur le
papier elle est nourrie ; dans l'assiette, c'est le plat qu'elle a dit ne pas vouloir.

### (b) La densification voit-elle les morsures ?

Elle voit l'état d'après (ordre ci-dessus), mais elle ne répare que `factor_clamped` / `both`
(`H:8358-8362`) sur des boîtes **à un seul nom** (`H:8345`). Un repas manquant n'est ni un déficit
(cible réduite, § a) ni une boîte : `densifyBoxes` (`K/box_densify.ts:156`) n'a rien à déplacer.
Compteurs `densify` (`box_densify.ts:278-283` + `H:8404-8408`) : `moved_g, closed_kcal, stops
{closed, floor, ceiling, pot_exhausted, no_dense_target, no_box, no_density}, remaining_lt_200,
remaining_gte_200`.

### (c) Courses et casseroles après une morsure

- Retrait d'un nom : la boîte garde ses grammes (`meal_generation.ts:7370`) ; les casseroles gardent
  leurs ingrédients ; `shopping_list` n'est touchée que par `scaleShoppingList` (`H:8196`), appelé
  seulement si une casserole a **grossi** (`growth.scaled > 0`), au facteur **moyen** des casseroles
  grossies. **Rien ne rétrécit jamais** (`H:8098`, « on agrandit, on ne rétrécit jamais ici »).
  Une boîte jetée (`:7362`) sort de `drawsByPot` (`H:8117-8121`) et de la somme des tirages : la
  casserole était produite pour N, elle reste produite et achetée pour N — sans compteur d'excédent.
- `gramsRaw` : `regramMeal` (`K/meal_generation.ts:5005`) ne réécrit que `ingredients[].gramsRaw` des
  plats/préparations à partir de l'index de composition — il ne dépend pas des couvercles.
- Relance foyer acceptée : `meal = retried` ⇒ la liste de courses est celle de la relance (le modèle
  a réécrit le plan entier). Relance « personne sans repas » par cellule : `retry_merge.ts` importe
  casserole + session + courses (`shopping_added / pruned / conflicts` dans `unfed_retry_merged`).
- `cooking_plan.ts` / `grocery_waves.ts` lisent `preparations` et `shoppingList` (`grocery_waves.ts:347`),
  jamais les boîtes.

### (d) Où un retour peut faire écrire un chiffre FAUX

1. **`H:6038` — la relance d'exclusion adopte le plan sans son texte source.** `meal = retried;` sans
   `mealSourceText = retryResult;` (les trois autres relances le font : `H:5893, 6271, 6392`).
   `reconcilePortions` (`H:6963-6968`) relit `extractMemberPortions(mealSourceText)` = la réponse
   **d'avant** ; `member_portions` est écrit en base à `H:9059, 9130, 9767` (`portion_note`,
   `preparation_shares[].note` — des phrases, `K/household_portions.ts:206-219`) et lu par
   `DishCard.tsx`, `MealBuilder.tsx`, `CookingSessions.tsx`. Ce sont des **mots** (« une grosse part
   du rougail »), pas des grammes — mais des mots qui nomment un plat que la relance vient de réécrire.
   `reconcilePortions` jette les `preparation_id` inconnus (`shareCounts.unknown`), donc une part du
   défaut est silencieusement filtrée, l'autre (préparation gardée, plat réécrit) passe.
   **Le test qui nomme cette cicatrice vérifie le mauvais bloc** : `K/meals_delivered_test.ts:463-482`
   dit « la relance d'exclusion faisait `meal = retried` sans `mealSourceText` » et découpe la source
   3 000 caractères avant `"unfed retry failed"` — le bloc de la relance *personne sans repas*, pas
   celui de `"exclusion retry failed"` (`H:6044`). Vérifié ce jour : le bloc d'exclusion contient
   `meal = retried;` et pas `mealSourceText = retryResult;`.

2. **La restauration écrit un livré vrai sur une assiette fausse** (§ a). `restored`/`restored_fallback`
   le comptent, l'issue le dit, mais la chaîne énergie ne distingue pas « nourrie » de « nourrie sous
   protestation ». Si la personne ne mange pas ce plat, sa journée est sous-nourrie sans qu'aucun
   `unmet` ne bouge.

3. **Cible réduite = sous-alimentation fermée** (§ a) sur l'aperçu (`isDraft`, on garde et on montre)
   : `unmet: none`, `missing` visible seulement dans `meals_delivered`.

4. **Lane solo** : aucune ceinture (`S:2659`), le plat exclu reste, ses kcal sont comptés
   (`keel.meal.envelope`, `portion_scaling`) ; la seule trace est `written_instruction_unanswered`
   (`S:3673`) — un plan « à la cible » composé d'un plat que la personne a dit ne pas manger.

5. **Deux jetons pour un plat** (§ 3.1) : « rougaille saucisse » interdit aussi toute saucisse et,
   côté relance foyer (surface `all`), tout plat titré « Rougaille … ». Une phrase sur un plat devient
   deux règles sur des aliments, et ce que le modèle reçoit ensuite (« "Lentilles aux saucisses"
   contains saucisses — they wrote: … ») le fait réécrire un plat jamais visé.

6. **Le bilan refuse ce qui n'est pas dans le vocabulaire du plan** (`plan_feedback_retained.ts:655-658`,
   `notInPlan`) : « rougaille saucisse » tapé librement contre un titre « Rougail saucisses, riz » est
   compté et perdu — pas un chiffre faux, une règle qui n'existe pas alors que la personne l'a donnée.

7. **Le corps d'une bouche retirée puis remise n'est pas recalculé** — il n'a pas à l'être : rien dans
   `householdAnchors` ne dépend de `heldOff`. Mais `potFactorFor` est **fail-closed** (`H:8054`,
   `pot_mouth_unknown`) : si la bouche restaurée est hors `anchorMouths` (roster ≠ table), le bac
   entier s'abstient à facteur 1.

---

## 5. TESTS EXISTANTS ET LE CAS QUI MANQUE

| Étape | Fichier | Ce qui est épinglé |
|---|---|---|
| termes / morsure / relance | `K/food_exclusion_belt_test.ts:47-331` (16 tests, verts ce jour) | « lait » ≠ « laitue », mode ceinture, `poisson→saumon` à sens unique, préparation pliée, câblage lane foyer (`:163, 189, 214, 331`) |
| retrait de bouche / échange | `K/household_regime_belt_test.ts:322-1217` | la bouche sort, les autres restent ; boîte vidée tombe ; `separated/not_separated` ; boîte d'échange gardée ; réparation de citation |
| livraison / causes / restauration | `K/meals_delivered_test.ts:75-127, 289-311, 370-698` (53 verts) | `held_off_exclusion` nommé avec `boxId` ; dernier recours pour un goût seulement ; câblage `mealSourceText` — **sur le bloc unfed** (`:463`) |
| énergie | `K/mouth_energy_test.ts`, `mouth_anchor_test.ts`, `pot_demand_test.ts`, `box_densify_test.ts`, `pot_regram_test.ts`, `household_body_share_test.ts`, `target_grams_test.ts`, `condition_energy_gate_portions_test.ts` | **0 occurrence** de `heldOff`, `held_off`, `food.exclude` ou `exclusion` dans ces 8 fichiers (grep ce jour) |

**Le cas manquant** : un plan à boîtes où une bouche est retirée d'une boîte par exclusion, puis
`mouthDayEnergy` + `householdAnchors` + `unmetDemand` sur ce plan, avec l'assertion attendue
(« sa cible du jour est réduite au moment couvert, `unmet.none`, et `meals_delivered.missing = 1` » —
ou l'inverse si le produit décide que la journée doit être fermée par les autres boîtes). Aujourd'hui
ce comportement est vrai par composition de deux modules testés séparément, jamais par un test qui
traverse la frontière ceinture → énergie. Second cas manquant : `meals_delivered_test.ts:463` dupliqué
sur le bloc `"exclusion retry failed"`.

---

## 6. LES COMPTEURS À LIRE DANS UN TIR RÉEL (tag → champs)

| Étape | Tag | Champs à lire |
|---|---|---|
| Écriture (bilan / note / carte) | `keel/retained_items_write` (`retained_items_io.ts:620`) | `producer, durable_written, next_plan_written, refused_total, refused_unquoted, refused_misfiled, refused_forbidden_kind` |
| Classification de la note | `keel/draft_note_classify` (`draft_note_classify_io.ts:603`) | `event, durable_written, next_plan_written, write_reason, clarify_asked` |
| Lecture next_plan | `keel/retained_next_plan` `event:"read"` (`retained_next_plan.ts:628`) | `stored, readable, alive, refused_*` |
| Lecture → prompt | `keel.household_meal.retained_items` (`H:3191`) | `composition` (nb de lignes food/method), `unrouted` (≠0 = famille sans lecteur), `other_subjects`, `refused` |
| Prompt servi | `keel.household_meal.notes` (`H:5462`) ; `member_voices` (`H:4717`) ; `voices_used` (`H:5284`) | `served`/`lines`, `block_served` ; `with_lines, lines_raw` ; `heard` |
| Ceinture | `keel.household_meal.exclusion_belt` (`H:6053`) | `terms` (dénominateur), `terms_unallocated`, `bites_before`, `retried`, `bites_after`, `mouths, checked, kept, refused, bites, separated, not_separated, box_scoped` ; `checked=0` avec `mouths>0` = le modèle n'a ventilé aucune boîte |
| Livraison | `keel.household_meal.meals_delivered` (`H:6458`) | `held_off_exclusion, missing, missing_before, retry_attempts, retry_accepted, retry_merged_cells, retry_on, restored, restored_fallback` ; `unfed_retry_merged` (`H:6293`) : `shopping_added, shopping_pruned, shopping_conflicts` |
| Énergie | `keel.household_meal.box_sizing` (`H:8451`) | `anchor {anchored, clamped, no_delivery, common_pot_day, day_incomplete, no_body…}`, `anchor_applied`, `box_factor_source`, `pot {…}`, `pot_growth {scaled, capped, shopping, regrammed, passes, short_after}`, `unmet {none, factor_clamped, pot_ceiling, both, not_anchored, tub_estimate}`, `unmet_band`, `densify {moved_g, closed_kcal, stops…, remaining_*}`, `sized, capped_by_pot, unverifiable` |
| Relecture du plan | `keel.household_meal.regrammed` (`H:6697`), `sized_shares_relinked` (`H:8595`) | `lines` ; `relinked, boxes` |
| Modèle | `llm_usage_events.source` | `generate-household-meal-v1.exclusion_retry`, `.unfed_retry`, `.swap_retry`, `.protein_anchor_retry` — et `draft_note_classify` |

Banc minimal pour « une exclusion ⇒ énergie » : `exclusion_belt.refused` (n retraits) → `meals_delivered.held_off_exclusion` (avant relance) → `retry_accepted + restored` (doit égaler les retraits non comblés) → `box_sizing.anchor` (les journées de la bouche restent `anchored`, pas `no_delivery`) → `unmet.none` inchangé. Un `restored > 0` avec `unmet.none` est le cas ② du § 4(d) : nourrie sur le papier.

---

## 7. CLASSEMENT DES CASSURES SILENCIEUSES

### BLOQUANT
- **B1 — `H:6038` relance d'exclusion sans `mealSourceText`** ; `member_portions` écrit en base
  (`H:9059/9130/9767`) depuis la réponse d'avant. Fait : grep ce jour, bloc avant `"exclusion retry
  failed"` = `meal = retried;` présent, `mealSourceText = retryResult;` absent ; le test
  `meals_delivered_test.ts:463` qui nomme la cicatrice épingle un autre bloc.

### À CORRIGER
- **C1 — la restauration nourrit sur le papier** (§ 4a/d-2) : `restored > 0` n'a aucun écho dans
  `unmet`. Fait : `restoreHeldOff` pousse le nom (`meals_delivered.ts:535` / `:555`), `mouthDayEnergy` ne lit
  pas `heldOff`.
- **C2 — aucun test ne traverse ceinture → énergie** (§ 5). Fait : 0 occurrence dans 8 fichiers.
- **C3 — une phrase, deux règles** (§ 3.1). Fait : `termsOfInstruction` rend `["rougaille","saucisse"]`,
  chaque jeton devient un `ForbiddenTerm` séparé (`food_exclusion_belt.ts:157-164`).
- **C4 — lane solo sans ceinture** (`S:2659`), issue seule (`S:3673`).
- **C5 — les courses ne rétrécissent jamais après un retrait** (`H:8098`, `8196`) ; une boîte
  jetée (`meal_generation.ts:7362`) laisse sa casserole et ses achats intacts, sans compteur.
- **C6 — la note du brouillon n'est pas un terme de ceinture dans sa propre génération**
  (`H:2519-2549` prompt seul ; classée `H:9681`). L'utilisateur qui écrit « j'aime pas le rougaille
  saucisse » sur l'aperçu peut recevoir le plat dans le plan qu'il compose là, et seulement le suivant
  le retirera.

### ACCEPTABLE (documenté, compté)
- Cible réduite au lieu de regrossir les autres boîtes (§ 4a) — c'est la règle `ownSlots` posée le
  2026-09-04 (`mouth_anchor.ts:1124-1152`), contre le 6,28 de Christèle ; compté par `meals_delivered`.
- `notInPlan` au bilan (`plan_feedback_retained.ts:655-658`) — la règle est stricte et le refus compté.
- `next_plan` lu sur le seul composeur (`H:2926-2945`) — trou nommé, décision produit.
- Sens unique catégorie → espèce (`food_exclusion_belt.ts`, test `:278`).
- Bac commun fail-closed (`H:8054`).
