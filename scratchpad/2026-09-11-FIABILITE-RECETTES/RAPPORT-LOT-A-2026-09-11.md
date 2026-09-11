# Lot A — une identité alimentaire jusqu'au dernier lecteur

Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, section « Lot A ».
Socle : `scratchpad/2026-09-11-FIABILITE-RECETTES/SOCLE.md`.
Le lot 0 et son rapport ne sont **pas** modifiés : `RAPPORT-MESURE-2026-09-11.md` et
`mesure-2026-09-11.txt` restent l'état AVANT, à l'octet près.

> ⛔ **Aucun appel modèle, aucune génération, aucune écriture en base.** Tout ce qui suit
> sort de `deno test`, de `deno check`, de l'instrument du lot 0 et d'une sonde hors ligne,
> tous en `--allow-read`. Rien ici ne dit quoi que ce soit du **goût**, de la **texture**
> ou de la **faisabilité** d'une recette : aucune n'a été cuisinée.

---

## 4. Les arbitrages — la partie à lire en premier

| question | décision | raison |
|---|---|---|
| Où vit la décision « quelle référence pour cette ligne » ? | Dans `food_composition.ts`, fonction `resolveCompositionLine`. `meal_generation.ts::refForIngredient` n'est plus qu'une façade d'une ligne. | Elle vivait dans le **parseur de génération**, donc hors de portée de tout ce qui mesure. Les quatre lecteurs qui décident d'une portion repartaient du libellé. Le module commun est le seul objet que les deux moitiés partagent. |
| Faut-il ajouter un alias « pita complete » ? | **Non.** La table d'alias n'est pas touchée, et le test `① LE CAS QUI MORD` vérifie qu'elle ne l'est pas. | La revue l'écrit : « ajouter seulement un alias pour "pita complète" laisserait le défaut structurel intact ». Un alias ferme deux cas et laisse le mécanisme entier. |
| Faut-il une migration pour mettre `unit_grams` dans la vue du sas ? | **Non, et c'est un refus argumenté.** | `food_composition_pending` n'a **aucune** colonne `unit_grams` — la vue n'en cache pas une, la table n'en a pas. L'ajouter voudrait dire demander au modèle combien pèse « une » pita, c'est-à-dire faire entrer une **estimation modèle** dans une pesée. Or les lignes du sas sont `fill_source ∈ {model, group_bounds}` donc `a_verifier` donc **non composables** : elles ne doivent pas peser une unité. La vraie réparation est celle du lot : `pita_wholemeal`, `manual`, `verifie`, `unit_grams = 60`, atteinte par son identifiant. |
| Une ligne dont l'identifiant est refusé peut-elle être bornée par son groupe ? | **Non.** `dishEnergy` l'éteint avec un motif à elle, `ref_refused`. | La borne de groupe est le repli d'un terme que **personne** n'a prétendu connaître (tolérée sous 5 % du plat, comptée). Une ligne à identifiant refusé est le seul cas où quelqu'un a **affirmé** savoir de quel aliment il parle, et s'est trompé. « Aucun repli silencieux vers le terme, une moyenne de groupe ou une estimation modèle. » |
| Une ligne refusée doit-elle entrer dans `unresolvedTerms` ? | **Non** : nouveau compteur `refusedTerms` + `refusedBy`. Elle sort quand même de `coverage`. | `unresolvedTerms` est la **worklist du sas**. Y mettre un identifiant inventé ferait payer un appel modèle pour estimer un libellé sans rendre la ligne valide. Les confondre ferait « chercher des alias pour un problème de prompt ». |
| La porte de validation (`isComposable`) descend-elle dans le résolveur commun ? | **Non.** Elle reste dans `readRefSlug` (composition). Le résolveur commun ne la consulte pas ; `resolveIngredients` continue de **nommer** les lignes non vérifiées dans `unverifiedTerms`. | Arbitrage ② du socle, déjà écrit dans `food_reference_manifest.ts` : « la porte est à la composition, pas à la mesure ». La descendre rendrait illisible tout plan déjà servi qui cite une ligne devenue douteuse — on effacerait la trace d'un défaut au lieu de la lire. |
| Faut-il persister `ref_refused` ? | **Oui**, dans `dishes[].ingredients[]` et `dishes[].boxes[].items[]`, écrit **même à `false`**. | `readRefSlug` ne rend jamais un slug refusé : `ref` part à `null` pour « rien écrit » **et** pour « identifiant inventé ». Relu depuis la base, le second redevenait le premier et la ligne repassait par le terme libre. C'est le point 6 du plan, mot pour mot. Colonne `jsonb` ⇒ **aucune migration**. |
| Un item de contenant écrit par le **modèle** reçoit-il un identifiant ? | **Non** : `ref: null`, chemin historique par le terme. | Le rapprocher d'une ligne d'ingrédient homonyme serait exactement « retrouver son aliment par son libellé », et un plat porte des homonymes (sel de cuisson / sel de finition). Les items que le **moteur** écrit (`applySizing`) portent, eux, l'identité de leur ligne — et ce sont eux qui survivent sur la lane v4. |
| Un item qui cite une casserole ? | `ref: null`, `refRefused: false`, et c'est une affirmation. | Son énergie vient de la casserole entière (`potDensities`) et son `term` est le **titre** de la casserole, pas un aliment. Son identité, c'est `preparationId` ; son prélèvement effectif, c'est `grams`. Les deux étaient déjà là et sont conservés. |
| Comment détecter une contradiction identifiant ↔ libellé ? | `refTermConflict(index, line)` compare deux **slugs**, jamais deux libellés, et ne décide rien — elle compte. Elle vit **hors** de `resolveIngredients`. | « Ne pas imposer une égalité textuelle entre un libellé français et un libellé anglais » : « pita complète » / `pita_wholemeal` doit rester valide. Et une seconde résolution par ligne dans `resolveIngredients`, appelée des milliers de fois par un ajustement, se paierait à chaque passe. |
| L'instrument du lot 0 : le corriger ou le laisser mentir ? | Corrigé sur deux phrases, **jamais sur un verdict**. | Il imprimait « `readIngredient` NE TRANSMET PAS `ref` », qui est devenu faux. Laisser un instrument affirmer un défaut réparé est le symétrique exact de ce que le lot 0 existe pour empêcher. Les **nombres**, eux, n'ont été touchés nulle part. |
| Les empreintes `modules_de_mesure` de `empreintes.json` ? | **Pas mises à jour.** | Elles datent le code qui a produit le rapport du lot 0. Les réécrire effacerait le signal « le code a bougé ». Les nouvelles sont listées au § 6 de ce rapport. |

---

## 1. Ce qui est fait et prouvé

### 1.1 Les deux `pita_wholemeal` deviennent mesurables, et `1 unit` vaut 60 g

```
deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-A.ts
```

Sortie figée : [`sonde-lot-A-2026-09-11.txt`](sonde-lot-A-2026-09-11.txt). Quantités de
l'archive, au caractère ; la **seule** différence entre les deux lignes est la présence du
champ `ref` que le modèle avait déjà écrit.

| case | sans `ref` | avec `ref` |
|---|---|---|
| PERTE `sat/lunch` | `unknown_ingredient` · 384 g · **aucune énergie** | **668 kcal** · 444 g · 150,5 kcal/100 g · aucun trou |
| GAIN `fri/dinner` | `unknown_ingredient` · 315 g · **aucune énergie** | **995 kcal** · 375 g · 265,6 kcal/100 g · aucun trou |
| **témoin** PERTE `sun/dinner` | 895 kcal · 379 g · 236,2 | 895 kcal · 379 g · 236,2 — **rien ne bouge** |

**Les +60 g de masse prête sont exactement `unit_grams` de `pita_wholemeal`.** La ligne
GAIN est écrite `1 unit`, la ligne PERTE `60 g` : les deux atterrissent sur 60 g.

Le témoin est la moitié qui compte : une case qui marchait déjà rend le **même** nombre
des deux côtés. Une sonde dont le témoin bouge mesure autre chose que ce qu'elle dit.

Épreuves correspondantes : `food_identity_lot_a_test.ts` ① (trois cas, dont
`① LE CAS QUI MORD` qui vérifie que la table d'alias **n'a pas** été élargie).

### 1.2 Le petit-suisse : le contrefactuel est devenu la mesure

```
deno run --allow-read scripts/2026-09-11-mesure-grille.ts scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures
```

GAIN `sat/breakfast`, boîte de 523 g : `dish_incomplete` → **546,00 kcal**, par le chemin
**nominal**. Le nombre n'a pas bougé d'un centième — c'est le chemin qui a bougé. Le
contrefactuel du lot 0 (relier à la main la ligne à `petit_suisse_cream_cheese`) ne déplace
désormais **plus rien** : c'est l'identité, et c'est la preuve demandée.

La même référence est employée aux trois étapes, et chacune est épinglée
(`food_identity_lot_a_test.ts` ②) :

- **mesure** `measureFresh` / `resolveIngredients` → 258,156 g, 229,24 kcal pour la ligne ;
- **ajustement** `unitsOfPlan` → `lines_locked.unresolved: 0`, ligne non verrouillée,
  groupe `dairy_cheese` lu sur la fiche ;
- **relecture** `readIngredients` depuis le JSON snake_case → `ref: petit_suisse_cream_cheese`.

Le cas qui mord est à côté : la même ligne **sans** son identifiant rend `kcal: null` et
`lines_locked.unresolved: 1`.

### 1.3 Identifiant valide + libellé inconnu / pluriel / accentué ⇒ même référence

`food_identity_lot_a_test.ts` ③. Cinq libellés, dont un (« pita complet ») qui a un alias
**existant** menant à un **autre** aliment (`pita_bread`, 275 kcal, raffiné) : l'identifiant
le supplante dans les cinq cas.

Le cas qui mord : identifiant **invalide** + libellé **connu** (`riz`, alias parfaitement
valide) ⇒ `refusal: "ref_unknown"`, `resolved: []`, `refusedTerms: ["riz"]`,
`coverage: 0`, et le plat sort `gaps: ["ref_refused"]` — **aucun secours par alias, aucune
borne de groupe**.

Et le refus du parseur (`refRefused: true`, `ref: null` — la forme exacte que le parseur
écrit) ne retombe jamais sur le terme, avec juste à côté le cas qui passe : sans le
drapeau, le même terme pèse.

### 1.4 Raisin frais/sec, prune fraîche/séchée, cru/cuit, ancienne ligne sans `ref`

`food_identity_lot_a_test.ts` ④, quatre épreuves :

- `raisin` par le **terme** → `grapes` (68,9) via la porte des faux amis ;
  par l'**identifiant** `raisin` → 321 kcal. Idem `prune` → `plum` (46) / `prune` (229).
  La contradiction est **comptée** (`refTermConflict` rend `{declared: "raisin", viaTerm:
  "grapes"}`) et ne décide rien. Deux cas qui ne doivent **pas** compter : un identifiant
  d'accord avec son libellé, et « pita complète » / `pita_wholemeal` — un libellé français
  et un slug anglais ne sont pas une contradiction.
- cru/cuit : 100 g crus → 100 ; 260 g cuits → 100 (facteur de la fiche). Le cas qui mord :
  un `state` **absent** sur `grain_absorbs` reste **non pesé**, identifiant ou pas.
- ancienne ligne sans `ref` (clé `undefined`, pas `null`) : chemin historique intact,
  `source: "term"`, `refusedTerms: []`. Et le repli ne permet pas d'omettre `ref` sur un
  plan neuf : `readRefSlug` rend `absent` / `accepted` / `unknown` / `not_composable`,
  les quatre épinglés.
- **lignes non pesées (condiments)** : `sel` sans quantité est pesé par convention et
  compté dans `conventionalTerms`, **pas** comme référence vérifiée. Le cas qui mord : un
  condiment dont l'identifiant est inventé reste **refusé** — la convention pèse une
  pincée, elle ne valide pas une identité.

### 1.5 L'aller-retour parseur → transformation → payload → lecteurs

`food_identity_lot_a_test.ts` ⑤, quatre épreuves :

- **préparation partagée + deux lignes du même nom** : deux lignes « huile d'olive » dans
  la même casserole, l'une sur `olive_oil`, l'autre sur `tahini`. Avec identités : **909
  kcal**. Par le seul libellé : **970 kcal** — les deux lectures diffèrent de plus de 50,
  et le test échoue si elles se rejoignent.
- **aller-retour JSON**, y compris le refus : trois lignes (`ref` accepté / `ref_refused:
  true` / historique). L'identifiant pèse (pita = 60 g), le terme historique pèse, et la
  ligne refusée **reste refusée** (`refusedBy: ["ref_refused"]`). Le cas qui mord est le
  **même payload sans la clé** `ref_refused` — un plan d'avant ce lot — et ses trois lignes
  pèsent, dont `riz`.
- `readPreparations` : `2 unit` de pita → 120 g prêts, 318 kcal.
- **l'ajusteur** : `adjustPlanProportions` ne verrouille plus la pita en `unresolved`
  (elle l'était avant le lot, et l'ajusteur travaillait alors sur une assiette amputée de
  son pain) ; elle reste verrouillée `counted_unit` — « 1 pita » ne devient pas « 1,2 ».
  `prose_stale: 0`.

### 1.6 `composition_fill` n'est plus appelé pour un aliment dont l'identifiant existe

`food_identity_lot_a_test.ts` ⑥, trois épreuves. `fillRequestsFor` teste désormais
`resolveCompositionLine(index, input).refusal !== "term_unknown"` au lieu de
`resolveIngredient(index, terme)`.

- les deux pitas (sans alias, avec identifiant) ⇒ `requests: []` ;
- la même pita **sans** identifiant ⇒ `requests: ["pita complete"]` — c'est exactement ce
  qui s'est passé le 2026-09-11, où le sas a inventé `whole wheat pita bread` à **258
  kcal** (`fill_source: model`, donc non composable) alors que `pita_wholemeal` existait,
  vérifiée, à **265** ;
- une ligne **refusée** par son identifiant n'est pas une worklist, et le vrai terme
  inconnu à côté l'est.

Effet mesuré sur les fixtures : PERTE passe de **1 ligne « en attente de validation »**
(`whole_wheat_pita_bread`) à **0**, et de 46 à **47** références vérifiées.

### 1.7 Les contrôles du dépôt

| commande | résultat |
|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **6569 passed · 3 failed** (avant : 6550 · 3) — **+19 tests, mêmes 3 rouges** |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | **Check** (exit 0) |
| `deno check supabase/functions/meal-energy-v1/index.ts` | **Check** (exit 0) |
| `deno run --allow-read scripts/2026-09-11-mesure-grille.ts …/fixtures` | exit 0 — sortie au § 2 |
| `deno test --allow-read scripts/2026-09-11-mesure-grille_test.ts` | **19 passed · 0 failed** |
| `cd frontend && npx tsc -b --force` | exit **0** |
| `cd frontend && npx vitest --config vitest.config.ts run` | **2 failed · 2533 passed · 20 skipped (161 fichiers)** |
| `cd frontend && npm run build` | exit 0, 2 pages prérendues |

Les 3 rouges Deno sont **les trois du socle**, aux mêmes lignes :
`cooking_style_brief_test.ts:70`, `household_freeze_test.ts:286`,
`household_merge_quota_test.ts:190`.

Les 2 rouges front sont `mouthProfileReaders.int.test.ts:154` (nommé par le socle) et
`energyBasis.int.test.ts:188` — un inventaire de clés i18n devenu incomplet par le travail
d'une session voisine sur `student_progress.journal.*`. **Les comptes sont ceux du socle
au tir près** (2 failed | 2533 passed | 20 skipped | 161 fichiers) ; le socle nommait
`mouthProfileReaders` deux fois, le dépôt partagé a bougé entre-temps. Aucun des deux
fichiers n'est touché par ce lot.

---

## 2. Chaque nombre qui bouge dans l'instrument, et pourquoi

Diff complet : `mesure-2026-09-11.txt` (avant, lot 0, intact) →
[`mesure-lot-A-2026-09-11.txt`](mesure-lot-A-2026-09-11.txt) (après).

| ligne | avant | après | pourquoi |
|---|---|---|---|
| PERTE ① référence vérifiée | 46 | **47** | `pita complète` se résout sur `pita_wholemeal` au lieu de tomber sur le sas. |
| PERTE ③ en attente de validation | 1 (`whole_wheat_pita_bread`) | **0** | Même cause : la ligne `model` du sas n'est plus atteinte. |
| GAIN ① référence vérifiée | 47 | **49** | Les deux ingrédients non mesurables retrouvent leur fiche. |
| GAIN ④ ingrédient non mesurable | 2 (`petits suisses nature`, `pita complete`) | **0** | Idem. |
| GAIN portions mesurables | 5 | **6** | `sat/breakfast` : `dish_incomplete` → 546,00 kcal. |
| GAIN portions conformes | 5 / 5 | **5 / 6** | Le dénominateur grandit **et** la nouvelle portion échoue : −25,00 % contre 728 kcal visés. **C'est la vérité qui apparaît, pas une régression** : elle était cachée derrière `dish_incomplete`. |
| GAIN 2026-09-12, journée | ⚪ non mesurable (1 portion sur 3 manquante) | **❌ −6,36 %** | Même cause : la journée devient mesurable, et elle est en écart. |
| GAIN 2026-09-12, protéine | ⚪ non mesurable | **✅ 140,4 g contre 99 g de plancher couvert** | Même cause. |
| GAIN 2026-09-12 `breakfast`, densité | ⚪ non mesurable | **✅ 104, dans le couloir [104–250]** | Même cause. |
| « PROUVÉ » | 9 | **9** | Le contrefactuel petit-suisse quitte la liste (il ne déplace plus rien) ; la protéine de GAIN 2026-09-12 y entre. |
| « ÉCHOUE » | 69 | **70** | +2 (la case GAIN `sat/breakfast` hors tolérance de repas, sa journée hors tolérance) −1 (la case n'est plus « non mesurable »). |
| « NON MESURABLE » | 16 | **14** | Deux journées à trou de GAIN se referment. |
| index de relecture, `asked · kept` | 1·1 (PERTE), 2·1 (GAIN) | **0·0** | Plus aucun terme inconnu ⇒ le sas n'est plus interrogé. |
| témoin `keel.meal_energy.reading_index` | ✅ même index | **⚠️ ne demande plus autant que le témoin** | **Le témoin est un journal du run du 2026-09-11, pas une cible.** Il dit ce que le moteur a demandé ce jour-là, avec le code de ce jour-là. Le test correspondant a été reformulé pour mordre **dans le sens qui compte** : demander **plus** que le témoin serait le défaut à l'envers ; demander moins, c'est le lot. |

Ce qui **ne bouge pas**, et qu'il faut lire :

- `portions calculées` reste **12 / 14**. Les deux cases sans boîte n'ont **aucune** boîte
  dans l'archive : le moteur n'a pas su dimensionner leur assiette le 2026-09-11, donc il
  n'a rien écrit, et **une boîte absente d'une archive le reste pour toujours**. L'instrument
  ne peut donc pas les faire réapparaître ; c'est la sonde du § 1.1 qui montre qu'elles
  redeviennent mesurables.
- Les deux dimanches valent toujours **2 455,69** et **2 916,14** kcal, aux mêmes écarts.
- Les **8 alertes d'achats** sont identiques et nominatives. Elles comparent toujours des
  **mots** — c'est le lot E.
- Les **64 lignes de prose périmée** sont identiques — c'est le lot C.
- Les **deux cibles pour la même case** (facteur 2,86) sont identiques — c'est le lot B.

---

## 3. Ce qui est fait mais non prouvé, et ce qui n'est pas fait

### Fait, non prouvé par un run

- **Le refus persisté (`ref_refused`) n'a jamais traversé une vraie génération.** Il est
  écrit par `ingredientPayload` et relu par `readIngredients`, et l'aller-retour est testé
  sur un payload construit à la main. Aucun plan de la base ne porte encore la clé : les
  deux fixtures ont **zéro** identifiant refusé, donc le chemin « refusé en base » n'a pas
  d'exemple réel. C'est une limite de la matière, pas un test sauté.
- **Le prompt n'est pas touché, et aucun effet de prompt n'est revendiqué.** Le lot ne
  change ni `renderCatalogBlock` ni la consigne : il ne peut donc rien dire de l'obéissance
  future du modèle.
- **Les items de contenant que le moteur écrit portent maintenant `ref`**, et
  `densityFromComposition` le lit — mais `densifyBoxes` ne tourne que sur la lane legacy
  (`!portionSizing.applied`), et aucune des deux fixtures n'est passée par là. Le chemin
  est branché et typecheck ; il n'a pas de mesure à lui.

### Pas fait, et pourquoi

- **Le nouveau dimensionnement du petit-suisse contre sa vraie cible.** Le plan le demande
  (« après nouveau dimensionnement, mesurer la nouvelle portion contre sa vraie cible, pas
  contre 546 »). Redimensionner demande de rejouer `applySizing` puis de réécrire un plan,
  c'est-à-dire une génération — **interdite à ce lot**. Ce qui est prouvé ici est la moitié
  gauche : à quantités historiques constantes, **546,00 kcal**, et l'écart de **−25 %**
  contre 728 est désormais **visible** au lieu d'être masqué par `dish_incomplete`.
- **Aucune migration.** Argumentée au § 4. Il n'y a donc **aucune commande réservée à
  l'humain** au titre de ce lot.
- **Le sas n'a pas été purgé de `whole_wheat_pita_bread`.** La ligne reste en base ; elle
  n'est simplement plus atteinte par ces deux plans. Le socle interdit toute suppression de
  données, et le lot n'en a pas besoin.
- **Les lots B à E ne sont pas touchés** : ni `requiredDensityFor` / `slotPlanTargets`
  (B), ni la synchronisation des quantités affichées (C), ni les rôles culinaires (D), ni
  `final_plan_gate` (E). Les défauts vus en passant sont au § « pour les lots suivants ».

---

## 5. Les tests de sortie du lot, un par un

| test de sortie du plan | verdict | preuve |
|---|---|---|
| Les deux `pita_wholemeal` deviennent mesurables ; `1 unit` utilise les 60 g de la fixture vérifiée. | ✅ | sonde § 1.1 (`unknown_ingredient` → 668 / 995 kcal, +60 g de masse prête) + `food_identity_lot_a_test.ts` ① (`gramsRaw === 60`) |
| Le petit-suisse emploie la même référence à la génération, à l'ajustement et à la relecture. | ✅ | `food_identity_lot_a_test.ts` ② (trois étapes) |
| À quantités historiques constantes, retrouver le contrefactuel (546 kcal). | ✅ | instrument § 4 GAIN `2026-09-12 breakfast` = **546,00** par le chemin nominal ; `mesure-grille_test.ts` « le contrefactuel est devenu la mesure » |
| Après nouveau dimensionnement, mesurer la nouvelle portion contre sa vraie cible. | ⚪ **non fait** | demande une génération, interdite à ce lot. L'écart de −25 % contre 728 est en revanche **rendu visible**. |
| Identifiant valide + libellé inconnu/pluriel/accentué → même référence. | ✅ | ③, cinq libellés dont un alias contradictoire |
| Identifiant invalide + libellé connu → refus explicite, sans secours par alias. | ✅ | ③ cas qui mord : `ref_unknown`, `coverage 0`, `gaps: ["ref_refused"]` |
| Cas raisin frais/sec, prune fraîche/séchée. | ✅ | ④ (68,9 / 321 et 46 / 229) + `refTermConflict` |
| Cas cru/cuit. | ✅ | ④ (100 / 260 / `state` absent non pesé) |
| Ancienne ligne sans `ref`. | ✅ | ④ (clé absente ⇒ chemin historique) + ⑤ (payload sans `ref_refused`) |
| Aller-retour parseur → transformation → payload → lecteurs, identités et valeurs préservées. | ✅ | ⑤, quatre épreuves |
| … y compris une préparation partagée et deux lignes portant le même nom. | ✅ | ⑤ (909 vs 970 kcal) |
| Chaque test a un cas qui mord et un cas qui passe. | ✅ | 19 épreuves, chaque bloc porte les deux |

---

## 6. Fichiers créés ou modifiés

### Moteur — `supabase/functions/_shared/keel/`

| fichier | ce qui change |
|---|---|
| `food_composition.ts` | `CompositionInput` += `ref`, `refRefused`. Nouveaux `resolveCompositionLine`, `refTermConflict`, `LINE_REF_SOURCES`, `LINE_REF_REFUSALS`. `ResolutionResult` += `refusedTerms`, `refusedBy` ; `coverage` les retire des connus. `resolveIngredients` passe par le résolveur commun. |
| `plan_energy_read.ts` | `readIngredient` transmet `ref` et `ref_refused`. **La ligne qui manquait.** |
| `plan_energy.ts` | `ENERGY_GAPS` += `ref_refused`. `dishEnergy` éteint un plat qui porte une ligne refusée, **avant** la borne de groupe. Le prédicat « ce terme est-il connu » passe par le résolveur commun. `memberAddonEnergy` pose `ref: a.foodRef` (c'est déjà un slug). |
| `meal_generation.ts` | `refForIngredient` délègue (façade d'une ligne). `BoxItem` += `ref`, `refRefused`. `ingredientPayload` écrit `ref_refused`. La sérialisation des contenants écrit `ref` et `ref_refused`. Le compteur de variété des ancres protéiques lit les **lignes**, plus leurs libellés. |
| `composition_contract.ts` | `readRefSlug` fait sa recherche exacte **par** `resolveCompositionLine` ; la porte `isComposable` reste ici. |
| `composition_fill.ts` | `fillRequestsFor` ne réclame que `term_unknown` : plus d'appel modèle pour un aliment dont l'identifiant existe, ni pour une ligne refusée. |
| `preparation_mass.ts` | `POT_MEASURE_GAPS` += `ref_refused`. **Aucun autre changement** — il était déjà réparé par le résolveur commun. |
| `plan_proportion_units.ts` | `AdjustablePlanLine` += `ref`, `refRefused`. `unitsOfPlan` et `measureOfPlan` les transportent jusqu'à la `MeasureFn`. |
| `proportion_adjust.ts` | `AdjustableIngredient` += `ref`, `refRefused`. |
| `portion_sizing.ts` | `PortionIngredient` et `ScalableIngredient` += `ref`, `refRefused`. Les deux endroits où `applySizing` écrit des items de contenant recopient l'identité de la ligne. Nouveau type local `SizedBoxItem`. |
| `box_densify.ts` | `DensifyItem` += `ref`, `refRefused`. `densityFromComposition` lit l'identifiant, pour l'item frais **et** pour le groupe majoritaire d'une casserole. |
| `meal_boxes_test.ts` | trois littéraux de contenant mis à la nouvelle forme. |
| `food_identity_lot_a_test.ts` | **créé** — 19 épreuves, le banc du lot. |

### Handler

| fichier | ce qui change |
|---|---|
| `generate-household-meal-v1/index.ts` | la worklist de `composition_fill` porte `ref`/`refRefused` ; les items passés à `densifyBoxes` aussi. |

### Instrument et preuves

| fichier | ce qui change |
|---|---|
| `scripts/2026-09-11-mesure-grille.ts` | `censusDesReferences` compte `refusedTerms` (sinon les quatre états ne font plus `lignes`). Deux phrases corrigées : celle qui affirmait que `readIngredient` ne transmet pas `ref`, et le verdict du témoin d'index. **Aucun nombre touché.** |
| `scripts/2026-09-11-mesure-grille_test.ts` | 6 épreuves mises à jour, chacune avec son « avant » écrit en commentaire et un cas qui mord ajouté là où il manquait. |
| `scratchpad/…/sonde-lot-A.ts` | **créée** — la sonde du § 1.1. |
| `scratchpad/…/sonde-lot-A-2026-09-11.txt` | **créée** — sa sortie figée. |
| `scratchpad/…/mesure-lot-A-2026-09-11.txt` | **créée** — l'instrument après le lot. |
| `scratchpad/…/RAPPORT-LOT-A-2026-09-11.md` | ce fichier. |

⛔ **Non touchés, exprès** : `RAPPORT-MESURE-2026-09-11.md`, `mesure-2026-09-11.txt`,
`fixtures/*` (dont `empreintes.json`), `scratchpad/2026-09-11-REVUE-CAMPAGNE/*`.

### Empreintes des modules après le lot

À reporter dans `empreintes.json` **par le lot qui refera une mesure de référence**, pas
par celui-ci :

```
food_composition.ts        1bc7f672203eec61a3e179e600736c76c2609a3b1bccdc32d1fdbecdfceb8e05
plan_energy_read.ts        917acba66e02b29679f1dc3853e0eb3320b21ea8194ad8b3ba3ee964d9e93241
plan_energy.ts             4597c010bab53fc4d061b436aa4e5ab405b0c034855872b6a5c13d5def24d78b
portion_sizing.ts          441af2636741851c8c467e8c84878c80d9d486822057e77bd4549ff8f5d4ea0d
preparation_mass.ts        f91e6a9cb2cfa3a3a9d338ce77c5328872dacb8f2e8c05debdc97c03b585ccee
plan_proportion_units.ts   35178e331f06b748375e3dd9fdd71037c1ff4e7c56a66ea606b1df4d36201021
composition_contract.ts    3765cd924d78990579b4e16c9d7883e77993af5eb408c5e28e22c92b48575617
composition_fill.ts        73d5aa0b64ec12eebec93b0629bb4fba530b72158614a7e1fc0d2b3ea8418798
box_densify.ts             7499e8b0dc3bbaead239427ce442edb6f516e163c64c6763a6f2d9b98d550485
meal_generation.ts         0a27706acb7455e383589d5b41137d2d2e1699a898d7f481af6297e1f2af276c
mouth_energy.ts            cc5135d10e8ff7796290db4dbb8506b5ed56edef0bfa557940c99cb66d4df4fd  (inchangé)
```

> ⚠️ **`mouth_energy.ts` et `preparation_mass.ts` n'ont pas eu besoin d'être réécrits**
> (le second ne change que pour un jeton de vocabulaire). Ils passent par
> `resolveIngredients`, et le résolveur unique les a réparés depuis l'intérieur. C'est la
> preuve la plus courte que la décision est bien à un seul endroit.

---

## 7. Commandes réservées à l'humain

**Aucune.** Pas de migration, pas de déploiement, pas de secret, pas d'écriture en base.

---

## Pour les lots suivants — défauts vus en passant, avec fichier, ligne et preuve

### Lot B — le contrat par personne, date et créneau

**B1 (inchangé, reconfirmé).** `generate-household-meal-v1/index.ts:11994` et **8217** appellent `slotPlanTargets` avec le **rythme entier** ;
`portion_sizing.ts:3272` (`requiredDensityFor`) l'appelle avec **les moments de ce
jour-là**. *Preuve, rejouée après le lot A :* `PERTE / 2026-09-11 / dinner` vaut
**858,90 kcal** pour le dimensionnement et **2 454,00** pour le couloir du prompt ; GAIN
**1 019,20** contre **2 912,00**.

### Lot C — la quantité finale

**C1 (inchangé).** **64 lignes sur 96** affichent une quantité qui n'est plus celle du
calcul, facteurs de ×0,385 à ×1,517. `prep_lentils` : le grammage des lentilles a suivi,
celui de l'huile non ⇒ rapport huile/lentilles faux d'un facteur **2,6**.

**C3 — NOUVEAU, et il vient de ce lot.** `BoxItem` porte désormais `ref` et `ref_refused`,
**mais `frontend/src/keel/api/mealGeneration.ts` ne les lit pas** : le front continue de
lire `ing.quantity` et les `term` des items. Le lot C devra décider si l'UI a besoin de
l'identité (par exemple pour une liste de courses agrégée par aliment) ou seulement des
quantités structurées.

### Lot D — les composants culinaires

**D1 — NOUVEAU.** `plan_proportion_units.ts:273` (avant le lot : ligne 260) verrouillait en `unresolved` toute ligne
que le libellé ne résout pas. Ce verrou vient de se **desserrer** pour les lignes à
identifiant : des lignes jusqu'ici immobiles deviennent ajustables. C'est correct, mais
cela **augmente la surface** de l'ajusteur sur des plans réels, et le lot D doit le mesurer
avant d'assouplir quoi que ce soit d'autre. Sur le décor du banc, une ligne `1 unit` reste
verrouillée `counted_unit`, ce qui limite l'effet aux lignes en grammes.

### Lot E — le contrôle du plan livrable

**E1 (inchangé).** `ok=true`, `blocking: 0`, avec `energy: null` et `boxContract: null`.

**E3 (inchangé).** Les 8 alertes d'achats comparent des mots (`final_plan_gate.ts` ~1322-1339, `normalizePantryTerm`). Le lot A a **transporté l'identité jusque dans les items de contenant** :
`box.items[].ref` est désormais disponible pour l'agrégation par identité alimentaire que
le lot E demande. Les lignes de `shopping_list`, elles, n'en ont toujours pas.

**E4 — NOUVEAU.** `meal_generation.ts:6200`, `foodGroupOfTerm` déduit le groupe d'une ligne
de **courses** par `resolveIngredient(term)`. C'est le dernier lecteur de mesure qui parte
encore du libellé, et il décide de la **fenêtre de fraîcheur** d'un achat. Il n'a pas été
touché parce que les lignes de courses ne portent pas d'identifiant du tout — c'est le lot
E qui doit le leur donner.

### Hors lots — deux fonctions sans appelant de production

**Z1.** `portion_scaling_inputs.ts::proteinFoodPredicate` (ligne 69) et
`scalingInputsFor` (ligne 112) **n'ont aucun appelant de production** :
`grep -rn "scalingInputsFor\|proteinFoodPredicate" supabase/functions/ | grep -v _test`
ne rend que leurs propres déclarations. `portion_scaling.ts:538` et `:715` prennent
`isProteinFood` en paramètre **optionnel**, et les deux seuls passeurs sont des tests, dont
deux qui passent `() => false`. C'est le patron `optional-gate-params-are-disarmed-gates`,
sur une garde entière. Le prédicat classe encore par **libellé** ; le réparer avant de
savoir s'il sera rebranché serait réparer un module mort.
