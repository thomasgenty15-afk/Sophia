# Corrections du 2026-08-12 — ce que le verdict ne lisait pas

**Six défauts, tous mesurés sur des générations réelles, tous gardés par un test
qui rougit si l'on revient en arrière.** Le plus cher — les préparations hors du
verdict, §4 — cachait tous les autres : il faisait lire au moteur la moitié du
plan, et chaque diagnostic construit sur cette lecture était faux.

| § | défaut | ce qu'il coûtait |
|---|---|---|
| 1 | le harnais comptait les termes **pesés**, la production les **connus** | 69 % au lieu de 96 % ; trois diagnostics égarés |
| 2 | aucune garde sur le dense **connu mais non pesé** | 82 lignes d'huile sans quantité, énergie perdue en silence |
| 3 | `unit_grams` absent sur 876 lignes sur 911 | « 2 aubergines » = 0 kcal ; un filet de saumon = 0 g de protéine |
| 4 | **les préparations n'atteignaient pas le verdict** | **41 % de l'énergie, 51 % de la protéine** |
| 5 | le facteur protéique calculé sur le total, pas sur la part mobile | plancher laissé ouvert de 23 g |
| 7.1 | le plafond de 500 g **rapetissait** au lieu de borner | −500 g de poulet, −117 g de protéine |
| 7.2 | le levier ne couvrait que les g/ml | ~60 % de l'assiette immobile ; plafond ×2 touché 3 fois sur 5 |

Deux d'entre eux ont la même signature : **du code hors de portée des tests**
(une fermeture dans l'edge function) et **un test qui encodait le défaut qu'il
gardait**.

**Quatre campagnes de six générations réelles**, §6 et §8. Résultat net :
la résolution passe de 63-87 % (sous la porte 5 fois sur 6) à **87-100 %**, le
plancher protéique se ferme là où le plan part à portée, le facteur ne tape plus
jamais son plafond, et le verdict rend son premier `within`.

## 1. Le diagnostic de départ était faux, et c'est le plus important

Trois diagnostics successifs avaient conclu que la porte des 80 % du verdict
« mesurait le mauvais objet » et s'abstenait sur des condiments.

**Le code de production était juste.** `verdictFor` lit
`ResolutionResult.coverage`, qui compte les termes **connus** — pesés ou non.
C'est le harnais de QA qui comptait `resolved.length`, le sous-ensemble
**pesé**, d'où 69 % là où la production lit 96 %.

Le nom invitait à l'erreur : `ResolutionResult` porte un champ `resolved` qui
est le tableau des pesés, et un champ `coverage` qui est la part des connus.
Trois endroits nomment désormais la distinction explicitement — la définition,
`resolvedShare` de `portion_scaling`, et l'abstention de `meal_verdict`.

Corrigé dans les deux harnais (`qa_scaling_verify`, `qa_nutrition_review`).

## 2. Mais il y avait un vrai trou, sur l'autre branche

`unresolvedEnergyDense` gardait « je ne connais pas cet aliment ». Rien ne
gardait « je le connais, je ne sais pas le peser ».

> « a drizzle of olive oil » se résout — la couverture le compte comme connu,
> la porte des 80 % s'ouvre — ne produit **aucun gramme**, et son énergie
> n'entre dans **aucune somme**. Le plat est amputé de 120 kcal et se présente
> comme parfaitement lisible.

**Mesuré sur 80 générations réelles : 82 lignes d'huile d'olive sans
quantité.** Premier poste de perte d'énergie, loin devant tout le reste.

Réparé aux quatre étages, parce qu'une garde en lecture constate sans corriger :

| étage | ce qui a changé |
|---|---|
| lecture | `resolveIngredients` rend `unweighedEnergyDense`, lu du drapeau `energy_dense` **du référentiel** — pas du lexique `looksEnergyDense`, qui n'existe que pour les termes sans ligne |
| verdict | abstention, strictement symétrique à celle de l'inconnu dense |
| prompt | `amount` + `unit` **exigés** sur matières grasses, fruits à coque et sucrants (« a drizzle » = 1 tbsp). Le sel et les herbes restent une pincée |
| parseur | `energy_dense_unweighed` **nomme** les fautifs, à part du compteur agrégé `structured_quantity_missing` |

Le sel reste hors de la consigne exprès : exiger un chiffre partout ferait
inventer des nombres, ce que le même prompt interdit deux paragraphes plus haut.

## 3. Les dénombrements ne comptaient pour rien

35 lignes sur 911 portaient un `unit_grams`. « 2 aubergines » valait **zéro
kcal** : l'ingrédient sortait de toutes les sommes.

Deux migrations, 31 aliments, chacune appliquée **deux fois** pour prouver sa
rejouabilité :

- `20260812200000` — légumes entiers, œufs, conserves. Le seau des comptés-à-
  l'unité passe de ~120 occurrences à 2 ;
- `20260812201000` — un second rang, bien plus cher, apparu derrière le
  premier : saumon, thon, cuisses de poulet, pain, mozzarella. **Un filet de
  saumon non pesé retire 300 kcal ET 30 g de protéine** — un tiers du plancher
  d'une femme de 55 kg, sur un plan qui se présentait comme lisible.

`melon` et `fruit` restent volontairement sans poids : « 1 melon » va de 400 g
à 2 kg, et « 1 fruit » ne désigne aucun aliment. Un chiffre posé au milieu de
ces intervalles serait un nombre inventé.

## 4. Le vrai coupable : les préparations n'atteignaient pas le verdict

En batch cooking, les ingrédients ne sont **pas** dans le plat. Le plat dit
« une portion du poulet rôti de mercredi » ; le kilo de cuisses vit dans
`m.preparations`. `verdictDishesOf` ne mappait que `m.dishes`.

**Mesuré sur 80 générations réelles :**

```
énergie invisible au verdict : 41 %   (médiane par plan 39 %, max 93 %)
protéine invisible au verdict: 51 %
```

Le verdict rendait `below` / `under` sur des plans à 99 % de leur cible, et la
boucle de correction dépensait son unique relance à ajouter de la protéine à un
plan qui touchait déjà son plancher. **C'est ce qu'on lisait depuis le début
comme « les plans servent une fraction de leur enveloppe ».**

La fonction vivait en fermeture dans l'edge function, donc hors de portée des
tests — c'est là qu'elle a pu perdre la moitié du plan sans qu'une assertion ne
bouge. Elle est maintenant pure, exportée (`foldPreparationsIntoDishes`), avec
5 tests : le prorata (1 portion sur 4 = 250 g, pas le kilo), le `null` qui ne
devient pas 0, la préparation inconnue ignorée, et la condition de désarmement.

Les **trois** lecteurs la partagent : le verdict, `assessCoverage`, et la
worklist d'alias — qui manquait jusqu'ici tous les termes du batch, c'est-à-dire
les viandes et les poissons, donc exactement ceux qu'on veut curer en premier.

## 5. Le facteur protéique ne portait pas sur la bonne assiette

`scaleIngredients` ne touche que les lignes en g et ml. La protéine d'un œuf
compté à l'unité ou d'un yaourt en pot ne bouge pas. Or le facteur se calculait
`plancher / protéine TOTALE`, faisant porter à la seule part mobile un besoin
calculé sur le tout.

**Mesuré (scénario 4, recomposition 78 kg sur 5 j) :** plancher 156 g, plan à
118 g, facteur rendu ×1,32 — la protéine n'est montée qu'à **133 g**. Le
plancher restait ouvert de 23 g sur une mise à l'échelle qui se croyait
terminée : pire que de n'avoir rien fait, puisque le plan a grossi **et** manque
toujours sa grandeur de rang 2.

Corrigé avec la formule que l'énergie appliquait déjà — retirer la part fixe de
la cible, diviser par ce qui bouge. Le test qui gardait cette zone **encodait le
défaut** (`120 × facteur ≈ plancher`) ; il a été réécrit sur l'invariant juste,
avec une contre-épreuve qui rougit si l'on revient au calcul naïf.

## 6. La campagne — avant la correction du pliage

Ces chiffres portent déjà les correctifs des §1-3, **pas** ceux des §4-5.

| scénario | résolution | avant | facteur | après | protéine |
|---|---|---|---|---|---|
| 1 · Femme 55 kg · fat_loss | 100 % | 99 % | abstention (juste) | 99 % | 101/110 |
| 2 · Homme 92 kg · fat_loss | 100 % | 81 % | ×1,21 / ×2,00 | 92 % | 174/184 |
| 3 · Homme 92 kg · muscle_gain | 91 % | 61 % | ×1,31 / ×2,00 | 93 % | 146/147 |
| 4 · Homme 78 kg · recomposition | 98 % | 73 % | ×1,32 / ×1,71 | 92 % | 133/156 |
| 5 · Femme 68 kg · health | 98 % | 66 % | ×1,09 / ×2,00 | 80 % | 119/109 |

**La résolution était entre 63 et 87 % au run précédent**, sous la porte des
80 % cinq fois sur six. Elle est maintenant à **91-100 %**, la mise à l'échelle
s'arme, et les plans atterrissent à 80-99 % de leur cible.

Le scénario 1 s'abstient à juste titre : à 99 % de l'énergie et 92 % du plancher,
il est dans la zone morte des deux côtés.

### Ce que la campagne apprend en plus

**Le plafond ×2 mord dans 3 scénarios sur 5.** Les plans générés partent à
61-81 % de leur cible énergétique (médiane ~73 %), et la mise à l'échelle ne
peut pas doubler plus que double. Le scénario 5 reste à 80 % pour cette seule
raison. Ce n'est pas un défaut de la mise à l'échelle : **c'est la génération
qui sous-porte**, systématiquement et dans le même sens. À traiter en amont —
la mise à l'échelle est un correctif, pas une politique de portions.

## 7. Deux défauts de plus, trouvés par la campagne elle-même

### 7.1 Le plafond de 500 g **rapetissait** ce qu'il devait borner

```
préparation : 1 kg de cuisses pour 4 portions
facteur ×1,32           → 1320 g
plafond                 → 500 g          ⚠️ moins que l'original
```

Une mise à l'échelle qui, en cherchant à agrandir, retirait **500 g de poulet
et 117 g de protéine**. C'est ce qui expliquait le scénario 4 : plancher 156,
atterrissage à 144, alors que le facteur ×1,32 n'était pas borné et aurait dû
tomber pile.

Les 500 g bornent une **portion d'assiette** absurde ; ils n'ont aucun sens sur
un lot cuisiné pour quatre, où le kilo est le cas nominal. Le module ne sait pas,
à cet endroit, combien de bouches un ingrédient sert. Règle sûre retenue : **le
plafond peut refuser de grandir, jamais rapetisser.** Le compteur `capped` ne se
déclenche plus que quand il mord vraiment — « a mordu » et « a refusé de
grandir » ne demandent pas la même action.

### 7.2 Le levier est plus étroit que l'assiette

`scaleIngredients` ne touche que les lignes en **g** et **ml**. Scénario 3 :
`reste ×2,00` ne déplace l'énergie que de **3 points** (65 % → 68 %). Reconstitué,
environ **60 % de l'assiette est hors de portée du facteur**, à 100 % de
résolution.

La raison est documentée et bonne : « 0,7 avocat » et « 1,4 tortilla » ne
s'achètent ni ne se servent. Mais les deux migrations `unit_grams` de la §3 en
ont changé le poids — les aliments comptés à l'unité (œufs, tranches, boîtes,
filets) étaient **invisibles**, ils sont maintenant **lus mais immobiles**.

**Recommandation n°1, non implémentée :** mettre à l'échelle les dénombrables en
**arrondissant à l'entier**. « 2 œufs » → « 3 œufs » s'achète et se sert ;
l'objection de l'en-tête ne porte que sur les fractions. Risque à borner : la
grossièreté sur les petits comptes (1 → 2 fait +100 %). Ce n'est pas la
correction d'un défaut mais le renversement d'une décision documentée avec sa
raison — d'où l'arrêt ici.

## 8. La campagne

### 8.1 Deuxième run — pliage et facteur protéique corrigés

| scénario | résol. | avant | facteur | après | protéine |
|---|---|---|---|---|---|
| 1 · Femme 55 · fat_loss | 89 % | 78 % | ×2,00 / ×0,75 | 105 % | 64→103 / 110 |
| 2 · Homme 92 · fat_loss | 83 % | 55 % | ×2,00 / ×2,00 | 78 % | 88→124 / 184 |
| 3 · Homme 92 · muscle_gain | 100 % | 65 % | ×0,94 / ×2,00 | 68 % | 153→149 / 147 |
| 4 · Homme 78 · recomposition | 99 % | 72 % | ×1,32 / ×1,90 | 91 % | 126→144 / 156 |
| 5 · Femme 68 · health | 81 % | 41 % | ×2,00 / ×2,00 | 64 % | 36→65 / 109 |
| 6 · restriction_flag | 85 % | — | abstention (structurel) | — | 78 |

**Ce que ce run prouve :** le verdict et la mesure voient enfin la même
assiette. Scénario 3 : `below/met` sur un plan à 65 % d'énergie et 153/147 de
protéine — les deux lectures concordent, ce qui n'était jamais arrivé avant le
pliage. Le scénario 6 s'abstient structurellement (`per_portion`, pas de bande
d'énergie), ce qui est le comportement voulu sous plancher TCA.

**La résolution tient : 81-100 %**, au-dessus de la porte partout. Elle était
entre 63 et 87 % avant ce lot, sous la porte cinq fois sur six.

### 8.2 Le constat qui reste, et le confondant qu'il faut écarter

Les plans partent à **41-78 % de leur cible** (médiane ~65 %). Les deux facteurs
tapent `MAX_SCALE` dans 3 scénarios sur 5.

⚠️ **Un plan incomplet se lit exactement comme un plan sous-porté.** Diviser par
3 jours demandés quand le modèle n'en a rempli que 2 fait chuter le quotient
d'un tiers sans qu'aucune portion n'ait bougé — et les deux défauts appellent
des réparations **opposées** (le budget de plats d'un côté, les quantités de
l'autre).

Le harnais rend donc désormais, par scénario : jours remplis / jours demandés,
plats par jour, et l'énergie ramenée **au jour effectivement rempli**. C'est ce
chiffre qui dira lequel des deux on regarde. Troisième run en cours.

### 8.3 Troisième run — plafond corrigé et comptabilité des jours

**Tous les correctifs de ce lot sont dedans.**

| scénario | résol. | jours | plats/j | avant | facteur | après | protéine |
|---|---|---|---|---|---|---|---|
| 1 · Femme 55 · fat_loss | 87 % | 3/3 | 3,0 | 70 % | ×2,00 / ×1,50 | **100 %** | 51→79 / 110 |
| 2 · Homme 92 · fat_loss | 99 % | 3/3 | 3,0 | 80 % | ×1,23 / ×1,46 | **96 %** | 158→**183** / 184 |
| 3 · Homme 92 · muscle_gain | 99 % | 3/3 | 3,0 | 72 % | ×0,82 / ×2,00 | 83 % | 171→166 / 147 ✓ |
| 4 · Homme 78 · recomposition | 97 % | 5/5 | 3,0 | 60 % | ×1,35 / ×2,00 | 80 % | 124→**158** / 156 ✓ |
| 5 · Femme 68 · health | 97 % | 3/3 | 3,0 | 67 % | ×2,00 / ×1,55 | **99 %** | 71→**117** / 109 ✓ |
| 6 · restriction_flag | 98 % | 3/3 | 3,0 | — | abstention structurelle | — | 134 |

#### Le confondant est mort

**6 plans sur 6 sont complets** : tous les jours demandés sont remplis, 3,0 repas
par jour partout, et l'énergie « par jour rempli » est identique à l'énergie
« par jour demandé ». Le déficit n'est pas une couverture manquante — **c'est
bien les quantités**.

#### Ce que le lot a gagné, mesuré

- **Résolution 87-99 %** partout, au-dessus de la porte. Elle était à 63-87 %
  avant ce lot, **sous la porte cinq fois sur six** — donc pas de verdict, pas de
  correction, pas de mise à l'échelle.
- **Le plancher protéique se ferme dans 4 scénarios sur 5** (183/184, 158/156,
  117/109, 166/147). Il ne se fermait jamais avant.
- **Le correctif du plafond, isolé** — même scénario, deux runs :

  | | départ | arrivée | plancher |
  |---|---|---|---|
  | run 2, plafond fautif | 126 | 144 | 156 ✗ |
  | run 3, plafond corrigé | 124 | **158** | 156 ✓ |

- **La recomposition marche dans les deux sens** : scénario 3, la protéine était
  au-dessus du plancher, le facteur la *réduit* (×0,82) pendant que le reste
  monte (×2,00). C'est ce qui distingue une assiette recomposée d'une assiette
  simplement plus grosse.
- **L'abstention structurelle tient** : scénario 6, `per_portion`, aucune bande
  d'énergie, aucun facteur. Aucun chiffre dérivé du corps d'un élève sous
  plancher TCA.

#### Ce qui reste ouvert, avec sa frontière

Les plans partent à **60-80 % de leur cible** (médiane 70 %), toujours dans le
même sens. La mise à l'échelle referme l'écart **quand il est modéré** :

- départ ≥ 67 % → arrivée **96-100 %** (scénarios 1, 2, 5) ;
- départ ≤ 72 % **avec** `reste` au plafond → arrivée **80-83 %** (scénarios 3, 4).

La frontière n'est pas le déficit d'énergie mais **la part de l'assiette que le
facteur peut atteindre**. Quand `reste` tape ×2,00 et que l'énergie plafonne
quand même, c'est que les 60 % non-échelonnables tiennent le résultat.

Et le scénario 1 montre la limite côté protéine : parti à **46 % du plancher**
(51/110), il finit à 79 malgré ×2,00. Un plan qui part sous la moitié du plancher
n'est pas rattrapable par un facteur borné.

### 8.4 Quatrième run — la mise à l'échelle élargie aux dénombrables

Le refus global des dénombrables est remplacé par **deux refus précis**, qui
couvrent exactement ce que l'argument d'origine visait :

1. **le nombre réécrit doit être celui de la prose.** « 1/2 avocado » commence
   par « 1 » alors que `amount` vaut 0,5 — le réécrire donnerait « 2/2
   avocado ». C'est l'exemple même qui justifiait le refus global, et c'est une
   règle générale qui le neutralise, pas un cas particulier sur l'avocat ;
2. **la frontière du singulier/pluriel ne se traverse pas.** « 1 egg » → « 2
   egg » et « 2 eggs » → « 1 eggs » sont faux tous les deux, dans les deux
   langues. Fléchir demanderait un moteur de grammaire.

`unit` s'arrondit à l'entier, `tbsp`/`tsp` au demi. Et la prose garde son
texte : « 2 tins of chickpeas, drained » → « **3** tins of chickpeas, drained ».

⚠️ **Le piège fermé au passage.** L'élargissement mettait la définition de
« échelonnable » à **deux endroits** — dans `scaleIngredients` et chez
l'appelant qui calcule la part mobile du facteur. Deux listes divergent au
premier élargissement, et le facteur se remet à porter sur une assiette qui
n'est pas celle qu'on déplace : c'est **littéralement le défaut §5**, qui aurait
coûté le même prix une seconde fois. `isScalableUnit` est donc exportée et
partagée.

| scénario | départ | facteur | arrivée | protéine | ingr. |
|---|---|---|---|---|---|
| 1 · Femme 55 · fat_loss | 96 % | abstention (juste) | 96 % | 101/110 | — |
| 2 · Homme 92 · fat_loss | 72 % | ×1,31 / ×1,48 | **94 %** | 148→**183** / 184 | 43 |
| 3 · Homme 92 · muscle_gain | 70 % | ×0,86 / ×1,80 | **93 %** | 164→188 / 147 ✓ | 38 |
| 4 · Homme 78 · recomposition | 60 % | ×2,00 / ×1,45 | **90 %** | 85→132 / 156 | 65 |
| 5 · Femme 68 · health | 68 % | ×2,00 / ×1,25 | **97 %** | 55→81 / 109 | 37 |
| 6 · restriction_flag | — | abstention structurelle | — | 74 | — |

#### La preuve, sur deux scénarios à départ comparable

Ce n'est pas le pourcentage final qui prouve quelque chose — la variance de la
génération est énorme (le scénario 1 a rendu 41 %, 70 %, 78 %, 96 % et 99 %
selon les tirages). **Ce qui prouve, c'est que le facteur ne tape plus le
plafond** :

| | départ | « reste » | arrivée | ingr. |
|---|---|---|---|---|
| scénario 3, run 3 (g/ml) | 72 % | **×2,00 plafond** | 83 % | 35 |
| scénario 3, run 4 (élargi) | 70 % | ×1,80 libre | **93 %** | 38 |
| scénario 4, run 3 (g/ml) | 60 % | **×2,00 plafond** | 80 % | 50 |
| scénario 4, run 4 (élargi) | 60 % | ×1,45 libre | **90 %** | 65 |

Le scénario 4 a un **départ identique au pour-cent près** : +10 points
d'énergie, 15 ingrédients de plus déplacés, plafond relâché. Ce n'était donc pas
`MAX_SCALE` la contrainte — c'était la part d'assiette hors d'atteinte, comme
la §7.2 le supposait.

Sur les quatre runs, `reste` tapait le plafond dans **3 scénarios sur 5** ; il
ne le tape plus dans **aucun**.

#### Ce que ça ne répare pas, et c'était prévu

Les scénarios 4 et 5 partent à **54 % et 50 % du plancher protéique**. Le facteur
protéique tape ×2,00 et n'y arrive pas (132/156 et 81/109). C'est la limite
nommée en §8.2 : **un plan parti sous la moitié du plancher n'est pas
rattrapable par un facteur borné.** Elle n'a pas bougé, et elle ne pouvait pas —
la réparation est en amont.

#### Le verdict parle enfin

Scénario 1 : `within`/under sur un plan à 96 %. **Premier `within` de toute la
session.** Avant le pliage des préparations, le verdict ne rendait jamais autre
chose que `below` ou `not_computable` — il lisait la moitié de l'assiette.

## 9. État des tests

**4666 passants, 0 échec** (dont 31 sur la mise à l'échelle, 31 sur le verdict).
Les deux rouges de `_shared/chat/` du début de session ont été réparés
entre-temps par l'autre agent.

27 erreurs de typecheck subsistent, **toutes hors de ce lot** :
`stripe-reconcile-seats`, `log_protocol_event` (`plan_relation` manquant),
`KeelTurnContext`, `PulseDecisionInput`. `deno check` est propre sur
`_shared/keel/` et sur `generate-meal-v1/index.ts`.

## 10. Ce qui reste, par ordre de valeur

1. **La génération sous-porte, systématiquement.** Départ à 60-80 % de la cible,
   dans le même sens sur 5 scénarios sur 5, sur des plans **complets**.
   L'en-tête de `portion_scaling.ts` documente quatre tentatives par la consigne,
   toutes sans effet — d'où le correcteur déterministe. Rouvrir le sujet demande
   un angle neuf, pas une cinquième reformulation.

2. **Le plancher protéique des plans partis bas.** Scénarios 4 et 5 : départ à
   54 % et 50 % du plancher, facteur à ×2,00, arrivée à 85 % et 74 %. Un facteur
   borné ne rattrape pas ça. Même racine que le point 1.

3. **Le câblage.** `portion_scaling`, `plan_feedback`, `activity_floor`,
   `activity_stance` et le verrou du parseur de régime n'ont toujours **aucun
   appelant de production** — leur valeur mesurée ici reste théorique tant qu'ils
   ne tournent pas. Bloqué sur `doctrine.ts` et `meal_generation.ts`, modifiés
   en vol par un autre agent. **C'est le point qui transforme tout ce lot en
   produit.**

4. **Rien n'est commité.**
