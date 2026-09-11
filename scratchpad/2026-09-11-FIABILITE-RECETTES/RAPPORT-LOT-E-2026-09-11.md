# Lot E — contrôler le plan réellement livrable

Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, section « Lot E ».
Socle : `scratchpad/2026-09-11-FIABILITE-RECETTES/SOCLE.md`.
Les lots 0, A et B ne sont pas modifiés : `RAPPORT-MESURE-2026-09-11.md`,
`mesure-2026-09-11.txt`, `RAPPORT-LOT-A-…`, `mesure-lot-A-…`, `RAPPORT-LOT-B-…`,
`mesure-lot-B-…` restent l'état d'avant, à l'octet près.

> ⛔ **Aucun appel modèle, aucune génération, aucune écriture en base.** Tout ce qui suit
> sort de `deno test`, `deno check` et de l'instrument du lot 0, tous en `--allow-read`.
> Rien ici ne dit quoi que ce soit du **goût**, de la **texture** ou de la **faisabilité** :
> aucune recette n'a été cuisinée.
>
> ⚠️ **Le lot C écrivait pendant tout ce lot.** Sept fichiers que je ne possède pas ont bougé
> sous moi ; ce qui en découle est nommé au § 3.

---

## 1. Les arbitrages — la partie à lire en premier

| question | décision | raison, avec ses nombres |
|---|---|---|
| Où vit le contrôle des achats par identité ? | **Module neuf `_shared/keel/final_plan_audit.ts`**, pas dans la garde. | La garde est typée pour tourner à l'**adoption**, où l'index de composition n'existe pas — son en-tête l'écrit (« l'appelant MESURE, la garde COMPARE »). L'audit exige `CompositionIndex`. Le mettre dans la garde l'aurait rendue inappelable là où elle sert. |
| Garder `covers()` comme repli quand l'audit manque ? | **Non. Elle est SUPPRIMÉE**, et son emplacement porte un pavé qui interdit de la réécrire. | Son inclusion était asymétrique (`needle.includes(have)`) : « citrons » ne couvrait pas « citron ». **8 de ses 9 alertes du 2026-09-11 étaient fausses.** Un filet de sécurité faux 8 fois sur 9 est du bruit qu'on prendrait pour un contrôle. `ctx.shopping === null` veut désormais dire « pas contrôlé », et `checked.shopping_identities: 0` le dit. |
| La rendre symétrique plutôt que la retirer ? | **Non.** | « lait » est une sous-chaîne de « laitue » ; le dépôt a mesuré **12 faux positifs sur 12** avec un matcher artisanal (`never-hand-roll-a-matcher-here`). |
| Comment une ligne de courses trouve son identité, puisqu'elle n'a **aucun** identifiant ? | Par le référentiel d'abord ; sinon par **l'alias explicite que le plan porte lui-même** — égalité EXACTE de termes normalisés avec une ligne de recette qui, elle, déclare un `ref`. | Sans ça, le lot **créait trois faux manques neufs** : `pita complète` (PERTE), `agneau` et `petits-suisses nature` (GAIN) sont sur la liste au caractère près, mais l'ingrédient résolvait par `ref` et la ligne de courses par libellé. Le faux positif de pluriel aurait été remplacé par un faux positif d'identifiant. L'égalité est exacte : aucune sous-chaîne, aucune distance d'édition. |
| Quelle tolérance sur la suffisance d'un achat ? | **5 %** (`SHOPPING_SHORT_TOLERANCE`), exportée et épinglée. Constante opérationnelle **avouée**. | Sans tolérance, l'audit rendait `short` sur **0,74 g**. Les cinq sous-achats mesurés valent 0,21 % · 1,10 % · 1,68 % · 3,70 % · **10,48 %** du besoin. La coupure naturelle est entre 3,70 et 10,48 ; 5 % tombe dedans et laisse **un seul** vrai manque (400 g de tomate pour 446,8 requis). |
| Un garde-manger déclaré couvre-t-il un besoin ? | **Non : `present_unquantified`**, un état à part. | `household_pantry` ne porte **aucune quantité**. En déduire un stock serait exactement ce que le plan interdit : « ne pas inventer une quantité de stock si seule sa présence est déclarée ». |
| Un conditionnement illisible est-il un manque ? | **Non : `check_incomplete`**, et il ne produit **aucun refus**. | « Une conversion ou un conditionnement inconnu produit un contrôle incomplet, pas un manque quantifié inventé ». Il sort dans `counters.checked.shopping_unverified` et `finalGateDelivery().incomplete`. |
| Une suffisance non vérifiable mérite-t-elle une **cause** ? | **Non**, et c'est un refus argumenté. | Une cause l'aurait mise dans `refusals[]`, c'est-à-dire aurait fait accuser le plan par le **schéma de la base**. La faute n° 4 du lot 0 (« non applicable n'est pas non contrôlé »), prise à l'envers. |
| Le besoin d'achat se lit-il sur les boîtes ? | **Non : sur les lignes de RECETTE**, pesées par `resolveIngredients`. | Poids cru/achetable. 260 g de riz cuit ne s'achètent pas ; le test le pinne (`< 200 g`). |
| Comment peser une ligne sans réécrire l'arithmétique ? | `resolveIngredients(index, [uneSeuleLigne])`, **une ligne à la fois**. | Réécrire `resolveCompositionLine → gramsRawOf → prose → condiment` ferait une **seconde** arithmétique de la masse crue. Coût : ~100 appels par plan, hors boucle chaude. |
| La pincée conventionnée compte-t-elle comme quantité achetée ? | **Non.** Une ligne pesée par convention sort du besoin chiffré. | 0,5 g de sel n'est pas une quantité qu'on achète ; comparer 0,5 g à un paquet de 500 g rendrait un verdict sur une grandeur que personne n'a déclarée. |
| Une case sans portion : comment ne pas refuser tous les repas de table ? | **`portionsArePersonal` — paramètre REQUIS**, alimenté par `portionSizing.applied`. | Un défaut à `false` aurait laissé le défaut ① en place sous un autre nom ; un défaut à `true` aurait refusé tous les plats partagés d'un foyer. `optional-gate-params-are-disarmed-gates`, et cette fois la garde EST le lot. |
| `ctx.energy` par bouche suffit-il ? | **Non.** `ctx.nutrition` porte **personne + date + créneau**. | Un test le montre : +30 % un jour et −30 % l'autre rendent **deux** `cell_energy_off`, alors que l'agrégat par bouche est parfait (2 000 pour 2 000). C'est exactement ce que `energy` seul laissait passer. |
| Nouveau barème protéique ? | **Aucun.** `proteinFloorAllocation` fait une **règle de trois** sur `envelopeFor().proteinFloorG`. | Le plan l'interdit. Fenêtre partielle : 176 g × (858,90 / 2 454) = **61,6 g** sur un dîner, pas 176. |
| Apports fixes non connus : on retire quoi ? | **Rien** (`fixedProteinG: null`). | Direction d'erreur sûre : on exige un peu **plus**, jamais moins. Un zéro implicite aurait fait le contraire. |
| Une enveloppe `per_portion` : trou ou protection ? | **Deux compteurs distincts** — `protein_protected` et `protein_unmeasured`. | « Ne pas confondre cette abstention légitime avec une donnée perdue sur un adulte dont le calcul est autorisé ». |
| Activer `FINAL_GATE_POLICY_LOT_3` / armer les causes ? | **Non. Le handler reste sur `LOT_1`.** `FINAL_GATE_POLICY_LOT_4` est **écrite et non branchée**. | Le plan l'interdit en toutes lettres. Les faux positifs sont corrigés ; l'armement demande des dénominateurs mesurés sur une campagne réelle, c'est-à-dire le lot F. |
| La branche de refus : message ou porte ? | **Porte.** `return 422 plan_not_deliverable` **avant** `write_student_meal_plan`, et l'unité de fusion est rendue. | « Ajouter un message ou compter `blocking` ne suffit pas ». Avant ce lot elle poussait un `issues` et laissait le plan partir. |
| Tolérances énergétiques | **±10 % repas, ±5 % journée COUVERTE**, exportées, épinglées par un test. | « Ne pas élargir pour faire passer le banc ». Le dénominateur de la journée est `coveredBudgetKcal` (lot B), jamais `dayTargetKcal`. |
| L'instrument du lot 0 : l'adapter ou le laisser produire les 8 fausses alertes ? | **Les deux.** Il appelle l'audit de production **et** rejoue l'ancienne règle dans une colonne « ARCHIVE ». | Même geste que la colonne « archive » du lot B : sans le témoin, « les 8 alertes ont disparu » porterait sur du code qui n'existe plus, donc invérifiable. |

---

## 2. Ce qui est fait et prouvé

### 2.1 Les huit faux manques par pluriel disparaissent — mesuré sur les fixtures

```
deno run --allow-read scripts/2026-09-11-mesure-grille.ts scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures
```

Sortie figée : [`mesure-lot-E-2026-09-11.txt`](mesure-lot-E-2026-09-11.txt), § 10.

| plan | ancienne règle (colonne ARCHIVE) | audit par identité |
|---|---|---|
| PERTE | `ingredient_not_bought` × 2 : `citron`, `tomate` | **1** alerte : `ingredient_short_bought` **tomate** |
| GAIN | `ingredient_not_bought` × 6 : `carotte`, `citron`, `oignon`, `pita complète`, `pomme de terre`, `tomate` | **0** alerte d'ingrédient ; il reste `unclassified_perishable: petits-suisses nature` |

**Les 8 alertes nommées par la revue sont parties, et la 9ᵉ reste** — c'est la classification
absente que la revue distinguait déjà d'un achat absent.

Et ce qui **apparaît** n'est pas rien : PERTE achète **400 g de tomate pour 446,82 g requis**,
soit **−10,5 %**. C'est le premier sous-achat quantifié que ce dépôt ait jamais mesuré ; le
contrôle de suffisance n'existait nulle part.

Dénominateurs de l'audit, publiés séparément :

```
PERTE  23 identités demandées · 19 covered_measured · 2 present_unquantified
                               · 1 check_incomplete · 1 short
GAIN   26 identités demandées · 26 check_incomplete
```

> ⚠️ **GAIN est à 26 « contrôle incomplet », et c'est honnête.** Ses lignes de courses écrivent
> `« 310 g d'agneau »` ; `readQuantityFromProse` est ancrée des deux bouts et **ne lit aucun
> mot**. On ne sait donc pas si la quantité suffit, et on le **dit** au lieu d'inventer un
> manque ou une couverture. La réparation appartient au lot C — § « demandes au voisin ».

Épreuves : `final_plan_audit_test.ts` ① (avec le témoin `ancienCovers` qui rejoue l'ancienne
règle et prouve qu'elle produisait bien les 6 couples) ; `scripts/2026-09-11-mesure-grille_test.ts`
« ⛔ LOT E — LE CAS QUI MORD » et « ⛔ LOT E — les huit faux manques par pluriel ont DISPARU ».

### 2.2 Retirer un ingrédient, ou en sous-acheter, déclenche le bon défaut

`final_plan_audit_test.ts` ① et ② :

- ligne `citrons` **retirée** ⇒ exactement **1** `not_bought`, sur `lemon`, affiché « citron » ;
- `40 g` achetés pour `100 g` requis ⇒ **1** `short`, avec ses deux nombres ;
- **le cas qui passe est à côté** : `100 g` exactement ne mord pas ;
- `2 filets` ⇒ `check_incomplete`, `boughtRawG: null`, **aucun** `short` inventé ;
- l'arrondi de panier : **440 g pour 446,82** passe (1,5 %), **400 g** mord (10,5 %).

### 2.3 Une case sans portion ne passe pas parce que son titre existe

`final_plan_audit_test.ts` ⑤, sur la recette exacte du 2026-09-11 (poulet grillé + pita
complète, zéro contenant) :

- `portionsArePersonal: true` ⇒ `hasDish: true`, `hasPortion: false`, état **`no_portion`**,
  la garde compte `cell_without_portion: 1` avec `portion_cells: 1` ;
- **sous `FINAL_GATE_POLICY_LOT_4`** : `gate.ok === false` et la livraison sort
  **`not_deliverable`** ;
- **le cas qui passe** : le même plat en `portionsArePersonal: false` sort `not_personal` et
  ne mord pas. Un repas de table n'est pas une case oubliée.

### 2.4 Calories conformes, protéines insuffisantes ⇒ non conforme

`final_plan_audit_test.ts` ⑧, avec les nombres réels de Paul :

```
2 455,69 kcal servies pour 2 454 couvertes     → +0,07 %, day_energy_off: 0
126,1 g de protéine pour un plancher de 176 g  → protein_floor_short: 1  (71 %)
verdict de livraison                           → deliverable_with_gaps   (PAS « conforme »)
```

Et **le cas qui passe** : la même journée à 180 g ne mord pas, avec `protein_days: 1` — le
dénominateur a tourné.

L'allocation elle-même (`⑨`) : 176 g sur une fenêtre qui ne compose que le dîner
(858,90 / 2 454) vaut **61,6 g**, pas 176. Le cas qui mord : la journée entière les doit.

### 2.5 Pas de compensation entre jours ni entre personnes

`final_plan_audit_test.ts` ⑦ : +30 % le 12, −30 % le 13 ⇒ **deux** `cell_energy_off`, pendant
que l'agrégat par bouche (`ctx.energy`) rend 2 000 pour 2 000 et **ne mord pas**. Le témoin est
dans le même test.

Bornes : ±10 % exactement ne mord pas, **un kcal de plus mord**. `MEAL_ENERGY_TOLERANCE` et
`COVERED_DAY_ENERGY_TOLERANCE` sont épinglées par assertion.

### 2.6 Une portion partagée est attribuable à chacun de ses consommateurs

`final_plan_audit_test.ts` ⑥ : un bac de 200 g de riz à 700 kcal pour deux bouches rend
**350 kcal à chacune**, avec `sharedWith: 2` — la case **dit** qu'elle porte une part et non une
pesée nominative. Le cas qui mord : le même bac pour une seule bouche vaut **700**, et sort
`energy_off`. Le partage est celui que `tubServed`/`unmetDemand` emploient déjà ; aucun nouveau
partage n'est inventé.

### 2.7 Une candidate qui apporte un allergène est rejetée, densité ou pas

`final_plan_audit_test.ts` ⑪ : une candidate qui passe de **deux** défauts de densité
(amplitudes 40 et 30) à **un** défaut, donc meilleure sur tous les compteurs, est rejetée
`safety_regression` parce qu'elle ajoute `member_exclusion_served` sur l'arachide. **Le cas qui
passe** : la même amélioration sans allergène est `adopt`.

### 2.8 Après deux réparations : un état explicite

`final_plan_audit_test.ts` ⑪ : `attemptsUsed 0 → call`, `1 → call`, `2 → call: false,
attempts_exhausted`. Aucun troisième appel. Et « plus de temps » reste **distinct** de « plus de
tentative » (`no_time_left`). Un défaut déterministe (`repairable: false`) ne consomme **aucune**
tentative (`nothing_repairable`).

`chooseReplacement` : `not_deliverable` + plan précédent utilisable ⇒ **`keep_previous`** ;
sans plan précédent ⇒ **`fail_explicit`** ; `deliverable_with_gaps` ⇒ `replace`.

### 2.9 La branche de refus empêche réellement l'écriture

`generate-household-meal-v1/index.ts`, bloc de la garde finale : la branche
`bloquantes.length > 0` **rend l'unité de fusion** puis fait `return jsonResponse(…, {status: 422})`
avec `error: "plan_not_deliverable"` et les motifs exacts — **avant** l'appel à
`write_student_meal_plan`. L'ancien plan de la personne reste donc en place.

⚠️ **Sous `FINAL_GATE_POLICY_LOT_1`, `bloquantes` est toujours vide** : ce `return` ne peut
refuser aucun plan aujourd'hui. Il est écrit maintenant pour que la porte existe le jour où une
cause passe à `"refuse"` — la cicatrice « ceinture armée sur coffre vide », prise dans l'autre
sens. **Ce n'est donc pas prouvé par un run réel** (§ 3).

### 2.10 Les contrôles du dépôt

| commande | résultat |
|---|---|
| `deno test --no-check --allow-read --allow-env supabase/functions/_shared/keel/` | **6 647 passed · 3 failed · 2 ignored** (lot B : 6 592 · 3) |
| `deno test --allow-read --allow-env …/final_plan_audit_test.ts …/final_plan_gate_test.ts` | **82 passed · 0 failed** |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | **Check** (exit 0) |
| `deno check supabase/functions/meal-energy-v1/index.ts` | **Check** (exit 0) |
| `deno run --allow-read scripts/2026-09-11-mesure-grille.ts …/fixtures` | exit 0 |
| `deno test --allow-read scripts/2026-09-11-mesure-grille_test.ts` | **24 passed · 0 failed** (lot B : 20 · 0) |

Les **3 rouges sont les trois du socle**, aux mêmes lignes : `cooking_style_brief_test.ts:70`,
`household_freeze_test.ts:286`, `household_merge_quota_test.ts:190`.

> ⛔ **`--no-check` EST UN AVEU, ET IL A UNE CAUSE NOMMÉE.** Le typecheck global de la suite
> échoue sur **`meal_pdf_locale_test.ts:46`** : `GeneratedDish.components` est devenu **requis**
> dans `meal_generation.ts` (fichier du lot C, modifié pendant ce lot), et ce littéral de test ne
> le porte pas. **Ce n'est pas mon fichier, ce n'est pas mon type, et je ne l'ai pas réparé.**
> Sans lui, la suite ne peut pas typechecker, donc pas tourner du tout — d'où `--no-check`, qui
> exécute bien les 6 650 épreuves. Chacun de MES fichiers typecheck séparément.

Les nombres de l'instrument **ne bougent pas** : `PROUVÉ 9`, `ÉCHOUE 70`, `NON MESURABLE 8`,
identiques au lot B ; les deux dimanches valent toujours **2 455,69** et **2 916,14**. Le seul
diff de ma part est la section 10.

---

## 3. Ce qui est fait mais non prouvé, et ce que je n'ai pas fait

### Fait, non prouvé par un run réel

- **Le branchement du handler n'a jamais tourné sur une vraie génération.** Le bloc de mesure
  (`shoppingIdentityAudit`, `cellNutritionTable`, `dayNutritionTable`, `proteinFloorAllocation`)
  typecheck et chacune de ses fonctions a son banc ; aucun tir réel n'est passé dedans. La
  colonne `keel.household_meal.final_gate` gagne `delivery`, `unevaluated` et `incomplete` : ces
  champs n'existent dans aucun journal.
- **La branche de refus 422 n'a jamais été atteinte.** Sous `LOT_1` elle ne peut pas l'être. Ce
  qui est prouvé est qu'elle est **avant** l'écriture et qu'elle rend l'unité de fusion ; ce qui
  ne l'est pas, c'est qu'un refus réel préserve l'ancien plan en base.
- **`FINAL_GATE_POLICY_LOT_4` n'est branchée nulle part.** Un test l'exerce
  (`⑤ la garde REFUSE la case sans portion`), le produit non.
- **Le chemin N ≥ 2 n'a pas de fixture.** Les deux plans de la campagne sont des solos. Le
  partage d'un bac entre deux bouches est éprouvé sur décor, pas sur un plan réel.
- **`defectsFromRefusals` n'a pas d'appelant de production.** Elle est le pont qui manquait entre
  la garde et le budget, elle est testée, et **le handler ne l'appelle pas encore** : brancher une
  boucle de réparation sur la garde finale demande de toucher le cœur du handler, que le lot C
  écrit en ce moment. C'est nommé dans « pour les lots suivants ».

### Pas fait, et pourquoi

- **La restitution UI des écarts.** Le front appartient au lot C aujourd'hui. Le contrat côté
  serveur est posé (`delivery`, `unevaluated`, `incomplete`, et le corps 422) ; la lecture à
  poser est décrite au § « demandes au voisin ». **Aucun fichier de `frontend/` n'est touché.**
- **`meal_generation.ts::foodGroupOfTerm` (E4 du lot A)** reste un lecteur par libellé, et les
  lignes de courses n'ont toujours **aucun identifiant persisté**. Ce fichier appartient au lot C ;
  la correction est décrite, pas écrite. L'alias explicite du plan (§ 1) est le contournement
  mesuré, et il suffit sur les deux fixtures.
- **`Z1` (`portion_scaling_inputs.ts::proteinFoodPredicate`) n'est pas armé.** Décision : le lot E
  n'en a **pas besoin**. Il compare des **grammes de protéine mesurés** (`boxNutrition.proteinG`,
  qui descend de `potProteinPerGram` et du référentiel) à un plancher en grammes. Le prédicat
  mort, lui, classe un aliment **par son libellé** pour décider s'il est « une protéine » — c'est
  précisément le raisonnement que le plan interdit (« un groupe d'ingrédients contenant des
  protéines ne prouve pas que le plancher en grammes est atteint »). L'armer aurait rebranché un
  matcher de libellés dans le lot qui en supprime un. **Il reste mort, et il est nommé.**
- **`Z2` (`index.ts::tubServed`) et `Z3` (`empty_intersection`) ne sont pas touchés.** Hors
  périmètre, et `tubServed` appartient à une zone que le lot C mute.
- **`proteinPerMealG` (minimum par repas) est transporté mais pas comparé.** `ProteinFloorAllocation`
  le porte ; aucune règle ne le confronte à une case. Il ne s'applique qu'à `60_plus`,
  `muscle_gain` et `recomposition`, et aucune fixture ne les porte : une garde sans cas qui passe
  est une garde qu'on ne peut pas distinguer d'une garde cassée (`guards-need-a-passing-case`).
- **Aucune migration, aucun déploiement, aucune écriture en base.** Les nouveaux champs de journal
  sont des `console.log`.

### Le voisin a bougé sous moi

Rouges constatés pendant le lot, dans des fichiers que **je ne possède pas** :

| fichier | état | à qui |
|---|---|---|
| `meal_pdf_locale_test.ts:46` | ❌ typecheck — `GeneratedDish.components` devenu requis | lot C (`meal_generation.ts`) |
| `plan_proportion_units_test.ts:397` | ❌ vu rouge à 19h05, vert à 19h30 | lot C/D, en vol |
| `meal_boxes_test.ts`, `yield_factor_parity_test.ts` | ❌ `DishIngredient.part` manquant, vus rouges puis verts | lot C, en vol |

`portion_sizing_wiring_test.ts` ㉔ **a rougi à cause de moi** et c'est réparé : il compte les
occurrences de `const contract = contractAt(` pour épingler les **deux** sites de
dimensionnement. Mon site de mesure est un **troisième lecteur** ; je l'ai nommé
`contratDeLaCase` plutôt que d'affaiblir le compteur.

---

## 4. Les tests de sortie du lot, un par un

| test de sortie du plan | verdict | preuve |
|---|---|---|
| Les huit faux manques par pluriel disparaissent | ✅ | instrument § 10 (2 → 1 sur PERTE, 6 → 0 sur GAIN) + `mesure-grille_test.ts` × 2 + `final_plan_audit_test.ts` ① avec son témoin `ancienCovers` |
| Retirer réellement un ingrédient déclenche le bon défaut | ✅ | ① cas qui mord : 1 `not_bought` sur `lemon` |
| Sous-acheter sa quantité déclenche le bon défaut | ✅ | ② (40 g / 100 g) + le vrai cas mesuré : tomate 400/446,82 |
| Calories conformes mais protéines insuffisantes → non conforme | ✅ | ⑧ : `day_energy_off: 0`, `protein_floor_short: 1`, livraison `deliverable_with_gaps` |
| Une case sans portion ne passe pas parce que son titre existe | ✅ | ⑤ : `no_portion`, et sous LOT_4 `ok: false` / `not_deliverable` |
| Une candidate apportant un allergène est rejetée, même si sa densité est meilleure | ✅ | ⑪ : `safety_regression` sur une candidate à un défaut contre deux |
| Après deux réparations : état explicite, pas de troisième appel caché | ✅ | ⑪ : `attempts_exhausted`, et `no_time_left` reste distinct |
| …pas d'écrasement d'un plan valide par une sortie non livrable | ✅ **en décision**, ⚪ **non prouvé en base** | `chooseReplacement` → `keep_previous` ; le handler rend 422 avant l'écriture, mais aucun refus réel n'a eu lieu (LOT_1) |
| Chaque test : un cas qui mord et un cas qui passe | ✅ | 30 épreuves, chaque bloc porte les deux |

---

## 5. Fichiers créés ou modifiés

### Moteur — `supabase/functions/_shared/keel/`

| fichier | ce qui change |
|---|---|
| `final_plan_audit.ts` | **créé.** `MEAL_ENERGY_TOLERANCE`, `COVERED_DAY_ENERGY_TOLERANCE`, `SHOPPING_SHORT_TOLERANCE`, `weighLine`, `foodIdentityOf`, `shoppingIdentityAudit`, `cellNutritionTable`, `dayNutritionTable`, `proteinFloorAllocation`, et les vocabulaires fermés `SHOPPING_COVER_STATES`, `CELL_STATES`, `PROTEIN_FLOOR_REASONS`. |
| `final_plan_gate.ts` | `covers()` **supprimée** (son emplacement porte le pavé qui interdit de la réécrire). `GateIngredient` += `ref`/`ref_refused` ; `GateShoppingLine` += `quantity`/`ref`. `GateContext` += `shopping`, `nutrition` (**requis**, `null` = non mesuré). 7 causes neuves (22 → 29). 8 compteurs neufs. `FINAL_GATE_POLICY_LOT_4` (**non branchée**). `DELIVERY_STATES`, `finalGateDelivery`, `CAUSE_DENOMINATOR`. |
| `final_plan_gate_fixtures.ts` | `quantity` sur les 12 lignes de courses ; `shopping` et `nutrition` sur les deux contextes, avec des lignes RÉELLES qui font tourner les règles sans les faire mordre. |
| `plan_repair_loop.ts` | `CAUSE_TO_DEFECT` (les 29 causes → nature + réparabilité), `defectsFromRefusals`, `REPLACEMENT_VERDICTS`, `chooseReplacement`. |
| `draft_adopt.ts` | `shopping: null`, `nutrition: null`, avec le pavé qui dit **pourquoi** l'adoption ne peut pas les remplir. |
| `final_plan_gate_test.ts` | les tests d'achats réécrits sur l'audit ; 4 épreuves neuves ; la liste des **témoins** nommée. |
| `final_plan_audit_test.ts` | **créé** — 30 épreuves, le banc du lot. |

### Handler

| fichier | ce qui change |
|---|---|
| `generate-household-meal-v1/index.ts` | `envelopeByMouth` capturé au passage (1 ligne dans `resolveHousehold`) ; le bloc de mesure avant la garde ; `shopping`/`nutrition` passés ; `finalGateDelivery` journalisé ; **la branche de refus fait `return 422` avant l'écriture** et rend l'unité de fusion. |

### Instrument et preuves

| fichier | ce qui change |
|---|---|
| `scripts/2026-09-11-mesure-grille.ts` | appelle `shoppingIdentityAudit` ; `alertesParLibelle` (le corps EXACT de l'ancienne règle, gardé comme témoin) ; `coursesArchive`, `coursesAudit`, `livraisonEtat` ; section 10 refaite. |
| `scripts/2026-09-11-mesure-grille_test.ts` | l'ancienne preuve de départ déplacée sur `coursesArchive` ; 2 épreuves neuves. |
| `scratchpad/…/mesure-lot-E-2026-09-11.txt` | **créé** — l'instrument après le lot. |
| `scratchpad/…/RAPPORT-LOT-E-2026-09-11.md` | ce fichier. |

⛔ **Non touchés, exprès** : tout `frontend/`, `meal_generation.ts`, `portion_sizing.ts`,
`plan_proportion_units.ts`, `proportion_adjust.ts`, les rapports et fixtures des lots 0/A/B,
`scratchpad/2026-09-11-REVUE-CAMPAGNE/*`.

---

## 6. Commandes réservées à l'humain

**Aucune.** Pas de migration, pas de déploiement, pas de secret, pas d'écriture en base.

⚠️ **Avant tout run réel**, le runtime edge sert des `_shared` **périmés** :
`final_plan_gate.ts`, `plan_repair_loop.ts`, `draft_adopt.ts` ont été MODIFIÉS et
`final_plan_audit.ts` est NEUF. Il faut redémarrer `functions serve` lui-même
(`./scripts/local_serve_functions.sh`) — **jamais** `docker restart` tant que `functions serve`
tourne.

---

## 7. Demandes au voisin (lot C, ou le lot qui touche au front)

### C-E1 — `mealShoppingPayload` doit porter l'identité et la quantité structurée

Fichier : `supabase/functions/_shared/keel/meal_generation.ts:9867`.

Ajouter deux champs à chaque ligne projetée :

```ts
ref: s.ref ?? null,            // le slug du référentiel, comme sur les ingrédients
amount: s.amount ?? null,      // la quantité STRUCTURÉE
unit: s.unit ?? null,          // son unité
```

**Pourquoi, chiffré.** `final_plan_audit.ts` lit déjà `ref` sur une ligne de courses (le champ est
déclaré, le code le prend sans modification). Aujourd'hui il retombe sur l'alias explicite du plan,
qui suffit sur les deux fixtures mais **casse dès qu'un libellé de courses diffère d'un libellé de
recette**. Et sans `amount`/`unit`, la suffisance de **26 identités sur 26** de GAIN est
**incontrôlable** : ses lignes écrivent `« 310 g d'agneau »`, et `readQuantityFromProse` — qui ne
lit aucun mot, délibérément — rend `null`. Le contrôle de suffisance, qui est la moitié neuve de
ce lot, ne peut donc rien dire sur ce plan.

### C-E2 — `foodGroupOfTerm` est le dernier lecteur de mesure par libellé

Fichier : `supabase/functions/_shared/keel/meal_generation.ts:6200` (E4 du lot A, inchangé).

Il déduit le groupe d'une ligne de courses par `resolveIngredient(term)`, et ce groupe décide la
**fenêtre de fraîcheur** d'un achat. Une fois C-E1 posé, remplacer par
`resolveCompositionLine(index, line).ref?.foodGroupRef`, avec abstention nommée quand la ligne n'a
pas d'identité.

### C-E3 — la lecture UI des écarts, à poser côté front

Le contrat serveur est prêt et **rien n'est écrit dans `frontend/`**. Ce qu'il faut lire :

1. **Sur une réponse 422** — nouveau corps, `error: "plan_not_deliverable"` :
   ```ts
   { error: "plan_not_deliverable",
     refusals: { cause, day, slot, member_id, term, detail }[],
     unevaluated: string[],
     incomplete: { control: string; count: number }[],
     request_id: string }
   ```
   ⛔ **Ne pas l'afficher comme une panne.** L'ancien plan de la personne est **intact** : la
   copie doit dire « ton plan actuel est conservé », suivi des motifs. `refusals[].detail` est
   déjà une phrase française, elle ne se recompose pas côté écran.

2. **Sur une réponse normale** — `issues[]` porte désormais
   `final_gate_delivery:conforme | deliverable_with_gaps | not_deliverable`. La seule surface
   utile est un bandeau discret sur `deliverable_with_gaps` qui **nomme** les écarts, jamais un
   compteur nu. ⛔ Le mot « KEEL » n'apparaît nulle part, et aucune cause interne
   (`cell_energy_off`…) ne se rend telle quelle à l'utilisateur.

3. **Les trois listes ne se fondent pas** : `refusals` accuse le plan, `incomplete` dit qu'on n'a
   pas pu vérifier, `unevaluated` dit qu'on n'a pas regardé. Les mélanger referait exactement la
   faute n° 4 du lot 0 (« non applicable n'est pas non contrôlé »).

---

## 8. Pour les lots suivants

**E-F1 — la boucle de réparation n'a toujours aucun appelant de production.**
`grep -rn "planRepairPass\|judgeCandidate" supabase/functions/ | grep -v _test` ne rend que leurs
déclarations. `defectsFromRefusals` (posée par ce lot) est le pont qui manquait : elle transforme
les 29 causes de la garde en `RepairDefect[]` ordonnés et réparables. **Il reste à l'appeler**, au
même endroit que la garde, et à faire passer le résultat dans `planRepairPass` + `judgeCandidate`
avec le budget existant. Je ne l'ai pas fait parce que ça demande de restructurer le cœur du
handler pendant que le lot C y écrit.

**E-F2 — `FINAL_GATE_POLICY_LOT_4` attend une campagne.** Elle arme `cell_without_portion` et
`ingredient_short_bought` en `refuse`. Avant de la brancher, il faut les dénominateurs d'un vrai
run : sur les fixtures, `cell_without_portion` vaudrait **2** (les deux cases du 2026-09-11) et
`ingredient_short_bought` **1**. Trois plans refusés sur deux, c'est un chiffre d'archive, pas un
taux.

**E-F3 — le comptage séparé des appels.** `planCallMeta` distingue déjà les natures d'appel, et
`plan_budget.ts` réserve par nature. Ce que **personne ne compte encore séparément**, c'est
`composition_fill` face aux réparations de plan : les deux passent par `planBudget.askRepair` avec
des étiquettes différentes, mais aucun journal ne publie le décompte par nature. À faire avec la
campagne du lot F, pas avant : compter sans tirer ne mesure rien.

**E-F4 — `proteinPerMealG` n'a aucun cas qui passe.** Il ne s'applique qu'à `60_plus`,
`muscle_gain` et `recomposition` ; il faut une fixture qui en porte un avant d'écrire sa garde.
