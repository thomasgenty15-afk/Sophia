# Lot C — une quantité finale commune au calcul et à la cuisine

Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, section « Lot C ».
Socle : `scratchpad/2026-09-11-FIABILITE-RECETTES/SOCLE.md`.
Les lots 0, A et B ne sont pas modifiés : `RAPPORT-MESURE-2026-09-11.md`,
`mesure-2026-09-11.txt`, `RAPPORT-LOT-A-…`, `mesure-lot-A-…`, `RAPPORT-LOT-B-…`,
`mesure-lot-B-…` restent l'état d'avant, à l'octet près.

> ⛔ **Aucun appel modèle, aucune génération, aucune écriture en base, aucune réécriture
> des plans archivés.** Tout ce qui suit sort de `deno test`, `deno check`, `vitest`,
> `npm run build`, de l'instrument du lot 0 et d'une sonde hors ligne, tous en lecture
> seule. Rien ici ne dit quoi que ce soit du **goût**, de la **texture** ou de la
> **faisabilité** d'une recette : **aucune n'a été cuisinée.**

---

## 1. Les arbitrages — la partie à lire en premier

| question | décision | raison, avec ses nombres |
|---|---|---|
| Réparer par une **relecture** de la prose, ou par une **régénération** ? | **Régénération.** La donnée structurée finale fait autorité ; `quantity` est un champ de compatibilité refabriqué depuis elle. | `readQuantityFromProse` ne relit que **0 / 47** (PERTE) et **6 / 49** (GAIN) de ces proses — il refuse exprès les chaînes composites, et il a raison. Une réparation par relecture fermerait **6 lignes sur 96**. |
| Où vit la règle de rendu ? | Un **seul** module pur, `_shared/keel/quantity_render.ts`, **importé par le moteur ET par le navigateur** (comme `MouthFormDialog.tsx` importe déjà `weight_pace.ts`). | Deux implémentations de la même règle divergeraient, et ce dépôt sait laquelle garde l'ancienne : celle qu'on relit le moins. Le moteur régénère `quantity` avant d'écrire ; l'écran dérive l'affichage. Les deux appellent la **même fonction**. |
| La finalisation tourne **où** dans le handler ? | **Après `applySizing`, après la reconstruction des courses, avant le recollage de la charge `dishes`.** Un seul site, épinglé par 6 tests de position. | C'est tout le lot. `prose_stale = 0` de l'ajusteur est **vrai et sans valeur** : il ne contrôle que sa propre étape. Une finalisation posée plus tôt serait le même compteur avec un nom de plus. |
| Faut-il **arrondir** à un nombre de cuisine (458,66 → 450) ? | **Non.** Deux décimales, et c'est un **format**, pas une décision. | Le plan l'interdit : « une simplification culinaire modifie la donnée structurée AVANT la dernière mesure ; elle ne peut pas être un changement numérique caché dans l'affichage ». L'écart introduit par le format vaut ≤ 0,005 unité et vient des flottants (`458.66000000000003`). |
| Convertir cuillères → grammes à l'écran ? | **Non, jamais.** Une ligne en `tbsp` se rend en cuillères. | `food_composition.ts` convertit par `ML_TO_G = 1,0` — la densité de **l'eau**, assumée à ±8 % sur les matières grasses — **pour peser**. Rejouer cette chaîne à l'écran écrirait « 11,56 g d'huile » sous une donnée qui vaut **0,77 cuillère** : un nombre inventé présenté comme une mesure. |
| La phrase dit une unité, la donnée en dit une autre : on remplace le nombre ? | **Non.** On rend la quantité **nue** (`structured_bare`), et on la **compte**. | Remplacer le seul nombre écrirait « 0,77 g d'huile » pour 0,77 **cuillère** — un facteur 15. On perd la queue descriptive, on ne ment pas. Mesuré : **5 lignes sur 96** (toutes des « un demi-citron » / « la moitié d'un citron »). |
| L'unité, elle, est-elle réécrite ? | **Oui, et seulement quand on vient de l'IDENTIFIER** (deux jetons comparés, jamais deux libellés). | L'**accord** appartient au nombre, et on vient de changer le nombre : garder le mot d'origine écrivait « 0,77 cuillère**s** à soupe » sous une donnée qui en vaut moins d'une. Et un plan français porte des lignes anglaises du modèle ; « 0,77 tbsp » au milieu d'une recette française est du vocabulaire de stockage sur un écran. |
| La **queue descriptive** de la phrase ? | **Gardée telle quelle.** « 360 g de cuisses de poulet **désossées** » → « 458,66 g de cuisses de poulet **désossées** ». | « Désossées » est une instruction de cuisine. La réécrire serait traduire une recette, ce que ce module n'a pas le droit de faire. |
| Un `amount` à **zéro** ? | Retombe sur le texte historique, jamais « 0 g ». | Une ligne descendue à zéro est une ligne **retirée**, et c'est l'ajusteur ou le modèle qui la retire — pas le rendu. |
| « 1 cube de bouillon » devient « **0,39** cube de bouillon » : on laisse ? | **Oui, et c'est nommé.** Nouveau compteur `counted_fractional` (2 sur PERTE, **5** sur GAIN). | Le rendu dit ce que le **calcul** emploie. Rendre « 1 » serait remettre le mensonge qu'on vient de retirer. `unitsOfPlan` verrouille bien ces lignes pour l'ajusteur (`counted_unit`), mais **`applySizing` les multiplie quand même** — c'est un défaut de dimensionnement, pas de rendu. **À trancher au lot D** (§ « pour les lots suivants », C4). |
| `METHOD_QUANTITY_RE` : la laisser ? | **Élargie à quatre formes** nommées (`digits` · `fraction` · `spelled` · `ratio`), avec `methodQuantityForm` qui dit **laquelle** a mordu. | Le plan l'écrit : « elle ne couvre pas les fractions, nombres en lettres et rapports de cuisson : **elle ne constitue pas une preuve suffisante** ». Le sens de l'erreur ne change pas : élargir rend **plus** d'unités fixes — on ajuste moins, on ne ment jamais. |
| Les lignes de **courses** ? | **Non touchées**, et c'est nommé. | `shopping_list[]` ne porte **aucune** donnée structurée — ni `amount`, ni `unit`, ni `ref`. L'écran ne peut rien en dériver. Agréger par identité alimentaire et contrôler la **suffisance** est le lot E, explicitement. |
| Réécrire les anciens plans en base ? | **Non.** Le plan l'interdit, et l'écran n'en a pas besoin. | Sans donnée structurée, `renderQuantity` rend le texte persisté tel quel avec l'état `historic_text`. Un plan d'avant FF-038 reste lisible, et on **sait** qu'on lit son texte d'origine. |
| C3 du lot A (`ref` / `ref_refused` non lus par le front) ? | **Fermé** : `readIngredients` les recopie, avec `amount`, `unit`, `state`, `grams_raw`. **Aucun écran ne les affiche.** | Le slug est anglais et ne paraît nulle part. Ils sont là parce qu'ils sont le seul moyen d'agréger des courses par **aliment** plutôt que par libellé — ce dont le lot E a besoin, et que les 8 fausses alertes singulier/pluriel ont payé. |
| L'instrument du lot 0 : le laisser, ou lui faire dire la réparation ? | **Les deux.** `quantites` reste la mesure de ce qui est **en base** ; `quantitesApresLotC` rejoue le **même** contrôle ⑨ sur une **copie** finalisée. | Faire mesurer l'instrument sur la copie ferait disparaître le défaut au lieu de montrer sa réparation. Un test épingle que la fixture **n'est pas mutée** (empreinte JSON avant/après). |

---

## 2. Ce qui est fait et prouvé

### 2.1 Les 64 lignes divergentes se ferment — 64 sur 64

```bash
deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-C.ts
```

Sortie figée : [`sonde-lot-C-2026-09-11.txt`](sonde-lot-C-2026-09-11.txt).

⛔ **Le dénominateur est celui du lot 0, pas un nouveau.** « 64 lignes sur 96 » a une
définition précise et étrangère à ce lot (`censusDesQuantites`, contrôle ⑨) : le modèle a
écrit un couple (`amount`, `quantity`) cohérent, le payload persisté porte un `amount`
**différent**, et la **même** `quantity` caractère pour caractère. La sonde applique
`finalizeQuantityProse` — **la fonction de production** — à une copie profonde des deux
plans archivés, puis rejoue ce contrôle-là, sans en toucher une ligne.

| plan | lignes rapprochées | prose PÉRIMÉE avant → après | prose réécrite avant → après |
|---|---|---|---|
| PERTE `1f8a8988` | 47 | **29 → 0** | 6 → 35 |
| GAIN `1eada05b` | 49 | **35 → 0** | 10 → 45 |
| **total** | **96** | **64 → 0** | 16 → 80 |

Les deux lignes nommées par la revue, rendues par la fonction de production :

```
prep_chicken · cuisses de poulet désossées
   AVANT « 360 g de cuisses de poulet désossées »
   APRÈS « 458,66 g de cuisses de poulet désossées »        [structured]

prep_lentils · lentilles sèches
   AVANT « 60 g »        APRÈS « 60 g »                     [structured]
prep_lentils · huile d’olive
   AVANT « 2 cuillères à soupe d’huile d’olive »
   APRÈS « 0,77 cuillère à soupe d’huile d’olive »          [structured]

prep_chicken · sel
   AVANT « une pincée de sel »  APRÈS « une pincée de sel » [historic_text]
```

Le **rapport** huile/lentilles affiché passe de **2,596 ×** la valeur calculée à **1,00 ×**.
Il est vérifié en relisant les deux nombres **dans les deux textes rendus**
(`quantity_render_test.ts` ②, et `ingredientQuantity.int.test.ts` ② sur le HTML).

Compteurs de la finalisation, par plan :

| | PERTE | GAIN |
|---|---|---|
| lignes vues | 47 | 49 |
| divergentes avant la passe (`stale_before`) | 36 | 39 |
| réécrites | 36 | 39 |
| rendues **nues**, queue perdue (`bare`) | 2 | 3 |
| texte historique, pas de donnée | 6 | 0 |
| ni donnée ni texte | 0 | 0 |
| **unité dénombrable fractionnaire** (lot D) | 2 | 5 |

> ⚠️ `stale_before` (36 + 39 = 75) **n'est pas** le 64 du lot 0, et c'est normal : il compare
> la prose persistée à la **donnée structurée**, pas à la réponse brute du modèle. Il voit
> donc aussi les 16 lignes que l'ajusteur avait déjà réécrites mais dont le **format** change
> (séparateur décimal, accord de l'unité). Les deux nombres sont publiés séparément ; les
> confondre serait mélanger deux bases de mesure (§ 7 du socle).

### 2.2 L'écran rend la donnée finale — rendu réel, puis rechargement

```bash
cd frontend && npx vitest --config vitest.config.ts run src/keel/lib/ingredientQuantity.int.test.ts
```

**10 épreuves vertes.** Elles montent les **vrais composants** et lisent le HTML produit —
« une recherche de chaînes dans le code n'est pas suffisante » :

- `SessionPreparation` (la carte de cuisine, dépliée) rend
  `458.66 g de cuisses de poulet désossées`, et **`360` n'est nulle part dans le HTML** ;
- le **rechargement** est un vrai aller-retour `jsonb` : `JSON.parse(JSON.stringify(payload))`
  repassé par `readPreparations` / `readDishes` / `readShopping`, les lecteurs que le produit
  emploie pour monter une ligne `student_generated_meals`. `amount`, `unit` et `ref`
  traversent ; le rendu ne bouge pas ;
- **le cas qui compte** : un payload dont la **prose persistée est restée périmée** (« 360 g »)
  mais dont la donnée est bonne rend quand même **458.66**. L'écran ne dépend plus de la
  réparation serveur ;
- `PlanDayBlock` rend, **sur le même HTML**, les deux lignes de courses (`500 g`, `250 g`) et
  le frais du plat à `38.52 g de tahini` — l'archive en affichait « 100 g » ;
- lot vs portion : la casserole affiche **60 g** (le lot), le couvercle **180 g** (la part de
  `m1`), et le test échoue si les deux se rejoignent ;
- langue : la même donnée rend `0.77 tbsp d’huile d’olive` sur `/app/plan` (anglais) et
  `0,77 cuillère à soupe d’huile d’olive` sur `/` (français, la seule page routée par langue).

### 2.3 Le banc du module

```bash
deno test --allow-read --allow-env supabase/functions/_shared/keel/quantity_render_test.ts
```

**17 épreuves vertes**, chacune avec un cas qui mord et un cas qui passe. Grammes · ml ·
cuillères · unité comptée · virgule FR et rendu EN · lot partagé · portion individuelle ·
ancienne ligne textuelle · aller-retour JSON · les quatre formes de méthode.

### 2.4 Le câblage — la position est la moitié du lot

```bash
deno test --allow-read --allow-env supabase/functions/_shared/keel/quantity_final_wiring_test.ts
```

**6 épreuves vertes**, chacune doublée d'une coupe : la finalisation existe **une seule
fois**, vient **après** `applySizing` et **après** la reconstruction des courses, vient
**avant** le recollage de la charge `dishes`, ce recollage écrit bien les **trois** champs
(`quantity`, `amount`, `grams_raw`) et se **compte**, les compteurs sortent au journal,
et la langue vient du **contenu** (`householdContentLocale`) — jamais du navigateur.

Vérifié à la main : **aucun `return` entre l'instantané `dishes` et la finalisation**
(`awk` sur les lignes 12 700 → 14 890). Tout chemin qui écrit passe par elle.

### 2.5 La garde de méthode couvre les trois formes que le plan nomme

`methodQuantityForm` rend `digits` · `fraction` · `spelled` · `ratio` · `null`. Les huit
phrases du plan mordent, les six phrases libres passent (dont « 180°C » et « 25 minutes »,
qui ne sont pas des quantités d'aliment).

> ⚠️ **Coût et gain mesurés sur les deux plans archivés : zéro et zéro.** Les 23 unités des
> deux plans ont une méthode **libre** ; aucune des quatre formes ne mord sur cette matière.
> L'élargissement ferme trois trous **nommés**, il n'a pas de cas réel ici. Dit comme ça
> plutôt que présenté comme un gain.

### 2.6 Les contrôles du dépôt

| commande | résultat |
|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **6 615 passed · 3 failed** (avant : 6 592 · 3) — **+23 tests, mêmes 3 rouges** |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | **Check** (exit 0) |
| `deno check supabase/functions/meal-energy-v1/index.ts` | **Check** (exit 0) |
| `deno run --allow-read scripts/2026-09-11-mesure-grille.ts …/fixtures` | exit 0 — diff au § 3 |
| `deno test --allow-read scripts/2026-09-11-mesure-grille_test.ts` | **22 passed · 0 failed** (avant : 20 · 0) |
| `cd frontend && npx tsc -b --force` | exit **0** |
| `cd frontend && npx vitest --config vitest.config.ts run` | **2 failed · 2 543 passed · 20 skipped (162 fichiers)** (avant : 2 · 2 533) — **+10 tests, mêmes 2 rouges** |
| `cd frontend && npm run build` | ✓ built, 2 pages prérendues |

Les **3 rouges Deno** sont les trois du socle, aux mêmes lignes : `cooking_style_brief_test.ts:70`,
`household_freeze_test.ts:286`, `household_merge_quota_test.ts:190`.

Les **2 rouges front** sont ceux que le lot A a nommés : `mouthProfileReaders.int.test.ts:154`
(cherche un `<ActivitySessionsCard>` pas encore posé) et `energyBasis.int.test.ts:188`. Le
second a été **relu** : il échoue sur cinq clés `student_progress.journal.*`
(`planned_kcal`, `reported_estimated`, `reported_kcal`, `subtotal`, `total`) — le travail
d'une session voisine. **Aucun des deux fichiers n'est touché par ce lot.**

`eslint` sur les six fichiers front touchés : **0 erreur, 0 avertissement**.
`i18n-lint` et `token-lint` échouaient déjà (110 et 65 violations) ; **aucun de mes fichiers
n'apparaît** dans leurs sorties.

---

## 3. Ce qui bouge dans l'instrument, et pourquoi

Diff complet : [`mesure-lot-B-2026-09-11.txt`](mesure-lot-B-2026-09-11.txt) →
[`mesure-lot-C-2026-09-11.txt`](mesure-lot-C-2026-09-11.txt). **14 lignes, toutes
additives, deux blocs identiques :**

```
── ce que la FINALISATION du lot C ferme, sur ce même plan ─────────
  · PROSE PÉRIMÉE après finalisation    0   (avant : 29)      [PERTE]
  · PROSE PÉRIMÉE après finalisation    0   (avant : 35)      [GAIN]
⚠️ LA FIXTURE N'EST PAS MODIFIÉE : finalizeQuantityProse — la fonction
   de production — tourne sur une COPIE. …
```

**Aucun verdict ne bouge.** « PROUVÉ » reste à 9, « ÉCHOUE » à 70, « NON MESURABLE » à 8.
Les deux dimanches valent toujours **2 455,69** et **2 916,14** kcal. Les 11 énergies
mesurées, les 8 alertes d'achats, les deux journées sous le plancher protéique : identiques
au caractère.

> ⛔ **Le piège, nommé.** L'instrument mesure les plans **archivés**, et ce lot ne les
> réécrit pas : les 64 lignes périmées **sont toujours en base**, et le contrôle ⑨ d'origine
> les liste toujours, nominativement. Deux tests l'épinglent : l'un vérifie que la fixture
> n'est **pas mutée** (empreinte JSON avant/après `mesurerUnPlan`), l'autre que les comptes
> d'origine valent toujours **29** et **35** et que la ligne poulet dit toujours
> « 360 g de cuisses de poulet désossées ». Un instrument qui tomberait à zéro des deux
> côtés aurait cessé de décrire le défaut.

---

## 4. Ce qui est fait mais non prouvé

- **Aucun plan neuf n'est passé par la finalisation.** Le chemin est branché, typecheck,
  épinglé par 6 tests de position, et éprouvé sur les deux payloads archivés hors ligne.
  Il n'a **pas** de run réel : aucune génération n'est autorisée à ce lot.
- **`counted_fractional` n'a pas d'appelant qui en fasse quelque chose.** Il sort au
  journal (`keel.household_meal.quantity_final`) et rien ne le lit. C'est une mesure posée
  pour le lot D, pas une garde.
- **Le chemin N ≥ 2 n'a pas de fixture.** `applySizingForEaters` est le second site de
  dimensionnement ; la finalisation est **en aval des deux** (un seul site), donc elle le
  couvre par construction. Aucun plan de foyer n'est passé dedans depuis ce lot.
- **La langue d'écriture et la langue d'écran peuvent diverger** (un francophone qui lit
  l'anglais). Les deux rendus sont testés séparément ; aucun cas réel ne les a fait
  diverger sur une même donnée.

## 5. Ce que je n'ai pas fait

- **Les lignes de courses ne portent toujours aucune identité ni unité structurée.**
  `shopping_list[]` est une prose que `scaleShoppingList` réécrit par son nombre de tête.
  Le contrôle par identité alimentaire et la **suffisance** des quantités sont le lot E, que
  le plan lui confie explicitement. Le test ④ l'affirme et le vérifie
  (`expect(Object.keys(relu[0])).not.toContain("amount")`).
- **Aucun plan ancien n'est réécrit en base.** Interdit par le plan.
- **Les lots D et E ne sont pas touchés** : ni `proportion_adjust.ts`, ni les rôles
  culinaires, ni `final_plan_gate.ts`. Les défauts vus en passant sont au § 8.
- **Aucune migration, aucun déploiement, aucun secret, aucune écriture en base.** Les deux
  nouveaux compteurs sont des `console.log` et une `issue` ; `quantity` est une clé de
  `jsonb` qui existait déjà.
- **`docs/keel/mesure.md` et le rapport de campagne ne sont pas mis à jour** : le plan les
  confie au rapport final du chantier (critère de fin), pas à un lot intermédiaire.
- **Aucune recette n'a été cuisinée.** Le rendu est juste ; ce que ça donne dans une
  casserole reste à goûter.

---

## 6. Les tests de sortie du lot, un par un

| test de sortie du plan | verdict | preuve |
|---|---|---|
| Fixture poulet : l'affichage correspond à **458,66 g**, jamais à l'ancien 360 g | ✅ | `quantity_render_test.ts` ① (`assert(!text.includes("360"))`) + `ingredientQuantity.int.test.ts` ① sur le **HTML rendu**, avant et après rechargement |
| Fixture lentilles : 60 g ne restent pas avec 2 cuillères quand le calcul en utilise 0,770 | ✅ | `quantity_render_test.ts` ② + `ingredientQuantity.int.test.ts` ② |
| … vérifier le **nombre, l'unité ET le rapport** après toutes les transformations | ✅ | le rapport est relu **dans les deux textes rendus** : 2,596 × → 1,00 × ; l'unité reste « cuillère à soupe », jamais un gramme |
| Grammes | ✅ | ③ (`300 g de riz` → `240 g de riz`) |
| ml | ✅ | ③ (`250,5 ml de lait`) |
| Cuillères | ✅ | ③ (`2 cuillères à café de cumin`) + le cas qui mord : aucune conversion tbsp↔g |
| Unité comptée | ✅ | ③ (`3 oignons`) ; le cas fractionnaire (`0,39 cube de bouillon`) est rendu **et compté** |
| Virgule décimale FR et rendu EN | ✅ | ④ (`458,66` / `458.66`, `2,4` / `2.4`, accord `cuillère`/`cuillères` par la règle de langue) + `ingredientQuantity.int.test.ts` ⑤ sur deux chemins d'URL |
| Lots partagés | ✅ | ⑤ (la casserole affiche 360 g pour 3 parts ; le test échoue si elle affiche la part) |
| Portion individuelle | ✅ | ⑤ + `ingredientQuantity.int.test.ts` ③ (`box.items[].grams === 180`, un gramme nu, jamais une prose) |
| Ancienne ligne textuelle | ✅ | ⑥ (clé **absente**, pas `null`) : texte gardé, `historic_text`, `rewritten: 0`, `stale_before: 0` |
| **Test de rendu réel** de la recette et des courses depuis le payload final | ✅ | `ingredientQuantity.int.test.ts` ① et ④ — vrais composants, `renderToStaticMarkup`, assertions sur le HTML |
| … puis **après rechargement du plan** | ✅ | aller-retour `jsonb` complet par `readPreparations` / `readDishes` / `readShopping` |
| La méthode ne répète pas de quantités libres ; la regex actuelle n'est pas une preuve suffisante | ✅ **partiel** | quatre formes nommées (`methodQuantityForm`), 8 phrases qui mordent, 6 qui passent. ⚠️ **Zéro cas sur les deux plans archivés** : les 23 unités ont une méthode libre. La garde est élargie ; elle n'a pas de matière pour se montrer. |
| Chaque test a un cas qui mord et un cas qui passe | ✅ | 17 + 6 + 10 épreuves, chaque bloc porte les deux |
| **Combien des 64 lignes divergentes sont fermées** | **64 / 64** | `deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-C.ts` — 29 → 0 sur PERTE, 35 → 0 sur GAIN, **par la définition du lot 0** |

---

## 7. Fichiers créés ou modifiés

### Moteur — `supabase/functions/_shared/keel/`

| fichier | ce qui change |
|---|---|
| `quantity_render.ts` | **créé.** `QuantityLocale`, `formatQuantityNumber`, `QUANTITY_READ_STATES`, `QUANTITY_SCOPES`, `renderQuantity`, `QuantityFinalizeCounts`, `finalizeQuantityProse`, `planQuantityLines`. Pur, sans dépendance — c'est ce qui le rend importable par le navigateur. |
| `plan_proportion_units.ts` | `METHOD_QUANTITY_RE` **conservée** ; trois expressions ajoutées (`fraction`, `spelled`, `ratio`), `METHOD_QUANTITY_FORMS` et `methodQuantityForm` exportés ; `methodSpellsQuantities` délègue. |
| `quantity_render_test.ts` | **créé** — 17 épreuves, le banc du lot. |
| `quantity_final_wiring_test.ts` | **créé** — 6 épreuves de position. |

### Handler

| fichier | ce qui change |
|---|---|
| `generate-household-meal-v1/index.ts` | import de `finalizeQuantityProse` / `planQuantityLines` ; **un seul** appel, après `applySizing` et la reconstruction des courses, avant le recollage ; journal `keel.household_meal.quantity_final` ; `issue` `quantity_prose_stale:<n>` ; le recollage de la charge `dishes` porte désormais `quantity`, `amount` et `grams_raw` (compteur `quantity_relinked`). |

### Front

| fichier | ce qui change |
|---|---|
| `frontend/src/keel/lib/ingredientQuantity.ts` | **créé.** `ingredientQuantityText` / `ingredientQuantityState` — la locale de l'écran donnée au module partagé, rien d'autre. |
| `frontend/src/keel/api/mealGeneration.ts` | `DishIngredient` += `amount`, `unit`, `state`, `grams_raw`, `ref`, `ref_refused` ; `readIngredients` les recopie (`null` jamais zéro, `=== true` sur le booléen). **Ferme C3 du lot A.** |
| `frontend/src/keel/components/CookingSessions.tsx` | la carte de cuisine rend `ingredientQuantityText(ing)`. |
| `frontend/src/keel/components/DishCard.tsx` | idem, périmètre « plat ». |
| `frontend/src/keel/components/plan/PlanDayBlock.tsx` | idem, casseroles du jour. |
| `frontend/src/keel/lib/ingredientQuantity.int.test.ts` | **créé** — 10 épreuves, rendu réel + rechargement. |

### Instrument et preuves

| fichier | ce qui change |
|---|---|
| `scripts/2026-09-11-mesure-grille.ts` | `quantitesApresLotC` (nouveau) : le **même** contrôle ⑨ rejoué sur une **copie** finalisée par la fonction de production ; bloc de rendu additif. **Aucun nombre d'origine touché.** |
| `scripts/2026-09-11-mesure-grille_test.ts` | 2 tests ajoutés : les 64 se ferment **et la fixture n'est pas mutée** ; le contrôle ⑨ d'origine vaut toujours 29 et 35. **22 verts.** |
| `scratchpad/…/sonde-lot-C.ts` + `sonde-lot-C-2026-09-11.txt` | **créés** — la sonde et sa sortie figée. |
| `scratchpad/…/mesure-lot-C-2026-09-11.txt` | **créé** — l'instrument après le lot. |
| `scratchpad/…/RAPPORT-LOT-C-2026-09-11.md` | ce fichier. |

⛔ **Non touchés, exprès** : `RAPPORT-MESURE-2026-09-11.md`, `mesure-2026-09-11.txt`,
`RAPPORT-LOT-A-…`, `mesure-lot-A-…`, `RAPPORT-LOT-B-…`, `mesure-lot-B-…`,
`fixtures/*` (dont `empreintes.json`), `scratchpad/2026-09-11-REVUE-CAMPAGNE/*`.

### Empreintes après le lot

À reporter dans `empreintes.json` **par le lot qui refera une mesure de référence** :

```
quantity_render.ts         f3386056d23bfaaa0b77322a6c576fc597ed9c68d803be56e0b8282e6255f1c8
plan_proportion_units.ts   4e07e8a70eae4af1985658393af2fdd676bc1709be5e5f8fcf337bc6fefff38f
```

### Commandes réservées à l'humain

**Aucune.** Pas de migration, pas de déploiement, pas de secret, pas d'écriture en base.

⚠️ **Avant tout run réel**, le runtime edge sert des `_shared` **périmés** :
`plan_proportion_units.ts` a été MODIFIÉ et `quantity_render.ts` est NEUF. Il faut
redémarrer `functions serve` lui-même (`./scripts/local_serve_functions.sh`) — **jamais**
`docker restart` tant que `functions serve` tourne. C'est le terminal de l'humain.

---

## Pour les lots suivants — défauts vus en passant, avec fichier, ligne et preuve

### Lot D — les composants culinaires

**C4 — NOUVEAU, et il vient de ce lot.** `applySizing` multiplie les lignes en **unité
dénombrable**. Mesuré sur les deux plans : **7 lignes** (2 PERTE, 5 GAIN) portent un
`amount` fractionnaire sur `unit: "unit"` — `prep_lentils` calcule **0,385 cube de
bouillon**, et deux « un demi-citron » valent **0,626** et **0,540**. `unitsOfPlan`
verrouille bien ces lignes pour l'**ajusteur** (`counted_unit`, `plan_proportion_units.ts`
~ligne 216), mais **le dimensionnement ne lit pas ce verrou** : `scaleIngredients`
(`portion_sizing.ts`) teste `typeof ing.amount === "number"` et rien d'autre. Le compteur
`counted_fractional` de `keel.household_meal.quantity_final` le rend visible ;
`renderQuantity` affiche désormais le vrai nombre, ce qui rend le défaut **lisible à la
cuisine** au lieu d'être caché derrière « 1 cube ». Ce n'est **pas** un défaut de rendu.

**C5 — NOUVEAU.** Les **5 lignes rendues nues** (`structured_bare`) sont **toutes** des
citrons écrits en lettres (« un demi-citron », « la moitié d'un citron »). Sur l'une d'elles
(PERTE `sat/lunch`, `amount` exactement 0,5) le texte d'origine était **juste**, et il est
remplacé par un « 0,5 » nu : **une ligne sur 96 perd une phrase française contre un nombre
exact**. La règle n'a pas d'exception, exprès — une règle avec une dérogation pour le cas
où elle est moche est une garde qui se désarme. Si le lot D veut la richesse, la réponse
est côté **contrat** : demander au modèle d'écrire aussi `amount`/`unit` sur ces lignes-là,
pas de relire « un demi ».

**D2 / D3 (inchangés, lot B).** L'ajusteur a maintenant de la place ([123–250] au lieu de
[250–250]) et sa visée n'est pas une contrainte.

### Lot E — le contrôle du plan livrable

**E7 — NOUVEAU, et il est directement exploitable.** `frontend/src/keel/api/mealGeneration.ts`
transporte désormais `ref` et `ref_refused` **jusqu'à l'écran** (C3 du lot A, fermé). Les
lignes de `shopping_list`, elles, n'en ont **toujours** aucune : `mealShoppingPayload`
(`meal_generation.ts` ~9870) écrit `term`, `quantity`, `aisle`, `food_group`, `buy_on`,
`freeze_on_purchase` — pas de `ref`, pas d'`amount`, pas d'`unit`. C'est ce qui manque pour
agréger par identité alimentaire **et** contrôler la suffisance, les deux exigences du lot E.

**E8 — NOUVEAU.** La classe d'une ligne de courses (« pesée » / « comptée ») est décidée par
une **regex sur sa prose** : `generate-household-meal-v1/index.ts`, bloc de reconstruction
des courses,
`/^\s*\d+(?:[.,]\d+)?\s*(?:k?g|c?l|ml)\b/i.test(String(line.quantity ?? ""))`. Elle décide du
dénominateur de la mise à l'échelle. Une ligne en `kg` y est « pesée », mais
`leadingQuantityOf` (`portion_scaling.ts` ~696) la traite comme **dénombrable** et l'arrondit
à l'entier — deux lectures du même texte, dans le même geste.

**E9 — NOUVEAU.** `finalizeQuantityProse` rend `stale_before > 0` **une issue**
(`quantity_prose_stale:<n>`), pas un refus. Sur un plan neuf ce compteur doit tendre vers les
seules lignes que le dimensionnement a déplacées ; **s'il remonte, une mutation a été ajoutée
APRÈS ce point** — c'est-à-dire que ce bloc a cessé d'être le dernier. Le lot E devrait
décider si un plan qui le porte reste `conforme`.

**E1 / E2 / E3 (inchangés).** `ok=true` avec `energy: null` et `boxContract: null` ; le
plancher protéique n'est comparé à rien ; les 8 alertes d'achats comparent des mots.

### Hors lots

**Z4 — NOUVEAU.** `frontend/src/keel/components/ShoppingListPanel.tsx` est **intestable en
rendu** : il est enveloppé d'un `Modal` qui fait `createPortal(…, document.body)`, et
`vitest.config.ts` déclare `environment: "node"`. Le lot C a donc dû prouver le rendu des
courses par `PlanDayBlock`, qui lit la **même** liste par les **mêmes** accesseurs
(`groupByAisle`, `item.quantity`). Le panneau lui-même n'est monté par aucun test de ce
dépôt. Le réparer demande soit un environnement `jsdom` par fichier, soit d'extraire la
liste hors du `Modal` — les deux sont des décisions qui dépassent ce lot.
