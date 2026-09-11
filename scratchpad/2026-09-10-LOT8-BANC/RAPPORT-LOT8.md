# Le banc corrigé — re-mesure hors ligne de la campagne du 2026-09-10

Lot 8 de `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`. **Aucune génération nouvelle, aucun appel modèle** : les vingt runs archivés dans `../2026-09-10-CAMPAGNE-ELARGIE/runs.json` sont re-mesurés par les fonctions de production, sur l'index que chaque run avait réellement sous la main.

## ⓪ L'état des vingt générations

- **12** mesurées (HTTP 200)
- **8** `non testé` — `546 WORKER_LIMIT`, limite CPU de l'isolat local, hors périmètre (§ 10 du plan). ⛔ Ce n'est **pas** un échec produit.

## ① Ce que chaque génération a donné, requête par requête

| cas | gén | HTTP | état | requête | transmissions | couverture | grammes | sécurité | classes |
|---|---|---|---|---|---|---|---|---|---|
| S1 | 1 | 200 | mesure | `0321dae8` | 3 | 7/7 | 2/7 ⛔3↑0↓ | controle_absent(inconnu) | conf 1 · resi 2 |
| S1 | 2 | 200 | mesure | `46538780` | 2 | 7/7 | 3/7 ⛔2↑0↓ | controle_absent(inconnu) | conf 1 · resi 2 |
| S2 | 1 | 200 | mesure | `a4868507` | 2 | 10/10 | 6/10 ⛔2↑0↓ | controle_absent(inconnu) | resi 4 |
| S2 | 2 | 200 | mesure | `2f68ed68` | 3 | 10/10 | 4/10 ⛔2↑2↓ | controle_absent(inconnu) | conf 1 · resi 3 |
| S3 | 1 | 200 | mesure | `e35aa020` | 4 | 12/13 | 5/12 ⛔0↑1↓ | controle_absent(inconnu) | conf 1 · unme 2 |
| S3 | 2 | 200 | mesure | `bf7d39be` | 2 | 12/13 | 5/12 | controle_absent(inconnu) | resi 1 · unme 2 |
| S4 | 1 | 200 | mesure | `5c86208a` | 3 | 14/14 | 9/14 | controle_absent(inconnu) | resi 1 · unme 3 |
| S4 | 2 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |
| S5 | 1 | 200 | mesure | `baaa6354` | 2 | 18/18 | 6/18 ⛔3↑0↓ | controle_absent(inconnu) | unme 6 |
| S5 | 2 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |
| F1 | 1 | 200 | mesure | `ed11b1d4` | 2 | 16/16 | 4/4 | rien_a_controler(0) | conf 4 · unme 4 |
| F1 | 2 | 200 | mesure | `b4e93442` | 2 | 16/16 | 4/4 | rien_a_controler(0) | conf 4 · unme 4 |
| F2 | 1 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |
| F2 | 2 | 200 | mesure | `523a1ccf` | 2 | 16/16 | 8/8 | rien_a_controler(0) | conf 6 · resi 2 |
| F3 | 1 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |
| F3 | 2 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |
| F4 | 1 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |
| F4 | 2 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |
| F5 | 1 | 200 | mesure | `36f1f096` | 3 | 24/24 | 18/18 | rien_a_controler(0) | conf 8 |
| F5 | 2 | 546 | non_teste | `—` | inconnu | — | — | controle_absent(inconnu) | — |

## ② L'acceptation, **un axe à la fois**

⛔ `conformant` exige TOUTES les propriétés applicables. Une seule ligne « conforme » qui fondrait six questions rendrait invérifiable laquelle a cédé.

| axe | mesuré | base | |
|---|---|---|---|
| journée à ±5 % de la **cible couverte** | **63.4 %** | 41 jours-bouches dimensionnables | ⛔ |
| …dont assiette nominative | 34.8 % | 23 | |
| …dont service collectif (part interne) | 100.0 % | 18 | |
| masse dans les bornes du repas | **74/124** repas-bouches | 15 violations listées | ⛔ |
| couverture demandée livrée | **162/164** | 2 repas attendus absents | ⛔ |
| sécurité : ceinture d'**exclusion** | **0 zéro vérifié · 0 morsures · 4 rien à contrôler · 16 sans trace** | 20 générations | ⚠️ |
| sécurité : ceinture de **régime** | **0 zéro vérifié · 0 morsures · 4 rien à contrôler · 16 sans trace** | 20 générations | ⚠️ |
| protéine par personne | `inconnu` | — | ⚠️ non mesuré par ce banc |
| densité par recette | `inconnu` | — | ⚠️ non mesuré par ce banc |

**Les classes, sur les douze générations mesurées :**

- `conformant` : **26**
- `residual_gap` : **15**
- `unmeasurable` : **21**
- `sans_cible` : **0**

### Chaque violation de masse, avec son occurrence

⛔ « Une médiane de taux ne démontre pas que toutes les portions passent » (§ lot 8). Voici les lignes, pas un taux.

| cas | jour | moment | contenant | bouches | grammes | bornes | verdict | écart |
|---|---|---|---|---|---|---|---|---|
| S1·1 | fri | dinner | own | Evan Socle | 733 g | 250–700 g | over_max | 4.7 % |
| S1·1 | sat | lunch | own | Evan Socle | 780 g | 250–700 g | over_max | 11.4 % |
| S1·1 | sat | dinner | own | Evan Socle | 765 g | 250–700 g | over_max | 9.3 % |
| S1·2 | sat | lunch | own | Evan Socle | 720 g | 250–700 g | over_max | 2.9 % |
| S1·2 | sat | dinner | own | Evan Socle | 800 g | 250–700 g | over_max | 14.3 % |
| S2·1 | sat | dinner | own | Nora Deficit | 690 g | 250–671 g | over_max | 2.8 % |
| S2·1 | sun | dinner | own | Nora Deficit | 695 g | 250–671 g | over_max | 3.6 % |
| S2·2 | thu | dinner | own | Nora Deficit | 710 g | 250–671 g | over_max | 5.8 % |
| S2·2 | fri | lunch | own | Nora Deficit | 710 g | 250–700 g | over_max | 1.4 % |
| S2·2 | sat | breakfast | own | Nora Deficit | 100 g | 250–480 g | under_min | -60 % |
| S2·2 | sun | breakfast | own | Nora Deficit | 100 g | 250–480 g | under_min | -60 % |
| S3·1 | fri | breakfast | own | Ilan Surplus | 220 g | 250–700 g | under_min | -12 % |
| S5·1 | wed | dinner | own | Bruno Batch | 800 g | 250–700 g | over_max | 14.3 % |
| S5·1 | thu | lunch | own | Bruno Batch | 800 g | 250–700 g | over_max | 14.3 % |
| S5·1 | fri | dinner | own | Bruno Batch | 800 g | 250–700 g | over_max | 14.3 % |

### Chaque repas attendu absent

⛔ Un repas attendu qui manque est un **défaut de livraison**, pas une journée « non applicable ». La demande décide de l'attendu ; les deux seules soustractions admises sont le jour de cuisine seule et les moments d'aujourd'hui déjà passés (`slotsPassedToday`).

- `S3·1` — Ilan Surplus, thu 2026-09-10, **snack_am** : aucun plat, aucune cause nommée par le produit
- `S3·2` — Ilan Surplus, thu 2026-09-10, **snack_am** : aucun plat, aucune cause nommée par le produit

## ③ Le service collectif — la mesure interne que le couvercle ne porte pas

`mouth_energy.ts` refuse, exprès, de tirer une assiette d'un bac à plusieurs noms. Le banc ne divise donc pas le bac : il compare ce que le bac PORTE à la SOMME des cibles de ses mangeurs pour ce moment — la façon même dont `lidPlanFor` l'a construit.

- **15 bacs lisibles** sur 18
- écart absolu médian : **0 %**, maximum **0.3 %**

| cas | jour | moment | bouches | bac | somme des cibles | écart |
|---|---|---|---|---|---|---|
| F1·1 | thu | dinner | Nina, Claire, Hugo, Paul | 3240 kcal / 1489 g | 3239 kcal | 0 % |
| F1·1 | fri | lunch | Nina, Claire, Hugo, Paul | 3702 kcal / 2092 g | 3701 kcal | 0 % |
| F1·2 | thu | dinner | Nina, Claire, Hugo, Paul | 3238 kcal / 1896 g | 3239 kcal | 0 % |
| F1·2 | fri | breakfast | Nina, Claire, Hugo, Paul | 2312 kcal / 1631 g | 2313 kcal | -0.1 % |
| F1·2 | fri | lunch | Nina, Claire, Hugo, Paul | 3701 kcal / 2436 g | 3701 kcal | 0 % |
| F2·2 | thu | dinner | Tom, Lise, Sarah | 2602 kcal / 1431 g | 2605 kcal | -0.1 % |
| F2·2 | fri | breakfast | Tom, Lise, Sarah | 1860 kcal / 1144 g | 1861 kcal | 0 % |
| F2·2 | fri | lunch | Tom, Lise, Sarah | 2975 kcal / 1652 g | 2977 kcal | -0.1 % |
| F2·2 | fri | dinner | Tom, Lise, Sarah | 2605 kcal / 1159 g | 2605 kcal | 0 % |
| F5·1 | sun | breakfast | Jules, Georges | 1363 kcal / 1007 g | 1366 kcal | -0.3 % |
| F5·1 | sun | lunch | Jules, Georges | 2183 kcal / 993 g | 2186 kcal | -0.1 % |
| F5·1 | sun | dinner | Jules, Georges | 1914 kcal / 783 g | 1913 kcal | 0.1 % |
| F5·1 | mon | breakfast | Jules, Georges | 1368 kcal / 1072 g | 1366 kcal | 0.1 % |
| F5·1 | mon | lunch | Jules, Georges | 2186 kcal / 931 g | 2186 kcal | 0 % |
| F5·1 | mon | dinner | Jules, Georges | 1912 kcal / 831 g | 1913 kcal | 0 % |

## ④ L'index alimentaire de chaque run, restauré ou nommé irrécupérable

⛔ `21-mesure-avec-sas.py` ajoutait les 291 lignes du sas **d'aujourd'hui** à tous les runs. Un run de 12 h 00 ne peut pas avoir lu une ligne écrite à 13 h 13. Ici le sas est coupé à la FIN de chaque run, et il entre par `indexForReading` — la porte de production, avec ses deux ceintures.

| cas | gén | lignes de sas admises | demandées | retenues | part non restaurable | exact |
|---|---|---|---|---|---|---|
| S1 | 1 | 275/291 | 0 | 0 | 0.0 % | ✅ |
| S1 | 2 | 275/291 | 1 | 1 | 0.0 % | ✅ |
| S2 | 1 | 275/291 | 0 | 0 | 0.0 % | ✅ |
| S2 | 2 | 275/291 | 0 | 0 | 0.0 % | ✅ |
| S3 | 1 | 275/291 | 2 | 1 | 1.2 % | ⛔ |
| S3 | 2 | 275/291 | 3 | 0 | 1.4 % | ⛔ |
| S4 | 1 | 280/291 | 5 | 2 | 11.6 % | ⛔ |
| S5 | 1 | 284/291 | 4 | 0 | 9.5 % | ⛔ |
| F1 | 1 | 286/291 | 3 | 1 | 6.8 % | ⛔ |
| F1 | 2 | 287/291 | 1 | 0 | 9.3 % | ⛔ |
| F2 | 2 | 289/291 | 0 | 0 | 0.0 % | ✅ |
| F5 | 1 | 291/291 | 2 | 2 | 0.0 % | ✅ |

La part non restaurable est celle que `composition_fill` a comblée par les **bornes de groupe** : `filledFromPendingRow` refuse ces lignes-là, et leur valeur venait d'un calcul en vol sur l'index du moment. Les journées qu'elle touche sortent `unmeasurable`, jamais approchées.

## ⑤ Générations, tentatives, transmissions, pannes — quatre compteurs

- générations demandées : **20**
- tentatives HTTP applicatives : **29**
- transmissions fournisseur attribuées à une requête identifiée : **30** (sur 63 lignes `llm_usage_events` de la fenêtre)
- générations dont la requête n'est pas identifiable (tuées avant leur `draft_store`) : **8**
- erreurs de plateforme (`546`) : **8**

⚠️ Les transmissions ne sont plus lues « dans la fenêtre horaire » mais par `llm_usage_events.request_id`. Sur cette campagne séquentielle les deux coïncident run par run ; ce qui change est qu'on peut désormais le PROUVER.

## ⑤bis Le pliage des casseroles contre les grammes tirés

La journée solo est mesurée par `planEnergy`, qui attribue une casserole à un plat par `servings / servingsMade` ; la lane foyer, elle, lit les grammes que les boîtes TIRENT. `potAttributionGap` (fonction de production) compare les deux, plan par plan.

⚠️ **CE QUE CE RAPPORT NE DIT PAS.** Sur la lane foyer il se lit directement : 1,00 à 1,13, le pliage et les boîtes disent la même chose. Sur la lane SOLO il vaut 0,46 à 0,99, et ce n'est **pas** la preuve d'un sur-comptage : la plupart des plats solo n'ont pas de boîte du tout, donc le numérateur est amputé par construction. Le nombre est publié parce qu'il est mesuré ; il ne soutient aucune conclusion sur le solo.

| cas | gén | grammes tirés par les boîtes | grammes attribués par le pliage | rapport |
|---|---|---|---|---|
| S1 | 1 | 2810 g | 3251 g | **0.86** |
| S1 | 2 | 2630 g | 2667 g | **0.99** |
| S2 | 1 | 2990 g | 3730 g | **0.8** |
| S2 | 2 | 3970 g | 6203 g | **0.64** |
| S3 | 1 | 2050 g | 4486 g | **0.46** |
| S3 | 2 | 3040 g | 3545 g | **0.86** |
| S4 | 1 | 3560 g | 5196 g | **0.69** |
| S5 | 1 | 6240 g | 8706 g | **0.72** |
| F1 | 1 | 3998 g | 3839 g | **1.04** |
| F1 | 2 | 5846 g | 5154 g | **1.13** |
| F2 | 2 | 6414 g | 6415 g | **1** |
| F5 | 1 | 9393 g | 9397 g | **1** |

## ⑥ La famille « Banc » du tableau des tests minimaux (§ lot 8)

⛔ Un détecteur qui n'a jamais laissé passer un cas sain est indiscernable d'un détecteur cassé qui refuse tout. Chaque ligne nomme donc les DEUX côtés, sur les archives réelles.

| cas | attrapé par | il mord sur | il se tait sur | verdict |
|---|---|---|---|---|
| champ sécurité absent | `20-mesure.py::securite` — trois états | `S1·1` (16) | `F1·1` (4) | ✅ |
| ingrédient inconnu | `dishEnergy.complete` → `unmeasurable` | `S3·1` (6) | `S1·1` (6) | ✅ |
| source alimentaire estimée | `composition_energy_sources.group_bounds` | `S3·1` (6) | `S1·1` (6) | ✅ |
| repas attendu absent | `21-mesure.ts` ⑤ `couverture.manquants` | `S3·1` (2) | `S1·1` (10) | ✅ |
| boîte collective | `21-mesure.ts` ③ `bacs_communs` + part interne | `F1·1` (4) | `S1·1` (8) | ✅ |
| dépassement isolé masqué par médiane | `violations_grammes`, une ligne par occurrence | `S1·1` (6) | `S3·2` (6) | ✅ |
| index du run absent | `index.exact` + part non restaurable | `S3·1` (6) | `S1·1` (6) | ✅ |
| HTTP 546 classé non testé | `banc.classe_http` | `S4·2` (8) | `S1·1` (12) | ✅ |

### Ce que ce tableau ne dit PAS

- **« index du run absent » est DÉTECTÉ, pas RÉPARÉ.** Le banc sait dire quelle part de l'énergie venait des bornes de groupe et refuse de mesurer les journées concernées ; il ne sait pas reconstituer cette part. Une ligne `group_bounds` n'est pas relisible (`filledFromPendingRow` la refuse), et sa valeur dépendait de l'index du moment.
- **« champ sécurité absent » mord sur 16 générations, et c'est le produit qu'il faudrait changer, pas le banc.** Côté solo la ceinture ne journalise que si un terme est déclaré ; côté foyer, rien de la ceinture n'atteint `generated_from`. Tant que ça dure, un banc honnête ne peut rendre que `sans trace`.
- **Aucun de ces huit cas n'est un TEST au sens du § lot 8.** Ce sont des détecteurs vérifiés sur des archives réelles, avec un cas qui mord et un cas qui passe pour chacun. Un test qui échouerait si l'on réintroduisait le défaut reste à écrire ; il vit avec le reste de la famille « Banc », pas ici.

## ⑦ La reproductibilité de cette passe

⛔ TROIS SESSIONS ÉCRIVENT DANS CET ARBRE. `portion_sizing.ts` — d'où vient `plateBoundsFor` — a été modifié **pendant** la mesure. Le banc prend donc l'empreinte des mtimes de `_shared/keel` avant et après chaque fixture, comme `20-run.py` le fait pour une génération.

- `4619ed297f76` : 12 générations

Trois passes ont été lancées, sur **deux empreintes différentes** (`ed1e7cb3474d` et `4619ed297f76`). Les lignes de résultat sont **identiques** d'une passe à l'autre : l'édition en cours ne déplace aucun nombre de ce rapport.

