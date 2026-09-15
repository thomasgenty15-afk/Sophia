# Mesure des plans générés

Mesurer les quantités finales enregistrées et affichées, pour chaque personne, date et créneau. Les calories annoncées par le modèle ne constituent pas la mesure de référence. Une moyenne correcte ne doit jamais masquer une assiette incorrecte.

## La base de mesure — un seul instrument par rapport

> **Objectif de cette section : pouvoir distinguer un moteur amélioré d'un rapport simplement devenu plus optimiste.** Elle est écrite le 2026-09-11 à partir du comportement vérifié, pas d'une intention.

- **La portion finale se mesure par les items écrits dans sa boîte**, plus les prélèvements réels dans les préparations. Les fonctions du produit sont `boxNutrition` / `boxEnergies` (`mouth_energy.ts`), servies par `readEnergyBoxDishes` et `readPreparations` (`plan_energy_read.ts`).
- **La journée est la somme de ces mêmes portions.** Rien d'autre.
- **`planEnergy` ne remplace pas cette mesure.** Il lit `readDishes`, qui ne connaît que la part conventionnelle `uses.servings / servingsMade`. Mesuré sur les deux plans du 2026-09-11, même index, même payload :

  | dimanche | par parts conventionnelles (`planEnergy`) | par les items écrits (`boxNutrition`) |
  |---|---|---|
  | PERTE | 2 370 kcal | **2 455,69 kcal** |
  | GAIN | 3 075 kcal | **2 916,14 kcal** |

  Les deux nombres sont justes chacun pour leur question ; **mélanger les deux dans un même rapport a produit deux conclusions fausses** (« sous la bande », « au-dessus de la bande ») sur des assiettes à +0,07 % et +0,14 % de leur cible.
- **La mesure se fait hors ligne, sur des fixtures figées**, avec l'empreinte de leur référentiel. Une fixture porte le plan, le contexte, **l'heure et le fuseau de référence**, la grille des cases demandées, les prompts entiers et les réponses brutes. Sans l'heure locale, une journée partielle n'est pas rejouable.
- **Aucune préférence ne se déduit d'un prénom ni d'un titre de recette.** Tout ce qui entre dans un calcul vient d'une colonne nommée.

## Les cinq dénominateurs, publiés séparément

Un seul dénominateur pour cinq questions cache la marche où le plan tombe. Publier, dans cet ordre :

```text
cases attendues     déduites de la DEMANDE (grille × jours − moments déjà passés)
plats présents      un titre existe pour cette case
portions calculées  une boîte existe pour cette case
portions mesurables la boîte rend un nombre de kcal
portions conformes  ce nombre tient dans la tolérance annoncée
```

**Une portion absente ne sort pas du dénominateur attendu.** « Le plat existe » et « la portion est calculée » sont deux contrôles distincts : sur les deux plans du 2026-09-11, **14 cases attendues, 14 plats, 12 portions calculées, 11 mesurables**. Un rapport qui publie « 14 / 14 » dit une chose vraie et en laisse croire une fausse.

**Une journée à trou n'est pas « en écart », elle est non mesurable.** Sa somme manque une portion entière : publier un pourcentage ferait passer une mesure absente pour de la nourriture absente, et les deux appellent des corrections opposées.

## ⟳ 2026-09-13 — UNE SORTIE DE BANC SE MESURE, MAIS PAS DIRECTEMENT

`analyse-lot-F.ts` n'accepte pas une sortie de `banc-lot-F.ts` telle quelle : il
attend une **demande figée**. Le convertisseur existe, et c'est l'étape qu'on
oublie :

```bash
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-11-CLOTURE/figer-demande.ts \
  scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/<tir>.json
deno run --allow-read \
  scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
  scratchpad/2026-09-11-CLOTURE/fixtures/<tir>-c0.json
```

⛔ **LANCÉ SUR LA SORTIE BRUTE, L'INSTRUMENT REND `0 bouche(s)` ET UN
`TOTAL 0/0`.** Ce n'est pas « aucune conformité », c'est **aucune mesure** — et
« 0/0 » ne s'écrit ni « 0 case conforme » ni « mesuré ». Le fichier brut porte
`bouches` comme un NOMBRE ; la demande figée le porte comme la table des corps,
des objectifs et des crans, qui est ce que la mesure exige.

## Les quatre états d'une référence alimentaire

```text
① référence vérifiée          validationOf(ref) === 'verifie'      (ANSES, ou entrée curée)
② estimation de groupe        ref.source === 'group_bounds'        (le MILIEU d'une bande)
③ en attente de validation    validationOf(ref) === 'a_verifier'   (sas, modèle, exception nommée)
④ ingrédient non mesurable    terme non résolu, OU résolu sans grammes calculables
```

Les quatre couvrent toutes les lignes ; leur somme est le nombre de lignes d'ingrédient.

> ⛔ **Ne jamais appeler « 100 % vérifié » le taux de présence du champ `ref`.** Ce sont deux comptes sans rapport : `ref` est ce que le **modèle** a écrit, et le lecteur qui mesure (`plan_energy_read.ts::readIngredient`) **ne le transmet pas** — la mesure repart du terme en clair. Mesuré le 2026-09-11 : le plan GAIN porte `ref` sur **49 lignes sur 49**, et **deux de ses ingrédients ne sont pas mesurables**. Les deux compteurs se publient côte à côte, jamais l'un pour l'autre.

Trois compteurs de provenance s'ajoutent, sans retirer ces lignes des sommes : pesées **par convention** (condiments), pesées **par la prose**, et termes détournés par un **faux ami** nommé.

## Trois index, trois règles

| index | ce qu'il est | règle |
|---|---|---|
| **historique** | `loadCompositionIndex(db, {lang})` | le référentiel seul ; ce qu'un plan ancien sans `ref` lit |
| **génération** | le catalogue montré au modèle | filtré par `isComposable` — la porte de validation |
| **relecture** | `indexForReading({db, baseIndex, inputs})` | le référentiel **plus** ce que le sas sait des termes de CE plan |

`inputs` est une liste de `CompositionInput` bâtie par `readIngredients` sur les ingrédients des **plats ET des préparations**. Un appel mal formé lève `inputs is not iterable`, retombe sur l'index de base et **invente des trous que le run n'avait pas**.

Le branchement se prouve par son témoin : `meal-energy-v1` journalise `asked` / `kept` sous `keel.meal_energy.reading_index`. Un rejeu qui ne rend pas les mêmes nombres ne lit pas le même référentiel que le chemin testé.

> ⛔ **Ne pas relire avec l'index de génération.** La porte de validation vaut à la composition, pas à la mesure : relire un plan déjà servi avec elle effacerait la trace du défaut au lieu de la lire.

> ⚠️ **Le sas d'aujourd'hui n'est pas celui du run.** `grams_raw` est figé à la génération ; le référentiel et `food_composition_pending` ne le sont pas. Une relecture peut donc résoudre un terme que le run avait compté inconnu. La portion manquante, elle, reste manquante.

## Les couloirs de densité : une trace, jamais une regex sur le prompt

> ⛔ **Ne pas extraire les couloirs du texte du prompt.** L'unité n'est écrite qu'une fois, sur le premier créneau (`densityFragment`, `household_portions.ts`) : une lecture qui l'exige n'en voit qu'un sur trois, et fait conclure « aucun couloir envoyé » alors que le moteur en a envoyé trois.

Deux voies acceptables, et une seule interdite :

1. **Reconstruire le contrat hors ligne**, en appelant les **mêmes fonctions de production** sur les mêmes entrées figées : `requiredDensityFor` → `densityFragment`. La reconstruction se **prouve** en comparant la phrase obtenue, caractère pour caractère, à la ligne du prompt archivé (`llm_raw_response_events.user_message`). Si un seul champ d'entrée est faux — poids, âge, axes d'activité, position du coach, grille — les nombres changent.
2. **Lire une trace structurée émise par le moteur**, avec clé **personne / date / créneau**.

**Recoder les équations dans le banc est interdit.** Un banc qui recalcule mesure son propre instrument.

> ⚠️ **Aujourd'hui le moteur n'émet aucune clé de date.** `requiredDensityFor` replie ses couloirs par **nom de moment** (`best: Map<slot, …>`), tous jours confondus, et le journal `keel.household_meal.portion_sizing` n'en publie que `density.by_slot`. Le contrat par date se reconstruit donc en appelant la même fonction sur une grille d'**un seul jour**. L'écart entre les deux est exactement ce que le lot B doit ouvrir.

## Grille de contrôle

| Contrôle | Mesures à remonter |
|---|---|
| **1. Calories du créneau** | Cible, calories réellement mesurées, écart en kcal et en %, conformité selon la tolérance prévue. |
| **2. Grammage de l’assiette** | Minimum, préféré, maximum et grammes cuits réellement servis **par personne**. Un contenant collectif peut dépasser le maximum individuel. |
| **3. Ingrédients comptabilisés** | Nombre attendu, nombre résolu, ingrédients inconnus, ignorés ou arrondis à zéro. Distinguer référentiel vérifié et estimation. Une donnée manquante ne vaut jamais zéro kcal. |
| **4. Couverture du plan** | Cases demandées, présentes, manquantes et en doublon, par date et créneau. Vérifier les personnes présentes à chaque repas. Déduire les attentes de la demande, pas des plats produits. |
| **5. Cohérence de la journée** | Entrées personnelles effectivement utilisées, entretien, écart autorisé, cible et somme des budgets. Comparer ensuite au total servi sur le **périmètre couvert par le plan**. |
| **6. Densité calorique** | Dmin, Dpréférée et Dmax **réellement transmis au modèle**, densité mesurée du plat final et respect du couloir, en kcal/100 g cuits prêts à servir. Compter séparément les couloirs impossibles. |
| **7. Contraintes alimentaires et sécurité** | Allergies, exclusions et règles alimentaires respectées **après toutes les réparations**, y compris dans les préparations partagées. Tracer les violations et les contrôles absents. |
| **8. Protéines** | Cible interne applicable, quantité mesurée et écart restant par personne. Atteindre les kcal ne valide pas ce point automatiquement. |
| **9. Cohérence entre recette et stockage** | Les ingrédients, préparations, portions, boîtes et courses décrivent les mêmes quantités. Toute modification après mesure déclenche une nouvelle mesure ; le verdict porte sur le résultat enregistré. |
| **10. Réparations et livraison** | Défauts avant/après, nombre de réparations, appels fournisseur réels, durée, résultat livré ou refusé et défauts résiduels. Une réparation qui introduit un allergène est rejetée. |

## Règles d’interprétation

- Distinguer pour chaque contrôle **conforme**, **non conforme**, **non mesurable** et **non applicable**. Indiquer la raison des deux derniers états.
- Afficher les tolérances effectivement utilisées et leur source. Ne pas les élargir pour rendre un résultat conforme.
- Montrer chaque assiette en défaut avec son identifiant de personne, sa date et son créneau. Présenter le nombre de violations et le nombre de cas évaluables ; une médiane ne suffit pas.
- Une incompatibilité détectée ou un compteur renseigné ne constitue pas une correction. Conserver les défauts résiduels dans le verdict final.
- Les préférences alimentaires orientent la composition ; l’appétit oriente les portions selon les règles applicables. Ils ne doivent pas modifier silencieusement le besoin calorique quotidien.
- Vérifier qu’aucune réserve automatique pour pain, fromage ou dessert **hors plan** n’est encore déduite au déjeuner ou au dîner. Ces aliments restent autorisés dans les recettes. Les apports fixes explicitement prévus restent comptabilisés selon leur jour et créneau.
- Pour une génération partielle, distinguer la cible quotidienne du budget des créneaux couverts. Ne pas exiger du plan partiel qu’il fournisse toute la journée.
- Conserver les références permettant de reproduire la mesure : identifiant de requête, entrées résolues et leur provenance, budgets, consigne de densité envoyée, référentiel alimentaire utilisé et résultat final enregistré. Les informations personnelles de cette trace restent dans un contexte d’accès autorisé.
- Compter les plans non livrés et leur motif, y compris **HTTP 546**, même si son diagnostic est différé. Leur conformité nutritionnelle reste **non évaluée** ; l’échec de livraison demeure visible et ne disparaît pas du taux de livraison.
- **Nommer la source de chaque tolérance, et dire si elle est branchée.** Les critères en vigueur — ±10 % par repas, ±5 % par journée couverte — sont écrits dans `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md` § lot E. **Aucune garde du dépôt ne les applique aujourd'hui** : `final_plan_gate` reçoit `energy: null` et `boxContract: null`. Un verdict rendu contre eux est donc une mesure contre un critère **annoncé**, pas la reproduction d'une garde vivante, et le rapport doit le dire.
  ⟳ **2026-09-15 — la moitié de cette phrase est périmée.** Depuis le lot 2 (`64343422`), le chemin de génération passe à la garde l'énergie par bouche (`mouthEnergyTable`) : `mouth_energy` a quitté les contrôles incomplets et `mouth_energy_short` les non-exécutés sur les huit plans du 2026-09-15. Le plancher protéique et les bornes de case sont jugés par la garde du run (`protein_floor_short`, `cell_bounds_off`, tous deux en comptage). Ce qui reste vrai : l'**instrument** rejoue encore la garde avec `energy: null` — son état rejoué est partiel, et `generated_from.validation` fait foi.
- **Sur une fenêtre partielle, le plancher protéique se répartit.** La part couverte est celle des **cibles d'énergie** — `budget couvert / cible du jour` — et cette proportion est nommée dans le rapport. C'est le seul rapport que le dépôt porte ; l'employer sans le nommer reviendrait à inventer une allocation.
- **Un contrôle sans matière ne rend pas « conforme ».** Aucune allergie, exclusion ni régime n'est déclaré sur les fixtures de campagne : « zéro violation » y veut dire « on ne l'a pas essayé », et se publie sous cette forme.
- **Une prose de recette ne se relit pas par un matcher.** Pour savoir si une quantité affichée a suivi son nombre, comparer par **égalité de chaînes** la `quantity` persistée à celle de la **réponse brute archivée** : le nombre a bougé, le texte non ⇒ la prose est périmée. Aucun mot n'est interprété. `readQuantityFromProse` refuse exprès les chaînes composites, et ce refus n'est pas contourné.

## Résultat attendu du rapport

Un bilan de livraison par requête, puis les dix contrôles **avec leurs cinq dénominateurs**, et le détail de chaque anomalie **nommée** — personne, date, créneau. Séparer clairement ce qui est **prouvé**, ce qui **échoue** et ce qui **n’a pas pu être mesuré**, en trois listes distinctes. Aucun résultat ne doit être déclaré conforme sur la seule base des intentions du modèle ou de l’absence de compteur d’erreur.

L'instrument qui rend ce rapport est `scripts/2026-09-11-mesure-grille.ts` ; ses propres gardes sont dans `scripts/2026-09-11-mesure-grille_test.ts`. Il tourne avec `--allow-read` **et rien d'autre** : pas de réseau, pas d'écriture, pas d'appel modèle. Un instrument qui ne peut rien appeler ne peut rien fabriquer en cours de route.

---

## Ce que la campagne du lot F a mesuré — 2026-09-11, 20 h

Six tirs réels, séquentiels, par Kong et le vrai handler, **6 cases chacun** (le premier jour
tombe par `spent_first_day_dropped: fri (shopping_cutoff)` passée la coupure de courses du
soir), un compte de fixture par tir, aucune suppression. Preuves :
`scratchpad/2026-09-11-FIABILITE-RECETTES/RAPPORT-LOT-F-2026-09-11.md` et
`sorties-lot-F/campagne-tir*.json`.

| | résultat |
|---|---|
| plans écrits | **6 / 6** — `200`, `deliverable_with_gaps` partout |
| portions calculées | **35 / 36 parts** (le tir n° 2 perd `sun/dinner`) |
| calories par créneau, ±10 % | **35 / 35 mesurables conformes** |
| journées couvertes, ±5 % | **11 / 12 conformes**, la 12ᵉ non mesurable (une portion manque) |
| densité dans son couloir | **34 / 36** — les 2 écarts sont des petits-déjeuners **sous** le plancher (94 et 99 pour 100) |
| identités alimentaires | **238 / 239 lignes résolues par identifiant**, 0 estimation de groupe, 0 en attente |
| prose de recette périmée | **1 / 239**, et c'est un arrondi (« 2 pitas complets » pour 2,00) |
| plancher protéique | **7 journées sur 12 sous le plancher**, jusqu'à **−43 %** |
| durée | **104 · 107 · 134 · 175 · 206 · 207 s** — **3 sur 6 au-dessus du plafond de l'hébergé** |

⛔ **Six tirs ne font pas un taux.** Ils disent ce qui s'est passé six fois, un soir, sur une
pile locale, avec un catalogue et un modèle donnés.

### Les quatre règles que cette campagne ajoute

- **La consigne de densité réparée change ce que le modèle sert, et c'est mesuré.** Les dîners
  du matin étaient à **241 · 244 · 247 · 228** kcal/100 g sous un couloir `[250–250]` ; ceux du
  soir sont à **125 à 138** pour une visée de **135**, sous `[123–250]`. Un couloir élargi après
  coup ne prouverait rien ; **un plat recomposé sous le nouveau couloir, si.** Publier les deux
  colonnes — ce qui a été transmis, et ce qui a été servi.
- **Un compteur de refus n'est pas un refus.** La porte finale voit désormais
  `cell_without_portion` et `protein_floor_short` sur des runs réels — et le plan **part quand
  même**, parce que `FINAL_GATE_POLICY_LOT_1` les compte sans bloquer. Écrire « la garde a
  vu N défauts » et « la garde en a refusé N » sur deux lignes distinctes.
- **Un rejeu ne fige pas l'heure.** La même réponse archivée, renvoyée le soir, rend **422
  `mouth_unfed`** : la grille de 15 h avait 7 cases, celle de 19 h 42 en a 6. Toute fixture qui
  ne porte pas l'heure locale mesure une autre journée. Le dire avant de comparer.
- **Une durée ne se compare qu'à charge égale.** 104 à 207 s pour **la même charge** (6 cases,
  même heure, mêmes réglages) : la variance interne dépasse largement tout « gain » qu'on
  voudrait lire entre deux campagnes. Publier la durée absolue, la charge, et **le plafond
  réellement vérifié de la cible de déploiement** (150 000 ms en hébergé, quelle que soit la
  valeur de Kong en local).

---

## Rectification du 2026-09-11 23 h — l'instrument mentait sur trois lignes ci-dessus

> Détail, preuves et contre-épreuves : l'**addendum C0** de
> [la campagne des six tirs](CAMPAGNE-SIX-TIRS-2026-09-11.md#addendum-du-2026-09-11-23-h--rectification-de-mesure-étape-c0).
> Aucun tir n'a été rejoué. Les six réponses sont les mêmes ; le banc a changé.

| ligne du tableau ci-dessus | ce qu'elle disait | ce qu'elle dit après C0 |
|---|---|---|
| densité dans son couloir | **34 / 36**, 2 écarts | **41 / 42**, **0** écart, 1 case non mesurable |
| portions calculées | 35 / 36 parts | **41 / 42 parts** — le tir n° 6 en servait **12**, pas 6 |
| plancher protéique | 7 journées sur 12 | **7 journées sur 12 jugées**, **2 de plus non jugeables** (la 2ᵉ bouche du tir 6 n'a aucun objectif : il n'y a **rien à exiger**, ce n'est pas « zéro ») |

### Les quatre règles que cette rectification ajoute

- **Une grille d'attendus se fige AVANT la génération, ou elle ne mesure rien.** Construire les
  cases attendues à partir des plats rendus fait disparaître du contrôle exactement ce qu'on
  cherche : le plat manquant. Le banc REFUSE désormais de mesurer une sortie sans demande figée,
  et une case retirée à la main reste attendue — c'est un test, pas une intention.
- **Un couloir se mesure avec l'appétit de la personne, pas avec un appétit moyen.** Forcer
  `average` sur un `large` a fabriqué **deux violations qui n'existaient pas** (94 et 99 contre
  un plancher de 100 qui valait 91). La preuve qu'un contrat reconstruit est le bon n'est pas
  l'arithmétique : c'est son égalité **caractère pour caractère** avec le prompt archivé.
- **« N portions présentes » n'est pas « N portions conformes » tant que les N n'ont pas été
  mesurées.** Une portion appartient à une bouche : l'indexer par `jour/moment` seul fait que le
  contenant de la seconde écrase celui de la première, et six parts sortent en silence de tous
  les compteurs.
- **Conformité calorique, conformité complète et contrôles incomplets sont trois colonnes.**
  Sur le même plan : **7 / 7** cases calorifiquement conformes, **4 / 7** complètes, parce que
  trois dîners sortent de leur couloir de densité. Publier un seul de ces nombres sous le nom
  d'un autre est ce que la rectification ci-dessus répare.

---

## Ce que la campagne du 2026-09-12 a mesuré, et les quatre règles qu'elle ajoute

Six tirs réels, séquentiels, par Kong et le vrai handler, **9 cases** chacun (18 parts au tir 6),
un compte de fixture **neuf** par tir. Preuves et détail :
[CLOTURE-C6-2026-09-12.md](CLOTURE-C6-2026-09-12.md).

| | résultat |
|---|---|
| plans écrits | **4 / 6** — deux `422 plan_not_deliverable`, **0 ligne écrite** sur ces deux-là |
| cases demandées | **36** sur les plans livrés — et **45 PARTS**, le tir 6 portant 2 bouches |
| parts calculées / mesurables | **45 / 45** |
| calories par créneau, ±10 % | **45 parts sur 45** conformes |
| conformité COMPLÈTE | **41 parts sur 45** — les 4 écarts sont des densités **sous** leur plancher (1 à 6 points) |
| masses dans leurs bornes, **après arrondi** | **44 parts sur 45** — une à **631 g pour 630** |
| plancher protéique | **12 journées jugées sur 12 au-dessus** (au 2026-09-11 : 7 sur 12 en dessous, jusqu'à −43 %) |
| identités alimentaires au **premier jet** | **271 lignes, 0 identifiant absent, 0 refusé** |
| quantités comptées fractionnaires livrées | **0** — 211 lignes persistées, 3 « une pincée » conservées |
| achats manquants / sous-achetés sur les plans livrés | **0 / 0** (95 identités, 2 contrôles incomplets) |
| appels modèle de réparation | **0 à 1 par tir**, aucun troisième ; une 3ᵉ demande refusée et tracée |
| durées | **92 608 · 186 873 · 197 907 · 218 528 · 256 706 · 301 559 ms** — **1 sur 6** sous le plafond de l'hébergé |

⛔ **Six tirs ne font pas un taux**, et ces neuf cases ne se comparent pas aux six du 2026-09-11 :
charge différente, heure différente.

### Les quatre règles que cette campagne ajoute

- **Une étude de faux positifs se compte en RÉPONSES DE MODÈLE, pas en lancements.** Les onze
  sorties du transport contrôlé qui ont justifié l'armement de la porte finale rejouaient **deux**
  réponses : `n` valait 2, pas 11. Sur six réponses neuves, la même politique refuse **2 plans sur
  6**. Publier le nombre de réponses DISTINCTES à côté du nombre de runs.
- **Deux lecteurs du même fait doivent appliquer la MÊME condition, ou ils rendront deux verdicts
  opposés.** `rebuildShoppingQuantities` annonçait `needs_unbought: 0` au moment exact où
  `final_plan_audit` refusait le plan sur `ingredient_not_bought`, pour le même aliment, dans le
  même run. La cause était une condition de pont écrite deux fois, différemment. Quand un contrôle
  existe en double, recopier la condition **mot pour mot**, et l'épingler par un test qui compare
  les deux sorties.
- **Un `ref` n'est pas forcément une déclaration du modèle.** Depuis C3, le parseur écrit sur
  chaque ligne de courses l'identifiant qu'il a **résolu depuis le libellé**. Un lecteur qui traite
  « la ligne porte un `ref` » comme « le modèle a déclaré une identité » se trompe de source.
  Distinguer `identitySource: "ref"` de `"term"` avant d'en tirer une règle.
- **L'état de livraison rejoué par un instrument n'est pas celui du run.** L'instrument rappelle
  `finalGateDelivery` avec `energy: null` et `boxContract: null` : `cell_energy_off` et
  `protein_floor_short` lui sont invisibles. Mesuré : instrument **conforme**, moteur
  **deliverable_with_gaps**, base **livrable_avec_ecarts**, sur le même plan. L'état du run se lit
  dans le journal du tir et dans `generated_from.validation` — nulle part ailleurs.

## Ce que la fermeture des trois lots a mesuré — 2026-09-12, 19 h 51 → 19 h 57

Trois demandes réelles séquentielles (appels modèle **payants**), par Kong et le
`functions serve` local, après redémarrage du runtime. Rapport complet :
**[FERMETURE-TROIS-LOTS-2026-09-12.md](FERMETURE-TROIS-LOTS-2026-09-12.md)**.

| Demande | Bouches | Cases annoncées | Statut | Durée | Appels initiaux / réparation / auxiliaires | Portions conformes (kcal + masse + densité) | Identités d'achat |
|---|---:|---:|---:|---:|---|---|---:|
| n° 1 · apport fixe + repas léger | 1 | 6 | 200 | 110,9 s | 1 / 0 / 0 | **6/6** | 22 |
| n° 2 · deux bouches, allergie réelle | 2 | 6 (12 parts) | 200 | 112,0 s | 1 / 0 / 0 | **12/12** | 18 |
| n° 3 · plusieurs cuissons, stable + frais | 1 | 6 | 200 | 118,2 s | 1 / 0 / 0 | **6/6** | 20 |

**Total : 18 cases, 24 portions, 24/24 conformes.** Trois sur trois sous le
plafond hébergé de 150 s. Zéro alerte de courses sur la règle courante.

⛔ **ET CES TROIS DEMANDES NE MESURENT PAS LA RÉPARATION.** Aucune n'a produit de
défaut à réparer : `réparations 0/2 (demandées : 0)`. « Aucune réparation
nécessaire » est un résultat, pas une preuve que la réparation fonctionne — celle-ci
est au transport contrôlé, avec des réponses fabriquées, et elle est publiée
séparément.

### Le rejeu des six archives `lot3c` — 50 portions, pas 43

Les six sorties de la campagne du 2026-09-12, mesurées **une par une** :
8 + 7 + 7 + 7 + 7 + **14** = **50 portions, 50/50 conformes**, 0 alerte de
courses, une seule réparation de modèle (tir 2).

⛔ **Le rapport de cette campagne publiait 43.** C'est le nombre de CASES : le
foyer de deux en porte DEUX par case, et les deux sont mesurées séparément. Un
dénominateur qui compte les cases sous le nom des portions rend un taux flatteur
sur le seul cas qui compte — celui où deux personnes mangent la même cuisson.

### Deux leçons de mesure, ajoutées par ce chantier

- **Un banc qui sert un PLAN à une réparation qui attend un PATCH mesure un refus
  d'enveloppe, pas une réparation.** Depuis la fermeture du lot 1, les `unit_id`
  autorisés n'existent que dans la consigne que le handler vient d'écrire : une
  séquence de réponses écrite à l'avance ne peut pas les citer. Le banc lit donc
  la consigne envoyée et fabrique son patch dessus — comme le modèle.
- **Un plafond juste pour un plan est faux pour un patch.** `parseGeneratedMeal`
  applique un plafond de plats dérivé du rythme de la semaine. Donné huit unités
  d'un coup il en jetait deux, et c'étaient les unités réservées qu'on venait de
  demander. Une unité, une lecture — le plafond vaut alors « un plat ».

---

## Ce que la campagne du 2026-09-15 a mesuré — huit tirs, version `64343422`

Huit demandes réelles, séquentielles, par Kong et le `functions serve` local, **7 cases par
bouche** (le premier jour est partiel : dîner seul), 14 bouches en tout, un compte de fixture neuf
par tir. Rapport complet et anomalies nommées :
[CAMPAGNE-HUIT-TIRS-2026-09-15.md](CAMPAGNE-HUIT-TIRS-2026-09-15.md).

| | résultat |
|---|---|
| plans écrits | **8 / 8** — HTTP 200, 0 refus, 0 code 546 ni 502, 0 verrou laissé |
| cases attendues | **97 parts**, par personne, absences déduites (Nils : 6) |
| portions calculées / mesurables | **97 / 95** — 2 non mesurables par l'instrument (un terme non résolu à la relecture), mesurées par le moteur |
| calories par créneau, ±10 % | **95 / 95** mesurables conformes |
| conformité COMPLÈTE (kcal + masse + densité) | **95 / 95** mesurables |
| journées couvertes, ±5 % | **39 / 39** mesurables conformes, 2 non mesurables |
| plancher protéique couvert | **38 / 39** journées jugées au-dessus ; **1 en dessous** (tir 9, Paul, journée à 35 %, −5 %), et la garde du run dit la même chose |
| identités alimentaires | **331 lignes : 329 vérifiées, 0 estimation, 0 en attente, 2 non mesurables** |
| prose de recette périmée | **0 / 331** |
| allergies et régimes | 2 allergies déclarées (arachide), 2 régimes véganes ; **0 cause d'exclusion** dans la garde sur 8 plans ; 10 bouches sans matière |
| sans rattrapage modèle | **6 / 8** ; les deux tirs réparés n'ont fermé aucun de leurs écarts |
| appels modèle | **12** pour 8 tirs (6 × 1, 2 × 3) — enveloppe de 10 dépassée de 2 |
| durées | **95,5 · 95,7 · 95,9 · 118,0 · 120,9 · 125,1 · 168,6 · 271,9 s** — 6 sur 8 sous le plafond hébergé |

⛔ **Huit tirs ne font pas un taux.** Et ces 7 cases ne se comparent pas aux 6 du 11 ni aux 9 du 12 :
charge différente, heure différente.

### Les quatre règles que cette campagne ajoute

- **La demande figée nomme CHAQUE bouche posée, ou le bilan ment.** Le harnais ne figeait les cases
  attendues que du titulaire ; l'instrument rendait « Lea 0 / 0 » et un total 7 / 7 sur un plan de
  14 parts. La demande porte maintenant une grille par bouche, absences déduites, et le figeur
  **nomme** les bouches qu'il a dû compléter.
- **La base d'une complétion est la grille figée, jamais trois repas × trois jours.** Le roster
  donnait 9 cases à une bouche ajoutée là où la demande en attendait 7 (premier jour partiel) : deux
  cases fantômes par bouche, publiées comme « contrôles incomplets ». La grille de la demande vaut
  pour toute la maison ; ce qui distingue une bouche, c'est son rythme et ses absences.
- **Un redémarrage du runtime efface le journal du tir.** Relancer `functions serve` avec `>` a
  emporté les lignes `keel.*` de deux tirs ; l'instrument n'a plus de porte finale pour eux. Le
  journal d'un tir est une pièce : l'archiver dans l'artefact, par `request_id`, avant tout
  redémarrage.
- **Deux réparations peuvent ne rien rendre, et ça se compte.** Sur les deux tirs réparés, quatre
  appels ont été payés pour un −5 % de protéines sur une journée couverte à 35 % et une densité de
  petit-déjeuner, sans fermer ni l'un ni l'autre. La garde a vu juste deux fois ; le rendement de la
  réparation, lui, est de zéro sur deux — à publier à côté du taux sans rattrapage, jamais fondu
  dedans.

---

## Ce que la campagne des 30 tirs a mesuré — 2026-09-15, 13 h 26 → 14 h 26, version `62815cfe`

Trente demandes réelles, séquentielles, six profils × cinq, **7 cases par bouche**, un compte neuf
par tir, journal moteur archivé dans chaque artefact. Bilan complet, anomalies nommées et décisions
à prendre : [BILAN-CAMPAGNE-30-2026-09-15.md](BILAN-CAMPAGNE-30-2026-09-15.md).

| | résultat |
|---|---|
| plans écrits | **27 / 30** — 3 refus : un premier jet d'une journée sur trois, deux casseroles en unités comptables courtes de 11 et 25 g |
| sans rattrapage modèle | **26 / 30** |
| conformes | **14 / 30** ; 13 avec un écart nommé, dont **9 à moins de 4 % du seuil** |
| cases attendues | **380** (345 sur les plans livrés) : 345 plats, 345 boîtes, 0 manquante |
| calories par créneau, ±10 % | **339 / 344** mesurables |
| masse dans les bornes | **345 / 345** |
| plancher protéique couvert | **133 / 144** journées jugées ; les 11 manquées sont toutes sur Paul (N=4), de −0 % à −4 % |
| identités alimentaires | **2 294 / 2 296** vérifiées, 0 estimation, 0 prose périmée |
| allergies et régimes | 9 bouches avec matière ; 0 cause d'exclusion sur les plans livrés ; 1 violation de régime du premier jet **réparée** (tir 18) |
| appels modèle | **36** pour 30 tirs — 30 compositions, 3 réparations sur défaut bloquant, 3 remplissages |
| durées | médiane 107 s · p95 139 s · max 207 s ; 26 sur 27 sous le plafond hébergé |

### Les quatre règles que cette campagne ajoute

- **Un 422 de la garde est un résultat, pas une panne.** Le lanceur s'était arrêté au premier refus ;
  seuls un 5xx, un verrou laissé ou un dépassement d'échéance arrêtent une campagne. Un refus reste au
  dénominateur, avec sa cause.
- **Un écart à 1 % d'un seuil sans tolérance d'arrondi se compte à part.** 173,7 g pour un plancher de
  176, 133 kcal/100 g pour un couloir qui commence à 134 : publier ces écarts sous le même mot que
  −18 % masque la seule question qui compte — laquelle des deux familles on décide de fermer, et
  comment. Le bilan les sépare ; la garde, elle, ne le fait pas encore.
- **Une réparation du plan et un remplissage de deux secondes ne se comptent pas ensemble.**
  `final_repair` recompose ; `composition_fill` remplit une référence. Les deux sont des appels
  payés, un seul est un rattrapage. Les fondre gonflait le taux de rattrapage de 3 tirs.
- **Le rendement de la réparation se publie par nature de défaut.** Sur un défaut bloquant : 1 succès
  sur 2 (une violation de régime fermée en un appel). Sur un écart compté, hier : 0 sur 2. La
  politique qui réserve l'appel aux défauts bloquants a été décidée sur ce chiffre, et cette campagne
  l'a mesurée : 18 plans partis avec un écart nommé sans dépenser un appel.
