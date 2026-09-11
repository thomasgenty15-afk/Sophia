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
