# Lot D — ajuster les proportions sans appel modèle · LIVRÉ

`proportion_adjust.ts` (1 382 lignes) + `proportion_adjust_test.ts` (968 lignes, **31 tests**).
Suite complète : **6 519 verts · 3 rouges** (les trois préexistants).

## Ce qui est prouvé — les cas réels de l'enquête

Le banc reproduit d'abord les densités de l'enquête (105,4 / 119,9 / 125,5 / 92,2), sinon il
mesurerait autre chose.

| Cas | Avant | Après | Minimum | Verdict |
|---|---:|---:|---:|---|
| PERTE poulet/quinoa + yaourt/citron | 105,4 | **123,1** | 123 | **fermé** |
| PERTE même casserole + feta/roquette | 119,9 | **146,1** | 141 | **fermé** |
| PERTE même casserole + tomate/pain | 125,5 | **145,9** | 141 | **fermé** |
| GAIN lentilles + pain/feta | 92,2 | 129,7 | 146 | **pas fermé, manque 16,3** |
| GAIN, même recette, **eau comptée comme absorbée** | 126,8 | **146,8** | 146 | **fermé** |

**PERTE : 70 déplacements, 339 g déplacés, 89 mesures, médiane 4,2 ms sur 20 tours.** À comparer
aux 65 à 114 s d'un rattrapage modèle qui, sur ce même cas, ne fermait pas le défaut
(105,4 → 118,4). Zéro portion dégradée ; 354 candidats refusés **parce qu'ils auraient dégradé
une portion déjà conforme**.

**Le « non » de GAIN a une cause nommée, et elle appartient au lot B** : 500 g d'eau sur
1 500 g de casserole comptent comme masse morte parce que les lentilles sont `legume_absorbs`
et non `grain_absorbs`. Avec la même recette, les mêmes bornes, le même ajusteur, mais l'eau
traitée comme absorbée, le cas se ferme en 14 déplacements. **L'écart n'était pas une limite de
l'ajustement, c'était une limite de la mesure.** Les deux runs sont des tests.

## Les arbitrages du lot D

| Question | Décision | Raison |
|---|---|---|
| Un déplacement doit-il conserver la masse, comme `densifyBoxes` ? | **Non — deux familles : apparié et unilatéral** | Une BOÎTE a un volume servi ; une RECETTE n'en a pas, seuls ses RAPPORTS comptent. **Mesuré** : avec les seuls appariés, PERTE plafonne à **120,6 contre 123 demandés** — le lot raterait son objet pour 2,4 kcal/100 g. ⚠️ **C'est l'arbitrage le plus discutable : il s'écarte du mot « transferts » du chantier.** Les deux familles sont comptées séparément et le cas 120,6 est rejouable |
| Qui sont « les légumes » (plancher 70 %) ? | `cruciferous_veg`, `leafy_greens`, `non_starchy_veg` — **`starchy_veg` exclu** | Une pomme de terre est un féculent, donc la CIBLE d'une densification. Lui donner un plancher de légume bloquerait le déplacement que le module existe pour faire |
| Qui est « protéique » (plafond 150 %) ? | Les **dix** de `PROTEIN_SOURCES`, dont `legumes` et `dairy_yogurt` | Un plafond ne fait que restreindre : l'élargir ne rend jamais l'ajusteur plus agressif. Et ça évite d'inventer un troisième vocabulaire alimentaire |
| Fromage et fruits à coque ? | **Plafond générique 200 %**, à la lettre du chantier | ⚠️ **OUVERTURE CONNUE, ET ELLE S'EST VUE** : feta ×2,0 sur PERTE, feta ×2,0 et pain ×2,0 sur GAIN. Doubler le fromage densifie **sans passer par la garde de l'huile**. Non fermée : demande une décision produit |
| « Condiment » : un groupe ou une ligne ? | **Une ligne** (`condiment_grams`) | C'est la définition du dépôt. Geler le groupe `sauce_dressing` entier figerait une vinaigrette pesée de 60 g, vrai levier de densité |
| L'eau : par groupe ou par condiment ? | **Par le groupe `water`, ce motif gagne** | Dans le vrai référentiel `water` porte AUSSI `condiment_grams = 1` : les deux motifs sont vrais, on journalise celui que la convention nomme |
| Quelle contrainte l'ajusteur ferme-t-il ? | **Le couloir de densité seul** | C'est le défaut que l'enquête chiffre. Masse et kcal servis sont décidés après, par le facteur de dimensionnement — contrôle du lot E |
| Densité d'une ligne sans importer le moteur ? | **Sonde par différence finie sur la liste entière** (+10 g crus) | Mesurer une ligne isolée donnerait une densité qui n'existe nulle part : la règle de l'eau dépend de la PRÉSENCE d'un grain absorbant, donc du reste de la liste |
| La visée peut-elle justifier un déplacement ? | **Non, elle ne départage qu'à défaut égal** | « S'arrêter dès que les contraintes sont satisfaites ». Sinon la boucle tourne et mange le budget de 200 |
| Arrondi des grammes | Dixième de gramme ; **vers le départ** pour la source, **au plus proche** pour le receveur | **Mesuré** : arrondir les deux bouts vers le départ biaise la casserole — **−2,383 g** de dérive sur 2 139 g, contre **+0,784 g** au plus proche. Le compteur de dérive est **signé**, pour qu'un biais se voie |
| Le pas minimal interdit-il d'atteindre une borne exacte ? | **Non : exception pour le pas qui ATTEINT une limite** | Sinon un plafond à 1 125 g resterait à 1 124,9 pour toujours, et le journal dirait ×1,4999 là où la convention dit ×1,5 |

## Ce qui reste non prouvé

- **La linéarité de la mesure réelle** : les marginaux sont sondés contre une réplique fidèle de
  `dishEnergy` + `weighedReadyGrams`, pas contre `measurePreparation` lui-même. Le module est
  armé : chaque déplacement accepté est **remesuré pour de vrai** et **défait** si la mesure
  dément la prédiction (`reverted_after_measure`). Ce compteur vaut 0 partout — il ne sera
  exercé qu'au branchement.
- **Le coût sur la vraie mesure** : 4,2 ms avec une mesure en mémoire ; `measurePreparation`
  résout le référentiel à chaque appel.

## Ce que le lot E doit brancher, et où

`adjustProportions({ units, consumers, measure })` → `AdjustResult`, **après** le parseur et la
mesure, **avant** `sizeDishForMouth` / `applySizing`, et **avant** toute décision de rattrapage.
`outcome === "closed"` ⇒ **zéro appel modèle**.

Trois choses à construire : les unités (une par préparation, une par plat pour son frais,
**identifiants préfixés par leur unité** car « huile d'olive » vit dans trois unités du même
plan) ; les consommateurs (prélèvements RÉELS `uses.servings / servingsMade`, plus le couloir de
`densityCorridorFor`) ; la mesure en fermeture sur l'index et `measurePreparation`/`measureFresh`.

⚠️ **`adjustable: false` sur toute unité dont la MÉTHODE écrit des grammes en toutes lettres** —
sinon l'ajustement laisse une ancienne quantité dans le texte lu par l'humain (chantier C.7).

Après l'appel, **dans cet ordre** : réécrire les quantités structurées → recalculer portions et
boîtes → recalculer les courses → régénérer les quantités citées dans les instructions →
remesurer les portions écrites et rejouer les gardes → **invalider `densityCheck`**.
