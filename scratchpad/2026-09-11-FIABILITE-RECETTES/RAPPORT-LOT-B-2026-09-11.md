# Lot B — un contrat de budget par personne, date et créneau

Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, section « Lot B ».
Socle : `scratchpad/2026-09-11-FIABILITE-RECETTES/SOCLE.md`.
Les lots 0 et A ne sont pas modifiés : `RAPPORT-MESURE-2026-09-11.md`,
`mesure-2026-09-11.txt`, `RAPPORT-LOT-A-2026-09-11.md` et `mesure-lot-A-2026-09-11.txt`
restent l'état d'avant, à l'octet près.

> ⛔ **Aucun appel modèle, aucune génération, aucune écriture en base.** Tout ce qui suit
> sort de `deno test`, `deno check`, de l'instrument du lot 0 et de deux sondes hors ligne,
> tous en `--allow-read`. **Aucun effet de prompt n'est revendiqué** : le prompt change, et
> ce lot ne peut rien dire de l'obéissance future du modèle. Rien ici ne dit quoi que ce
> soit du **goût**, de la **texture** ou de la **faisabilité**.

---

## 1. Les arbitrages — la partie à lire en premier

| question | décision | raison, avec ses nombres |
|---|---|---|
| **A15 est-il levé par la réparation ?** | **NON. A15 tient.** `preferredPer100G` reste `Dmin × 1,10` projeté dans le couloir ; le chantier demandait `100 × E / Gpréf` et ce point est **refusé, mesuré**. | Une fois les couloirs réparés, la visée ancrée à la cible vaut **142 · 207 · 181** (PERTE) et **153 · 245 · 215** (GAIN) — sonde `sonde-lot-B-apres-2026-09-11.txt`. Les plats réels mesurés par ce dépôt vivent entre **113 et 156** ; un gratin fait 180, des lasagnes 150. **Un seul des six nombres (142) tombe dans cette bande.** L'écart visée↔ancrée vaut **1,29× à 1,34×** sur les six cases, pas seulement sur les grosses cibles : la réparation du lot B ne déplace pas ce rapport, parce qu'il vaut `(Gmax/Gpréf)/1,10` et que ni `Gmax` ni `Gpréf` ne dépendent du vendredi. **L'espoir formulé dans la commande — « sur un dîner à 859 kcal avec Gpréf ≈ 475 g, elle vaut ~181, plausible » — est vérifié à 181, et 181 est au-dessus de la bande mesurée.** Détail au § 2.1. |
| Que devient la demande du chantier, alors ? | Les **deux nombres sont nommés** dans le brief au-delà de 15 % d'écart, et ils le sont sur les six cases. | C'est le dispositif d'A15, déjà en place (`anchorClause`, `ANCHOR_DIVERGENCE_RATIO = 1,15`). Ce que le chantier reproche est le mot « silencieusement » ; rien n'est substitué en silence. La consigne réparée de PERTE dit `123 to 250 at dinner (aim 135, not 181)`. |
| Où vit le contrat ? | Module neuf `supabase/functions/_shared/keel/slot_nutrition_contract.ts`. `requiredDensityFor` **y déménage** et gagne un paramètre **requis** : `rhythmSlots`. | Le constructeur appelle `plateBoundsFor`, `densityCorridorFor`, `dayTargetFor`, `relaxDayForCorridors` (toutes dans `portion_sizing.ts`) : le mettre dans `portion_sizing.ts` aurait marché, mais le plan demande un module neuf, et l'inverse — le contrat importé PAR `portion_sizing` — serait circulaire. `requiredDensityFor` n'était appelée que par le handler et deux scripts. |
| `rhythmSlots` optionnel, avec repli sur la grille ? | **Non, requis.** | C'est exactement le défaut : un défaut à « la grille » aurait laissé le bug en place sous un autre nom. `optional-gate-params-are-disarmed-gates`, et cette fois la garde EST le lot. |
| Que vaut « rien de déclaré » ? | Les **trois repas de la maison** (`HOUSE_DEFAULT_SLOTS`), jamais la grille, jamais les sept jetons pesés. | Ce n'est pas une invention : `dayCoverageOf` et `anchorFactorFor` appliquent déjà ce repli, et le pavé d'`anchorFactorFor` décrit mot pour mot le défaut qu'on répare — « sans ce repli, une bouche qui n'a rien déclaré et dont le plan ne compose QUE le dîner voit sa journée entière ramenée sur ce seul dîner : on demande 3 900 kcal à une assiette ». La règle est désormais écrite **une fois** (`wholeDaySlots`). |
| Un **vrai** rythme à un seul repas garde-t-il sa journée ? | **Oui**, et c'est la moitié qui distingue les deux cas. | `rhythmSlots: ["dinner"]` ⇒ le dîner porte 2 454 kcal, le couloir sort `above_askable_cap` à juste titre, et `capped` compte 1. Sans cette moitié, le lot B sous-nourrirait quelqu'un qui a déclaré ne manger que le soir. |
| Deux dîners de dates différentes, couloirs disjoints : une ligne ou deux ? | **Deux lignes, datées.** `empty_intersection` cesse d'être un jeton porté par une ligne unique rabattue sur son plancher ; il compte les moments qu'on a dû **séparer**. | « Ne pas fusionner tous les dîners par leur valeur maximale ; une consigne commune n'est possible que si les contrats sont effectivement compatibles et **les cases concernées restent identifiables** ». L'ancienne sortie donnait au modèle un POINT (`min === max`) pour DEUX jours, sans lui dire lequel demandait quoi. Le commentaire d'origine du compteur annonçait déjà cette sortie : « s'il grimpe, la sortie est une recette SÉPARÉE ». |
| La compatibilité se lit-elle sur le jeton `incompatible` ? | **Non, sur les bornes.** `Math.max(min) > Math.min(max)`. | Mesuré en écrivant le module : `mergeCorridors` donne la priorité à `above_askable_cap`, donc un [250, 250] plafonné fondu avec un [100, 134] rendait « above_askable_cap » et **l'intersection vide disparaissait** — la grappe se formait quand même et les deux jours repartaient avec 250. |
| La redistribution (`relaxDayForCorridors`) porte-t-elle sur le rythme ou sur la fenêtre ? | **Sur la fenêtre seule** (les cases couvertes). | Déplacer vers un moment qu'on ne compose pas perd l'énergie ; en prendre à un moment déjà mangé est très exactement le transfert interdit. La somme conservée est donc `coveredBudgetKcal`. Et la cible relâchée atteint désormais **aussi le dimensionnement** — avant ce lot elle ne déplaçait que le couloir, jamais l'assiette. |
| Le modèle compose une case hors grille : rebaser la journée ? | **Non.** Le contrat capturé fait autorité ; la case orpheline est dimensionnée par la **même** règle de rythme et **comptée** (`contract_missing`). | « Le contrat capturé avant le modèle est égal à celui consommé par le dimensionnement et le verdict » est un test de sortie : un rebasement le rendrait faux sur toute journée où le modèle déborde. Le compteur doit rester à zéro ; au-dessus, c'est le prompt qu'il faut resserrer. Le compteur mort `rebuilt_days` a été retiré plutôt que laissé à zéro pour toujours. |
| `cellDensityOf` (plat partagé) prend-il un jour ? | **Oui, paramètre requis.** | Depuis ce lot un moment peut porter deux couloirs. `e.slots.find(d => d.slot === slot)` rendait « le premier dîner trouvé », c'est-à-dire servait au dimanche la bande du vendredi — le défaut du lot B reproduit par son propre lecteur. |
| L'instrument du lot 0 : l'adapter ou le laisser prouver l'ancien monde ? | **Les deux.** Il reconstruit maintenant **deux** contrats : le **réparé** (rythme déclaré) et **l'archive** (grille prise pour rythme, jour par jour). | L'égalité caractère pour caractère avec le prompt archivé est la seule épreuve qui prouve que les entrées figées sont les bonnes ; la jeter parce que le moteur est réparé reviendrait à jeter l'instrument avec le défaut. Aucune équation n'est recodée : `slotContractsFor` est appelée deux fois, avec deux rythmes. |
| `pot_demand.ts` portait le même oubli de repli : le corriger ? | **Oui**, aux deux sites. | `[...mouth.declaredSlots, ...daySlots]` sans repli : une bouche qui n'a rien déclaré et dont la table ne sert qu'un moment ce jour-là voyait sa journée entière ramenée sur ce moment. Même défaut, autre chemin. Aucun test du dépôt n'a bougé. |
| Le `wholeSlots` legacy de l'estimation des bacs (`index.ts`, `tubServed`) ? | **Non touché**, et nommé au § 7. | C'est une estimation `common_pot_day` explicitement legacy, hors de la grille de tests du lot, et la toucher déplacerait des compteurs `unmetDemand` que ce lot ne mesure pas. |

---

## 2. Ce qui est fait et prouvé

### 2.1 A15 : les nombres de l'arbitrage

```
deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-B-apres.ts
```

| plan | moment | E à composer | Gpréf | visée retenue (`Dmin × 1,10`) | visée ancrée (`100 × E / Gpréf`) | rapport |
|---|---|---|---|---|---|---|
| PERTE | breakfast | 613,50 | 432 | **110** | 142 | 1,29× |
| PERTE | lunch | 981,60 | 475 | **154** | 207 | 1,34× |
| PERTE | dinner | 858,90 | 475 | **135** | **181** | 1,34× |
| GAIN | breakfast | 728,00 | 475 | **114** | 153 | 1,34× |
| GAIN | lunch | 1 164,80 | 475 | **183** | 245 | 1,34× |
| GAIN | dinner | 1 019,20 | 475 | **160** | **215** | 1,34× |

Bande des plats réels mesurés par ce dépôt : **113–156** (gratin 180, lasagnes 150),
`docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md:573`. **Cinq des six visées ancrées sont
au-dessus de cette bande**, deux au-dessus même du gratin. Le précédent mesuré est **389
demandés au dîner, 126,7 rendus** — consigne ignorée.

> ⛔ **A15 n'est pas levé, et la réparation du lot B n'y change rien par construction.**
> L'écart vaut `(Gmax / Gpréf) / 1,10`, soit ~1,34 dès que la table ne mord pas. Il ne
> dépendait pas du vendredi ; il ne dépend donc pas de sa réparation. Ce que le lot B a
> changé, c'est **quel couloir part au modèle**, pas la formule de la visée.
>
> ⚠️ **Ce que cet arbitrage ne prouve pas :** que 135 soit la bonne visée. Il prouve que
> 181 est hors de la seule bande que ce dépôt ait mesurée. Trancher entre 135 et 181
> demanderait des tirs réels à consigne changée — c'est le lot F, et ce n'est pas fait.

### 2.2 Le vendredi soir garde sa part de dîner

```
deno test --allow-read --allow-env supabase/functions/_shared/keel/slot_nutrition_contract_test.ts
deno run --allow-read scripts/2026-09-11-mesure-grille.ts scratchpad/…/fixtures
```

Fonctions de production, profils figés de la campagne :

| case | avant (envoyé au modèle) | après (contrat) | à composer |
|---|---|---|---|
| `PERTE / 2026-09-11 / dinner` | **2 454,00** | **858,90** | 2 454 × 0,35 / (0,25 + 0,40 + 0,35) |
| `GAIN / 2026-09-11 / dinner` | **2 912,00** | **1 019,20** | 2 912 × 0,35 |

Le facteur **2,86** disparaît. Le rythme retenu est `["breakfast","lunch","dinner"]` — le
repli des trois repas, la bouche n'ayant rien déclaré (`eating_rhythm: null` dans la
fixture).

### 2.3 Ajouter ou retirer le vendredi partiel ne déplace aucun contrat du week-end

**Écrit rouge d'abord, montré rouge, puis réparé.** La sonde d'avant est figée :
[`sonde-lot-B-avant-2026-09-11.txt`](sonde-lot-B-avant-2026-09-11.txt).

```
⛔ 1 couloir(s) de samedi/dimanche DÉPLACÉ(S) par le vendredi :
   dinner: [250–250] visée 250 above_askable_cap  ≠  [123–250] visée 135 —
```

Après : [`sonde-lot-B-apres-2026-09-11.txt`](sonde-lot-B-apres-2026-09-11.txt).

```
✅ retirer le vendredi ne déplace AUCUN couloir de samedi/dimanche
```

Épinglé à trois endroits, chacun avec **le cas qui mord gardé** (l'ancienne arithmétique,
appelée par la même fonction avec la grille pour rythme, déplace toujours le week-end) :
`slot_nutrition_contract_test.ts` § ⑦, `scripts/2026-09-11-mesure-grille_test.ts`
« ⛔ LOT B — retirer le vendredi partiel ne déplace AUCUN dîner du week-end ».

### 2.4 Le contrat capturé = le contrat consommé

- **Module** : `slot_nutrition_contract_test.ts` « le couloir du prompt est celui que le
  dimensionnement calculerait » — sur les 7 cases, `densityCorridorFor(composeKcal,
  plateBoundsFor(...))` rend exactement le couloir du contrat **et** exactement la ligne
  que `requiredDensityFromContracts` transmet. La prémisse est épinglée (`verifies === 7`) :
  une boucle vide passerait toutes les assertions.
- **Câblage** : `portion_sizing_wiring_test.ts` ㉓/㉔/㉕ — le contrat est construit **avant**
  `householdPromptInput` ; les **deux** sites de dimensionnement (`measureDish` à une
  bouche, `atDish` à N ≥ 2) lisent `contractAt` et prennent `contract.composeKcal` et
  `contract.bounds` ; les deux replis passent par `wholeDaySlots` ; les deux anciennes
  écritures `declaredSlots.length > 0 ? … : composedSlots` ont **disparu** (comptées à 0).
- **Instrument** : le rapport imprime désormais `✅ UNE SEULE CIBLE PAR CASE` après avoir
  comparé, case par case, la colonne « cible(dim.) » et la colonne « cible(prompt) ». Il ne
  l'affirme pas, il le compare — et il listerait les cases divergentes s'il y en avait.

### 2.5 Conservation des budgets avant arrondi

`slot_nutrition_contract_test.ts` § ③ : sur une journée complète,
`Σ composeKcal = 2 454` à `1e-9` près, et chaque case est exacte (613,5 · 981,6 · 858,9).
Aucun arrondi intermédiaire. Sur une fenêtre partielle, `coveredBudgetKcal` vaut la somme
des cases **couvertes** (858,90 le vendredi, 1 472,40 sur un déjeuner mangé dehors) et
jamais la journée : « pas de journée complète facturée à un seul repas restant ».

### 2.6 La grille sort enfin avec ses clés — défaut **B3** du lot 0

`keel.household_meal.portion_sizing` porte `density.by_case` : `jour|moment` → le plancher
de densité le plus exigeant, toutes bouches confondues. **Aucun `member_id`, aucune kcal** —
précédent `residualGaps`. Sous plancher TCA, la clé sort avec `null` : la case a été
demandée, son exigence ne se dit pas. Le lot 0 avait dû **dériver de l'heure locale** les
deux cases retirées, faute de grille persistée.

### 2.7 Les contrôles du dépôt

| commande | résultat |
|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **6 592 passed · 3 failed** (avant : 6 569 · 3) — **+23 tests, mêmes 3 rouges** |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | **Check** (exit 0) |
| `deno check supabase/functions/meal-energy-v1/index.ts` | **Check** (exit 0) |
| `deno run --allow-read scripts/2026-09-11-mesure-grille.ts …/fixtures` | exit 0 — sortie au § 3 |
| `deno test --allow-read scripts/2026-09-11-mesure-grille_test.ts` | **20 passed · 0 failed** (avant : 19 · 0) |
| `cd frontend && npx tsc -b --force` | exit **0** |
| `cd frontend && npx vitest --config vitest.config.ts run` | **2 failed · 2 533 passed · 20 skipped (161 fichiers)** |
| `cd frontend && npm run build` | ✓ built, 2 pages prérendues |

Les 3 rouges Deno sont **les trois du socle**, aux mêmes lignes : `cooking_style_brief_test.ts:70`,
`household_freeze_test.ts:286`, `household_merge_quota_test.ts:190`. Les 2 rouges front sont
`mouthProfileReaders.int.test.ts:154` ×2 (nommés par le socle). **Aucun fichier front n'est
touché par ce lot.**

---

## 3. Chaque nombre qui bouge dans l'instrument, et pourquoi

Diff complet : [`mesure-lot-A-2026-09-11.txt`](mesure-lot-A-2026-09-11.txt) (avant) →
[`mesure-lot-B-2026-09-11.txt`](mesure-lot-B-2026-09-11.txt) (après).

**Un seul verdict bouge dans tout le rapport**, et c'est celui-ci :

| ligne | avant | après | pourquoi |
|---|---|---|---|
| « NON MESURABLE » | 14 | **8** | Les **6 dîners** dont le couloir transmis était déclaré impossible (`above_askable_cap`) reçoivent maintenant le couloir de leur propre date, qui est tenable. Ce sont exactement les 6 lignes `⚪ … couloir transmis IMPOSSIBLE` qui disparaissent. |
| contrôle 1, colonne « cible(prompt) » | 2 454,00 / 2 912,00 le vendredi | **858,90 / 1 019,20** | Le prompt et le dimensionnement lisent le même contrat. La colonne **« archive »** est ajoutée et garde les deux anciens nombres. |
| contrôle 6, « couloir TRANSMIS » sur les 6 dîners | [250–250] `above_askable_cap` | **[123–250] aim 135** (PERTE) · **[146–250] aim 160** (GAIN) | Plus de repliement par nom de moment sans clé de date. La colonne **« couloir ARCHIVE »** est ajoutée et garde les [250–250]. |

Ce qui **ne bouge pas**, et qu'il faut lire :

- **« PROUVÉ » reste à 9, « ÉCHOUE » reste à 70.** Aucune portion n'est devenue conforme,
  aucune n'a cessé de l'être.
- Les deux dimanches valent toujours **2 455,69** et **2 916,14** kcal, aux mêmes écarts.
- Les 11 énergies mesurées, les 8 alertes d'achats, les 64 lignes de prose périmée, les
  deux journées sous le plancher protéique : **identiques au caractère**.
- La **consigne refaite** est toujours présente **caractère pour caractère** dans le prompt
  archivé — l'instrument reconstruit l'archive par la fonction de production, avec la
  grille pour rythme.

> ⛔ **ET LE PIÈGE, NOMMÉ ET BRANCHÉ.** Les 6 dîners « rentrent » dans leur couloir **sans
> qu'un seul gramme ait bougé** : c'est le couloir qui s'est élargi, pas le plat qui a
> changé. Un rapport qui se contenterait d'imprimer `✅ dans le couloir` serait devenu plus
> optimiste sans que le moteur soit meilleur — exactement ce que le lot 0 existe pour
> empêcher. L'instrument imprime donc, et un test l'épingle :
>
> ```
> ⛔ 3 PORTION(S) « dans le couloir » MAIS À PLUS DE 50 % DE LA VISÉE.
>    Ces plats ont été composés sous la consigne du 2026-09-11 (250 au dîner).
>    Un couloir élargi après coup ne prouve RIEN sur l'obéissance future :
>    2026-09-11 dinner : 241 servis pour une visée de 135 (×1.79)
>    2026-09-12 dinner : 244 servis pour une visée de 135 (×1.81)
>    2026-09-13 dinner : 241 servis pour une visée de 135 (×1.78)
> ```

---

## 4. Ce qui est fait mais non prouvé

- **Aucun effet de prompt n'est mesuré, et aucun n'est revendiqué.** La consigne change
  (`250 at dinner — its share does not fit the plate` → `123 to 250 at dinner (aim 135, not
  181)`), et ce lot ne peut pas savoir ce que le modèle en fera. Les 241/244/247/228 servis
  décrivent l'ANCIENNE consigne.
- **La redistribution qui atteint le dimensionnement n'a pas de cas réel.** Sur les deux
  fixtures elle ne se déclenche pas (`relaxed_days: 0`). Le chemin est branché, typecheck,
  et éprouvé sur décor ; il n'a pas de mesure à lui.
- **Le chemin N ≥ 2 n'a pas de fixture.** Les deux plans de la campagne sont des solos.
  Le site `atDish` est typecheck, épinglé par un test de câblage, et lit le même contrat —
  mais aucun plan de foyer n'est passé dedans depuis ce lot.
- **Les lignes séparées par date n'ont jamais atteint un vrai prompt.** `at dinner on
  fri/sat` est éprouvé sur décor (`redistribution_test.ts`, `lot8_densite_test.ts`) ; aucune
  fixture ne produit ce cas.

## 5. Ce que je n'ai pas fait

- **Les lots C, D, E ne sont pas touchés** : ni la synchronisation des quantités affichées
  (C), ni les rôles culinaires de l'ajusteur (D), ni `final_plan_gate` ni les courses (E).
  Les défauts vus en passant sont au § 7.
- **Aucune migration, aucun déploiement, aucune écriture en base.** Le journal gagne deux
  champs (`density.by_case`, `contract_missing`) : ce sont des `console.log`, pas des
  colonnes.
- **`index.ts::tubServed`** (estimation `common_pot_day`, chemin legacy) garde
  `wholeSlots: [...mouth.declaredSlots, ...daySlots]` **sans repli**. Nommé au § 7.
- **Le rapport de campagne et `docs/keel/mesure.md` ne sont pas mis à jour** : le plan les
  confie au rapport final du chantier (critère de fin), pas à un lot intermédiaire.

---

## 6. Les tests de sortie du lot, un par un

| test de sortie du plan | verdict | preuve |
|---|---|---|
| Vendredi soir garde sa part : ≈ 859 PERTE, 1 019 GAIN, fonctions de production et profils figés | ✅ | `slot_nutrition_contract_test.ts` ① (858,90 et 1 019,20) + instrument, colonne « cible(dim.) » |
| Ajouter/retirer le vendredi partiel ne modifie aucun contrat samedi/dimanche | ✅ | sonde avant/après + `slot_nutrition_contract_test.ts` ⑦ + `mesure-grille_test.ts`. **Écrit rouge d'abord**, sortie figée. |
| Horaire du matin / de l'après-midi | ✅ | `slot_nutrition_contract_test.ts` ② : le dîner vaut 858,90 dans les deux cas ; seul `coveredBudgetKcal` change (2 454 → 858,90) |
| Fuseau | ⚠️ **partiel** | Le module ne calcule aucun fuseau : la date locale lui est **donnée** (`ContractDay.date`, de `windowDates`). Le test épingle que deux dates ne se confondent jamais. La dérivation fuseau→date reste celle de `meal_plan_window.ts`, non retestée ici. |
| Journée complète | ✅ | `slot_nutrition_contract_test.ts` ③ : Σ = 2 454 à 1e-9 |
| Un vrai rythme à un seul repas | ✅ | `slot_nutrition_contract_test.ts` ① : 2 454 sur le dîner, `neededMin = 351`, `above_askable_cap`, `capped: 1` |
| Repas extérieur | ✅ | `slot_nutrition_contract_test.ts` ① : petit-déj 613,50 et dîner 858,90, budget couvert 1 472,40 ; le déjeuner sorti ne transfère rien |
| Case fixe | ✅ | `slot_nutrition_contract_test.ts` ④ : retrait unique (613,50 − 300 = 313,50), aucune double soustraction, et une case entièrement couverte sort `fixed_covered` avec `composeKcal: 0` et **aucun couloir** |
| Repas léger | ✅ | `slot_nutrition_contract_test.ts` ⑤ : dîner léger 2 454 × 0,20/0,85, plancher de densité 0,6, et la journée reste entière |
| Petits et grands appétits | ✅ (**avec une correction de prémisse**) | `slot_nutrition_contract_test.ts` ⑤ : sur un corps **mesuré**, l'appétit ne déplace pas la cible de journée (2 454 dans les trois cas) — il entre dans l'entretien **estimé** seulement. Il déplace la **bande de masse** (630 vs 700) donc le **couloir** (137 vs 123). Mon premier test affirmait l'inverse ; il a été corrigé sur mesure, pas contourné. |
| Deux personnes aux objectifs différents | ✅ | `slot_nutrition_contract_test.ts` ⑥ : 858,90 vs 1 019,20, couloirs [123–250] vs [146–250], clés disjointes, et `mergeSlotContractSets` **refuse** de recoller deux bouches |
| Le contrat capturé avant le modèle = celui consommé par le dimensionnement et le verdict | ✅ | `slot_nutrition_contract_test.ts` ⑦ + câblage ㉓/㉔ + l'instrument qui **compare** au lieu d'affirmer |
| Conservation des budgets avant arrondi | ✅ | § 2.5 |
| Pas de journée complète facturée à un seul repas restant | ✅ | § 2.5 ; `coveredBudgetKcal < dayTargetKcal` épinglé |
| Plat partagé : contrôler tous ses consommateurs | ⚠️ **partiel** | `cellDensityOf` prend maintenant le **jour** de la case et refuse de servir la bande d'une autre date (`first_draft_contract_test.ts`). L'intersection vide entre **mangeurs** reste conservée et nommée, inchangée. Aucune fixture N ≥ 2 ne l'exerce. |
| Toute redistribution reste dans la même personne/journée et met à jour le contrat partout | ✅ | `slot_nutrition_contract_test.ts` ⑧ : somme conservée sur les cases **couvertes**, Σ`redistributedKcal` = 0, et le conflit non résolu garde son `incompatible` avec son motif de refus |
| Chaque test a un cas qui mord et un cas qui passe | ✅ | 18 épreuves dans le fichier du lot, chacune porte les deux ; les tests réécrits gardent l'ancien comportement comme cas qui mord |

---

## 7. Fichiers créés ou modifiés

### Moteur — `supabase/functions/_shared/keel/`

| fichier | ce qui change |
|---|---|
| `slot_nutrition_contract.ts` | **créé.** `SlotNutritionContract`, `ContractDay`, `SlotContractSet`, `slotContractsFor`, `contractKey`, `rhythmOfDay`, `mergeSlotContractSets`, `requiredDensityFromContracts`, et `requiredDensityFor` (déménagée, `rhythmSlots` requis). |
| `portion_sizing.ts` | `requiredDensityFor` **retirée** (un pavé dit où elle est et pourquoi). `SlotDensity` += `days` (requis). `mergeCorridors` et `slotOrderOf` exportées. |
| `mouth_anchor.ts` | `HOUSE_DEFAULT_SLOTS` exportée. `wholeDaySlots` **créée** — la règle du rythme, écrite une fois. Les deux sites d'`anchorFactorFor` la lisent. |
| `household_portions.ts` | `densityFragment` date une ligne quand son moment en porte plusieurs (`at dinner on fri/sat`) ; un moment à une seule bande ne se date pas. `cellDensityOf` prend le **jour** de la case, requis. |
| `household_prompt_v34.ts` | `calendarBlock` passe `c.day` à `cellDensityOf`. |
| `pot_demand.ts` | les deux `wholeSlots` passent par `wholeDaySlots` : le repli des trois repas manquait. |

### Handler

| fichier | ce qui change |
|---|---|
| `generate-household-meal-v1/index.ts` | Le contrat est construit **avant le prompt** (`slotContractsFor` par bouche), stocké par clé datée, et relu par `contractAt` aux **deux** sites de dimensionnement. `requiredDensityFromContracts` alimente les cartes. Journal : `density.by_case` (la grille avec ses clés, sans personne ni kcal) et `contract_missing` aux deux sites. |

### Tests

| fichier | ce qui change |
|---|---|
| `slot_nutrition_contract_test.ts` | **créé** — 18 épreuves, le banc du lot. |
| `portion_sizing_wiring_test.ts` | ㉓ ㉔ ㉕ **ajoutés** ; ㉑ suit le journal (`by_slot` + `by_case`). |
| `portion_sizing_test.ts` | « le MAX sur les jours » **réécrit** (son décor pinnait le défaut) ; « ce qu'on DEMANDE est plafonné » **réécrit** sur le cas légitime (rythme à un seul repas) ; `rhythmSlots` ajouté aux décors. |
| `lot8_densite_test.ts` | « deux jours SANS densité commune » **réécrit** : deux bandes datées au lieu d'une ligne rabattue. Les greps de câblage suivent le déménagement, avec une contre-épreuve d'adresse. |
| `lot8_allocation_test.ts`, `moteur_unique_contre_exemples_test.ts` | import re-pointé, `rhythmSlots` ajouté. |
| `redistribution_test.ts` | `days: []` au décor + un test des **lignes datées**. |
| `first_draft_contract_test.ts` | `cellDensityOf` prend le jour + un test « une case prend le couloir de sa date ». |
| `standard_recipe_prompt_test.ts` | `days` ajouté aux littéraux. |

### Instrument et preuves

| fichier | ce qui change |
|---|---|
| `scripts/2026-09-11-mesure-grille.ts` | `contratRepare` (nouveau) et `contratTransmis` (l'archive) ; `ContratCase` += `cibleCaseArchiveKcal`, `couloirArchive`, `couloirTransmis.jours` ; colonnes « archive » aux contrôles 1 et 6 ; l'égalité des deux cibles est **comparée**, pas affirmée ; avertissement « dans le couloir mais loin de la visée » ; `rendre` exportée pour être éprouvée. |
| `scripts/2026-09-11-mesure-grille_test.ts` | deux tests ④ réécrits avec leur motif, un test ajouté sur l'avertissement. **20 verts.** |
| `scratchpad/…/sonde-lot-B-avant.ts` + `.txt` | **créés** — l'état avant, montré rouge. |
| `scratchpad/…/sonde-lot-B-apres.ts` + `.txt` | **créés** — l'état après, et les nombres d'A15. |
| `scratchpad/…/mesure-lot-B-2026-09-11.txt` | **créé** — l'instrument après le lot. |
| `scratchpad/…/RAPPORT-LOT-B-2026-09-11.md` | ce fichier. |

⛔ **Non touchés, exprès** : `RAPPORT-MESURE-2026-09-11.md`, `mesure-2026-09-11.txt`,
`RAPPORT-LOT-A-2026-09-11.md`, `mesure-lot-A-2026-09-11.txt`, `fixtures/*` (dont
`empreintes.json`), `scratchpad/2026-09-11-REVUE-CAMPAGNE/*`, tout le front.

### Empreintes après le lot

À reporter dans `empreintes.json` **par le lot qui refera une mesure de référence** :

```
slot_nutrition_contract.ts   83d1d50212a9897ea08e4a93428aaf972d317f8713a36ea7b44d5a90f7964b88
portion_sizing.ts            1e8b2bf4fa16d23896fe4aeae985c4ab3fe19fcbf227e0ccb23a46876843e443
mouth_anchor.ts              40d354c72ffbeffa59feaea3cae947cc83457d1dbdcab70f53d1df37780b630d
household_portions.ts        2df2b94157b1ce089d26f1ac3771d703c50f0723e9a1da85b4c013de1b4d63ca
household_prompt_v34.ts      569ea436305dcf95f8dc9d17ad77be7dfac3ebaa7210cd05b2749c7d6b1761b0
pot_demand.ts                c176c5a59080145ae262e2fcdff3c82f5b8e912f0fd13160c55e62018a49a640
```

---

## 8. Commandes réservées à l'humain

**Aucune.** Pas de migration, pas de déploiement, pas de secret, pas d'écriture en base.

⚠️ **Avant tout run réel**, le runtime edge sert des `_shared` **périmés** : `portion_sizing.ts`,
`mouth_anchor.ts`, `household_portions.ts`, `household_prompt_v34.ts`, `pot_demand.ts` ont
été MODIFIÉS et `slot_nutrition_contract.ts` est NEUF. Il faut redémarrer `functions serve`
lui-même (`./scripts/local_serve_functions.sh`) — **jamais** `docker restart` tant que
`functions serve` tourne. C'est le terminal de l'humain.

---

## Pour les lots suivants — défauts vus en passant, avec fichier, ligne et preuve

### Lot C — la quantité finale

**C1 (inchangé).** **64 lignes sur 96** affichent une quantité qui n'est plus celle du
calcul, facteurs de ×0,385 à ×1,517. Le rapport de l'instrument les liste nominativement.

### Lot D — les composants culinaires

**D2 — NOUVEAU, et il vient de ce lot.** L'ajusteur de proportions reçoit ses couloirs de
`densityCorridorFor(m.slotTarget, m.bounds)` — donc **du contrat**, désormais — à
`generate-household-meal-v1/index.ts` (bloc `adjustment`, une bouche) et au bloc
`rows_by_dish` (N ≥ 2). Les six dîners des fixtures passent d'un couloir [250–250] à
[123–250] : **l'ajusteur a maintenant de la place pour alléger là où il n'en avait aucune.**
Le lot D doit mesurer ce que ça change sur `moves` et `rejected_would_degrade` avant
d'assouplir quoi que ce soit d'autre. Sur PERTE, 354 candidats étaient refusés pour
dégradation ; ce nombre va bouger.

**D3 — NOUVEAU.** La visée transmise à l'ajusteur est `preferredPer100G`, c'est-à-dire
`Dmin × 1,10` (arbitrage A15). Les dîners servis sont à **×1,78 à ×1,81 de cette visée**
(241 · 244 · 241 pour 135). L'ajusteur, lui, ne juge que l'appartenance au couloir
[123–250] : **il considérera ces plats comme conformes et ne les touchera pas.** Si le
chantier veut des dîners moins concentrés, la visée doit devenir une contrainte quelque
part — et ce n'est ni le lot B ni l'ajusteur aujourd'hui.

### Lot E — le contrôle du plan livrable

**E5 — NOUVEAU, et il est directement exploitable.** Le contrat porte, par clé
`memberId + date locale + slot` : `composeKcal`, `coveredBudgetKcal`, `bounds`, `corridor`,
`rhythmSlots`, `coveredSlots`, `status`. C'est exactement le tableau « par personne / date /
créneau » que le lot E demande, et il est **déjà construit avant le prompt** dans
`generate-household-meal-v1/index.ts` (`contractsByKey`, `contractSets`, lecture par
`contractAt`). Le `final_gate` reçoit toujours `energy: null` et `boxContract: null` ; il a
maintenant une source pour les remplir sans recalculer quoi que ce soit.

**E6 — NOUVEAU.** `coveredBudgetKcal` est la **bonne base** de la tolérance « ±5 % par
journée couverte » : une fenêtre partielle ne doit pas la journée entière. L'instrument
l'utilise déjà ; le moteur ne le fait nulle part.

**E1 / E2 / E3 (inchangés).** `ok=true` avec `blocking: 0` ; le plancher protéique n'est
comparé à rien (PERTE 2026-09-13 à **126,1 g** contre **176 g**) ; les 8 alertes d'achats
comparent des mots.

### Hors lots

**Z2 — NOUVEAU.** `generate-household-meal-v1/index.ts`, bloc `tubServed` (estimation
`common_pot_day` à N ≥ 2) appelle `slotPlanTargets` avec
`wholeSlots: [...mouth.declaredSlots, ...(daySlotsByKey.get(key) ?? [])]` — **sans le repli
des trois repas**. Une bouche qui n'a rien déclaré et dont les bacs ne couvrent qu'un moment
ce jour-là voit sa journée entière ramenée sur ce moment : `wanted` est alors la journée, et
`unmetDemand` compare un bac à une journée. C'est le défaut du lot B, sur le dernier
appelant de `slotPlanTargets` que ce lot n'a pas repris. Il est laissé parce que ce chemin
est explicitement legacy et que le toucher déplacerait des compteurs qu'aucune fixture de ce
chantier ne mesure. `grep -n "wholeSlots" supabase/functions/generate-household-meal-v1/index.ts`
en donne l'unique occurrence restante.

**Z3 — NOUVEAU.** `DENSITY_INCOMPATIBILITIES` porte toujours `"empty_intersection"`, et
**aucun `SlotDensity` ne peut plus le porter par le chemin du contrat** : les bandes
disjointes sortent séparées. Le jeton reste produit par `mergeCorridors` (appelée par le
regroupement) et lu par `densityFragment`, mais sa branche de rendu
(`these days need different recipes`) n'a plus de producteur. C'est le patron
`refusal-token-guard-reads-only-literals` à l'envers : un rendu sans cas. Le supprimer
demande de vérifier qu'aucun plan archivé ne le porte en base ; ce lot ne l'a pas fait.
