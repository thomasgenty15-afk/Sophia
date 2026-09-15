# Ce qui est écrit, éprouvé, et **n'a pas d'appelant de production**

Le plan l'exige : « Une étape laissée non branchée, un test sauté ou une dégustation non
réalisée reste **nommé comme tel**. » Cette liste est tenue pour que le rapport final ne puisse
pas la contourner.

⛔ **Un module testé mais non appelé ne clôt pas un lot.** C'est écrit dans le plan, et c'est la
cicatrice « ceinture armée sur coffre vide » de ce dépôt.

## ① ~~`FINAL_GATE_POLICY_LOT_4` — écrite, non branchée (lot E)~~

**FERMÉE le 2026-09-12 par l'étape C5.** Le handler passe `FINAL_GATE_POLICY_LOT_4`
(`generate-household-meal-v1/index.ts`, l'unique appel à `finalPlanGate`), et
`FINAL_GATE_POLICY_LOT_1` n'y est plus passé nulle part — épinglé par
`plan_validation_wiring_test.ts` § ① dans les deux sens.

**La branche 422 est atteinte, et elle empêche l'écriture. Mesuré au banc du
transport contrôlé (0 appel modèle facturé), compte `lotf.perte.c5a`:**

| run | commande | résultat |
|---|---|---|
| nominal | `perte --compte=c5a --retaille --horloge=2026-09-11T19:42:01+02:00` | **200**, plan `1ad70c8c` écrit, `blocking: 0`, `delivery: deliverable_with_gaps` |
| refus | le même **+ `--sans-portion=sun/dinner --remplace`** | **422 `plan_not_deliverable`**, `cell_without_portion: 1` |

Sur le run de refus, l'intent était `replace_current` **visant `1ad70c8c`** — le
seul chemin où un remplacement invalide est possible. La relecture de la base,
avant/après, dans la même exécution :

```
plans avant 1 · après 1
lignes AJOUTÉES  : 0 []
lignes RETIRÉES  : 0 []
lignes RÉÉCRITES : 0 []
✅ REFUS SANS ÉCRITURE : la base n'a pas bougé d'une ligne.
```

⚠️ **La porte a changé de PLACE, et c'est la moitié du correctif.** Le `return`
du lot E vivait à l'endroit de la garde, c'est-à-dire **dans** la boucle de
réparation de C4 : armé tel quel, il aurait refusé le PREMIER jet et rendu la
réparation inatteignable — armer le refus en débranchant la réparation. Il vit
maintenant au point de livraison, après le budget et avant `completeDraft` **et**
`write_student_meal_plan`. Trois épingles de position le tiennent.

⚠️ **Les faux positifs ont été mesurés avant l'armement**, sur les onze sorties
de `sorties-lot-F/` : les douze causes armées en `refuse` valent zéro sur dix
d'entre elles. La onzième (`gain`, `ingredient_not_bought: 1`) est un vrai manque
d'achat — le faux positif de pluriel est mort avec `covers()` au lot E.

## ② ~~`defectsFromRefusals` — posée et testée, sans appelant (lot E)~~

**FERMÉE le 2026-09-12 par l'étape C4.** Le pont **garde → budget de réparation** est branché :
`collectPlanDefects` (`plan_defect_pass.ts`) l'emprunte, et le handler l'appelle au point de
décision qui suit la garde finale. `judgeCandidate` et `planRepairPass` ont le même appelant.

**Mesuré au banc du transport contrôlé (0 appel modèle facturé), plan `b745b64c` :**
`by_source: {gate: 3, output_contract: 0, quantities: 0}` → `charged: ["final_repair"]` ×2 →
`calls_made: 2` → le `protein_floor_short` du tir 1 **disparaît** du verdict final.

⚠️ **Ce que ça ne ferme pas** : le budget de deux réparations est **partagé** avec les sept
rattrapages d'amont. Mesuré sur le run `--sans-ref` : `density_repair` l'a consommé **deux
fois** avant la garde, et les **37 défauts d'identité** du contrat de sortie ont atteint le
budget pour s'y voir répondre `attempts_exhausted`, avec `calls_made: 0`. Le pont existe ; il
peut trouver la caisse vide.

## ③ `Z1` — `portion_scaling_inputs.ts::proteinFoodPredicate` et `scalingInputsFor`

**TOUJOURS MORTE, DÉLIBÉRÉMENT, ET C'EST MAINTENANT PROUVÉ PAR UN TEST.**
`plan_validation_wiring_test.ts` § ⑥ Z1 lit **tous** les `index.ts` de
`supabase/functions/*/` et exige qu'aucun ne cite `scalingInputsFor`,
`proteinFoodPredicate` ni `scaleFactorsFor` — leur unique consommateur.

**L'audit d'absence, fait le 2026-09-12 :**

- `scalingInputsFor` n'a que trois importateurs, **tous des tests** :
  `portion_scaling_inputs_test.ts`, `fed_days_test.ts`,
  `verdict_anchor_same_denominator_test.ts`.
- Son seul consommateur possible est `scaleFactorsFor` (`portion_scaling.ts`),
  et le handler n'importe de ce module que **`scaleIngredients`**.
- ⚠️ **La précision de l'entrée d'origine est corrigée** : le prédicat ne classe
  pas par une liste de mots — il appelle `resolveIngredient(index, term)` puis
  lit `foodGroupRef`. Il classe donc **par le TERME**, c'est-à-dire par la
  lecture que l'étape C3 a remplacée partout par l'identité (`ref` d'abord,
  `resolveCompositionLine`). Le rebrancher tel quel réintroduirait cette
  lecture-là, et le plan l'interdit nommément.
- ⚠️ **Un test voisin repose sur une prémisse périmée** :
  `verdict_anchor_same_denominator_test.ts` s'ouvre sur « on APPELLE les trois
  lecteurs **de production** — `verdictFor`, `scaleFactorsFor`,
  `offBandDistance` ». `scaleFactorsFor` n'en est pas un. Défaut **nommé, non
  corrigé** : le retirer touche `portion_scaling.ts`, `meal_verdict.ts` et trois
  suites, ce qui est une suppression, pas l'étape C5.

## ④ ~~`Z2` — `index.ts::tubServed` garde un oubli de repli (lot B)~~

**FERMÉE le 2026-09-12 par l'étape C5.** `unmetDemand` (`pot_demand.ts`) portait
`tubServed: … = new Map()`. Ce défaut faisait de « aucune journée de bac commun
n'est estimable » la réponse **silencieuse** de tout appelant qui l'oublie —
cicatrice `optional-gate-params-are-disarmed-gates`, et le jumeau exact de la
note écrite dix lignes plus haut pour `potShrink` (« ⛔ REQUIS, jamais `?` »).

Le paramètre est **requis**. Les onze appels du banc passent désormais leur carte
explicitement (dont deux qui passent `new Map()` **exprès**, pour le cas
« sans estimation »). Aucun changement de comportement : 6 826 verts, 0 rouge.

## ⑤ ~~`Z3` — `empty_intersection` a un rendu **sans producteur** (lot B)~~

**FERMÉE — et elle l'était déjà.** L'entrée était fausse depuis le lot qui a
agrégé les quatre compteurs de densité. La chaîne, vérifiée et épinglée
(`plan_validation_wiring_test.ts` § ⑥ Z3) :

`portion_sizing.ts::mergeCorridors` (`vide ? "empty_intersection" : null`)
→ `slot_nutrition_contract.ts:655` → importé par le handler
→ `densityCounters.empty_intersection += …` au journal.

## ⑥ Demandes au voisin encore ouvertes (lot E)

- ~~`mealShoppingPayload` doit porter `ref` + `amount`/`unit`.~~ **FERMÉE le 2026-09-12 par
  l'étape C3.** La projection écrit `ref`, `amount`, `unit`, `state` et `purchasable` ; l'audit
  les lit d'abord et ne réinterprète plus la phrase. Mesuré sur un run du banc (plan
  `21390a65`, transport contrôlé, 0 appel modèle facturé) : **25 lignes sur 26 portent leur
  identifiant et leur quantité structurée**, et la garde finale rend
  `shopping_quantified: 24 / 25 identités · shopping_unverified: 0`. L'archive GAIN, elle,
  reste à **0 / 26** — c'est le nombre que cette demande coûtait, et il ne bouge pas
  rétroactivement.
- ~~`meal_generation.ts:6200::foodGroupOfTerm` est le **dernier lecteur de mesure qui part du
  libellé**.~~ **FERMÉE le 2026-09-12 par l'étape C3** : `foodGroupOfLine` résout par
  `resolveCompositionLine` (identifiant d'abord), et le groupe d'une ligne de courses sort de
  la même référence que son identité.
- ~~La **lecture UI des écarts** (corps 422 + `final_gate_delivery:*`), avec la règle que
  `refusals` / `incomplete` / `unevaluated` **ne se fondent jamais** en un seul nombre.~~
  **FERMÉE le 2026-09-12 par l'étape C5.** Le serveur persiste un résultat
  **structuré et versionné** dans `generated_from.validation`
  (`_shared/keel/plan_validation.ts`, `version: 1`), avec **quatre** listes qui ne
  se fondent jamais : `defects` (le plan est accusé), `incomplete` (le contrôle a
  tourné sans conclure), `not_applicable` (il ne s'applique pas — plancher
  protégé, eau du robinet) et `not_run` (dénominateur à zéro). L'écran le lit par
  un **seul** lecteur (`frontend/src/keel/api/planValidation.ts`) sur les trois
  chemins : réponse de génération, réponse d'aperçu, et **relecture de la ligne**
  (`readMealRow`). Il est rendu par `PlanValidationNotice`, monté sur `/app/plan`
  (`MealBuilder`) et sur l'aperçu (`PlanDraftDialog`).

  **La colonne réelle du plan `1ad70c8c`, écrite par un run du banc :**
  `state: "livrable_avec_ecarts"`, trois défauts (`cell_energy_off` ×2 sat/sun
  dinner, `protein_floor_short` 2026-09-13), deux contrôles incomplets
  (`shopping_quantity: 2`, `mouth_energy: 1`), deux contrôles non tournés. Elle
  est recopiée telle quelle dans `planValidation.int.test.ts` § ⑤, qui la relit
  par le vrai lecteur et la rend.

  ⚠️ **Aucun `detail` n'est persisté, et c'est une porte.** Les `detail` de la
  garde écrivent des kcal et des grammes de protéine en toutes lettres ; un
  plancher TCA masque ces nombres à l'écran. Le résultat ne porte que la cause et
  son site, `publicRefusals` retire le `detail` des cinq causes de la famille
  calorique du corps 422, et l'écran retire ces causes **entièrement** quand la
  porte d'affichage calorique de la personne est fermée.

## ⑧ Ce que C3 laisse ouvert, nommé et chiffré (2026-09-12)

- **Les contrôles quantitatifs incomplets ne sont pas tous fermés.** Sur les neuf plans
  d'archive, **63 identités** restent `present_unquantified` ou `check_incomplete` : le
  garde-manger déclare une PRÉSENCE sans quantité (`household_pantry` n'a pas de colonne de
  quantité) et un conditionnement non convertible (« 1 sachet ») n'a pas de poids. C3 les
  **compte** (`ShoppingAudit.unverified`, `checked.shopping_unverified`) ; il ne les répare
  pas, et le plan dit que « pour les repas planifiés dont TOUT le besoin doit être acheté, un
  contrôle quantitatif incomplet est un **défaut restant à traiter** ».
- **La fusion n'a pas le pont par terme exact.** `rebuildShoppingQuantities` l'a (il a fermé 2
  besoins « non achetés » et 2 lignes non attribuées sur un run réel) ; `sortShoppingLines`,
  appelé par `retry_merge.ts`, ne l'a pas. ⚠️ **Cela ne peut RIEN perdre** — la règle des trois
  sorts garde toute ligne non rattachée — mais les compteurs `unattributed` de la fusion sont
  plus hauts que la réalité.
- **« Après DEUX réparations » est prouvé au module, pas au banc.** `shopping_c3_test.ts` fait
  passer un plan par le VRAI `spliceReworkableUnits` deux fois de suite. Au banc, le drapeau
  `--reparations=N` existe et sert une réponse par tour, mais le run de GAIN n'a demandé
  **qu'une** réparation (`repairs.attempts: 1`, `still_out: 1`) : le second tour n'a pas été
  exercé de bout en bout.

## ⑨ Ce que C4 laisse ouvert, nommé et chiffré (2026-09-12)

- **Le budget partagé peut être vide quand la passe commune parle.** Voir § ② : sur un premier
  jet mal formé (`--sans-ref`), `density_repair` prend les deux slots et le site d'après la
  garde n'appelle jamais. Le plan l'accepte (« deux réparations maximum pour le plan entier »,
  « aucun troisième rappel caché ») ; le compteur qui le rend lisible est
  `keel.household_meal.plan_repair_pass.reason: "attempts_exhausted"` avec `calls_made: 0`.
- **`rounding_pot_overdrawn` atteint le budget en `repairable: false`.** Les deux dépassements
  de casserole du plan GAIN (pire cas **3,4 ‰**) sont PRÉEXISTANTS et arithmétiques : un appel
  modèle ne les répare pas. Ils sont désormais COMPTÉS comme défauts, ils ne sont pas corrigés.
- **`final_sizing.out_of_bounds` (`sun/lunch 701 g / 700`) devient un défaut réparable**, avec
  son ampleur en grammes — il n'était qu'une ligne de journal. Sa correction dépend d'un appel
  qui peut ne pas partir (point précédent).
- **Le refus effectif reste C5.** Sous `FINAL_GATE_POLICY_LOT_1`, toutes les causes valent
  `count` : `compareSafety` ne voit donc **jamais** de régression de sécurité, et la garde de
  candidate qui mord réellement aujourd'hui est la **ceinture d'exclusion** (`biteKeys`, par
  identité), pas `judgeCandidate`.
- **L'allergène introduit par une réparation n'a pas été exercé AU BANC.** Le compte de fixture
  du transport contrôlé ne déclare aucune exclusion : la garde est testée en isolation
  (`plan_defect_pass_test.ts` C4 ④) et son câblage épinglé à la source
  (`plan_repair_wiring_test.ts` C4 CÂBLAGE ⑦). Le tir réel est C6.

## ⑦ La vérification culinaire — non faite, et elle ne peut pas l'être par un agent

Le plan : « L'agent fournit les fiches et la grille ; il ne prétend ni avoir cuisiné ni avoir
prouvé la saveur avec un score modèle. Les tests automatiques peuvent être terminés alors que
cette validation gustative reste explicitement à faire. »

**Aucune recette n'a été cuisinée.** `consumers_degraded = 0` veut dire « aucune portion déjà
conforme **en densité** rendue non conforme », **pas** « aucune recette dégradée gustativement ».

## ⑩ Ce que C5 laisse ouvert, nommé (2026-09-12)

- **`draft_adopt.ts` reste sous `FINAL_GATE_POLICY_LOT_1`.** Son en-tête le dit
  déjà (« cette branche ne peut pas se déclencher aujourd'hui »). Le risque est
  borné : un aperçu non livrable n'est plus **rangé** du tout — la porte de C5
  est avant `completeDraft` —, donc aucun brouillon adoptable ne peut porter un
  défaut bloquant. ⚠️ `adoptDraft` n'a toujours **aucun appelant vivant**, et
  aucun générateur n'écrit `adoption_context` : armer sa politique n'aurait armé
  personne. Défaut nommé, pas corrigé.
- ~~**La garde qui TOMBE laisse passer le plan**~~ — ⟳ **FERMÉ, et cette note
  était en retard sur le code.** Relu le 2026-09-13 :
  `generate-household-meal-v1/index.ts:18208` refuse désormais, avec le motif à
  part `plan_validation_unavailable` (422), avant toute écriture ;
  `candidateStateOf(null)` vaut `validation_unavailable` et `chooseReplacement`
  rend `keep_previous`, donc l'ancien plan reste intact. Un second chemin fait
  la même chose quand le relevé des surfaces finales jette
  (`index.ts:18135-18184`, `output_lock_unavailable`). Ce n'est plus un
  fail-open. ⚠️ Ce qui reste vrai : **aucun harnais ne sait provoquer ce
  refus** — ni `finalPlanGate`, ni `collectOutputSurfaces`, ni
  `localizeOutputLockBites`, ni `applyKeelOutputLocks` ne portent de `throw`, et
  ajouter un interrupteur de test dans le code de production est interdit. La
  branche est donc écrite et non éprouvée de bout en bout.
- **Le `detail` du corps 422 mélange les langues.** `cell_without_portion` rend
  « un plat est posé le 2026-09-13 au **dinner** » — jeton de moment brut dans
  une phrase française. Aucun écran ne rend `detail` (le bandeau lit la cause et
  traduit le moment), donc ce n'est visible que dans un journal ; c'est une dette
  de copie de `final_plan_gate.ts`, pas de C5.
- **La séparation `incomplete` / `not_applicable` n'a pas encore d'exemple
  réel.** Sur le plan `1ad70c8c`, `not_applicable` est **vide** : ni plancher
  protégé, ni eau du robinet sur cette fixture. La liste est éprouvée au module
  (`plan_validation_test.ts` ③) et rendue à l'écran ; elle n'a pas encore été
  **observée** sur un plan écrit. C'est un dénominateur à zéro, et il se dit.
- **Le bandeau n'est monté que sur deux surfaces** : `/app/plan` (`MealBuilder`)
  et l'aperçu (`PlanDraftDialog`). `/app/today` ne le rend pas — il ne montre pas
  le plan, il montre la journée. Choix, pas oubli.

---

# SOLDE DE LA LISTE — étape C6, 2026-09-12

Rapport : [docs/keel/CLOTURE-C6-2026-09-12.md](../../docs/keel/CLOTURE-C6-2026-09-12.md).

## Ce que C6 FERME

| # | entrée | ce qui la ferme |
|---|---|---|
| ⑨ dernier point | **« L'allergène introduit par une réparation n'a pas été exercé AU BANC. »** | **FERMÉE.** La fixture qui manquait existe (`banc-lot-F.ts --exclusion=medicale\|preference\|deux`), et les trois runs sont faits : allergène en **génération** ⇒ `422 mouth_unfed`, **0 ligne écrite**, `keel.output_lock.medical { violation_count: 4 }` ; allergène en **réparation** ⇒ candidate jetée par la ceinture de préférence (`final_repair_bite_added`) **et** par la ceinture médicale, plan livré **sans** l'allergène (relu en base) ; **réponse saine, ceinture armée** (`exclusion_belt.mouths: 1`) ⇒ **acceptée**, plan `0a8c5445`. |
| ⑨ 1ᵉʳ point | **« Le budget partagé peut être vide quand la passe commune parle »** (`attempts_exhausted`, `calls_made: 0`) | **ARBITRÉE, PAS CHANGÉE — et l'arbitrage est mesuré.** Au banc en conserve, ça arrive sur 3 runs sur 7. **Sur les six tirs RÉELS, jamais** : la passe commune obtient son appel sur 5 tirs sur 6, le 6ᵉ n'ayant aucun défaut. La famine est un artefact du banc, où une réponse de réparation est servie à l'identique et ne peut pas s'améliorer. `PLAN_REPAIR_RESERVED_AFTER` reste tel quel : lui prendre un créneau le prendrait à `density_repair`, celle que la mesure donne gagnante. |
| ⑨ 2ᵉ point | `rounding_pot_overdrawn` atteint le budget en `repairable: false` | **NE SE REPRODUIT PAS.** `pots_overdrawn: 0` et `pots_overdrawn_worst_per_mille: 0` sur les six tirs réels. Le compteur reste, le défaut n'est pas réapparu. |
| ⑧ 3ᵉ point | **« Après DEUX réparations est prouvé au module, pas au banc. »** | **PROUVÉ AU RUN RÉEL.** Tir 5 : `charged: ["density_repair", "final_repair"]`, `repairs_used: 2`, puis une **3ᵉ** demande **refusée** et tracée (`repair_budget_exhausted`). Deux réparations enchaînées, et pas de troisième. |
| ⑧ 1ᵉʳ point | 63 contrôles quantitatifs incomplets | **RÉDUIT ET CHIFFRÉ, PAS FERMÉ.** Les 63 sont ceux des **neuf** plans d'archive de C3 ; le rejeu de C6 porte sur **six** réponses et en compte **27** (7 · 4 · 6 · 3 · 5 · 2). ⛔ Deux dénominateurs, jamais mêlés. Cause inchangée : `household_pantry` n'a pas de colonne de quantité, et un conditionnement non convertible n'a pas de poids. Sur les **plans neufs** de la campagne du 2026-09-12 : **2 sur 95 identités**. La colonne de quantité manquante reste un défaut de schéma. |

## Ce que C6 OUVRE, et qui n'existait pas dans cette liste

| # | défaut | état |
|---|---|---|
| ⑪ | **Le pont d'identité des courses était désarmé par C3 lui-même.** L'audit ne franchissait `identityByTerm` que si la ligne n'avait aucun `ref` — or C3 lui en a donné un, **tiré du libellé**. Un plan réel a été **refusé** (`422`) sur un ingrédient présent sur sa liste, au caractère près. | **FERMÉ le 2026-09-12.** `final_plan_audit.ts` applique la règle de `rebuildShoppingQuantities` mot pour mot ; deux régressions dans `shopping_c3_test.ts` § ⑩ (un cas qui passe, un cas qui mord) ; la **même réponse réelle** passe de 422 à 200 dans le vrai handler. |
| ⑫ | **`ingredient_not_bought` est bloquant, et la question « un œuf entier achète-t-il son blanc ? » n'est pas tranchée.** Tir 3 refusé : la recette demande 15 `egg_white`, la liste porte 19 `whole_eggs`. Deux identités, aucune couverture déclarée au référentiel. | **OUVERT, NOMMÉ.** Le geste exact si le propriétaire tranche dans l'autre sens : `final_plan_gate.ts:701`, `ingredient_not_bought: "refuse"` → `"count"`. ⚠️ Cela rendrait livrable un plan dont un ingrédient n'est acheté nulle part. |
| ⑬ | **L'arrondi au plus proche peut franchir une borne de masse** et rien ne la rabote après. Mesuré : **631 g pour un plafond de 630**, 1 fois sur 45 portions réelles (même forme que le `701 g / 700` de C4). | **OUVERT, CHIFFRÉ.** |
| ⑭ | **Le repas léger n'est exercé par AUCUN tir réel.** La fixture de campagne le déclare par `eating_rhythm[].size = "small"`, que le moteur ne lit pas (`slots.light: 0`). | **OUVERT.** Le vrai léger (par les habitudes) est prouvé au transport contrôlé : `slots {declared: 0, light: 1}`. La fixture de campagne reste à corriger. |
| ⑮ | **Une allergie déclarée produit DEUX lignes dans le prompt** : « peanut » (normalisé par l'intake) et « arachide » (libellé brut). | **OUVERT.** Dette de copie, pas un trou de sécurité. |

## Ce qui reste OUVERT et inchangé

- **③ `Z1`** — `portion_scaling_inputs.ts::proteinFoodPredicate` et `scalingInputsFor` restent
  morts **délibérément**, et le test d'absence les épingle. Inchangé par C6.
- **⑩ `draft_adopt.ts` reste au lot 1**, et `adoptDraft` n'a toujours aucun appelant vivant.
- **⑩ La garde qui TOMBE laisse passer le plan** (`catch` fail-open, `validation: null`).
  **Décision produit, pas un correctif de C6** : personne n'a demandé de refuser quand la garde
  jette, et le défaut se **voit** (l'écran se tait au lieu d'annoncer « conforme »).
- **⑩ Le `detail` du 422 mélange les langues.** Aucun écran ne le rend.
- **⑩ `not_applicable` n'a toujours AUCUN exemple réel** — **0 sur les 15 plans écrits** par C6 le
  2026-09-12. Dénominateur à zéro, publié comme tel.
- **⑦ La vérification culinaire n'est pas faite**, et elle ne peut pas l'être par un agent. Les
  fiches avant/après sur les mêmes portions et la grille de faisabilité sont au § 9 du rapport de
  clôture. **Aucune recette n'a été cuisinée.**
