# MASTER PROMPT — Ancrer le grammage d'une portion sur un besoin réel

**Date** 2026-08-19 · **Branche** `ff-001-quotidien-du-coach`
**Demande** : les portions du foyer sortaient à `450 g` pour tout le monde, à tous
les repas, quel que soit le corps. Le partage entre bouches est réparé ; **le
niveau absolu ne l'est pas**. Ce chantier construit la pièce qui manque.

---

## 0. LE DIAGNOSTIC — établi, mesuré, à ne pas refaire

Trois verrous empêchent aujourd'hui un corps de décider d'un nombre de grammes.
Les trois sont **volontaires**. Aucun n'est un bug isolé.

**① Le prompt ORDONNE le même chiffre pour tout le monde.**
`boxingOrderLines` (`_shared/keel/household_portions.ts:1483`), quand la table
sert ≥ 2 poids distincts :

> *Give every share of a meal the SAME ordinary figure — one plate's worth of that
> meal. […] this plan changes it afterwards.*

Le modèle **n'a pas le droit** de différencier. C'est un arbitrage mesuré (il le
faisait par classe d'âge et non par corps : 291/292 aux adultes, 175/174 aux
mineurs sur trois runs), contre une promesse : *le moteur corrige après*.

**② Le corps est dans le prompt, avec interdiction d'en tirer une quantité.**
`BODY_FACTS_CAVEAT` (`household_portions.ts:1059`) :

> *Never derive anything else from them: no daily energy need, no calorie figure,
> no BMI, no category, **no target**.*

**③ Le moteur d'après ne fixe pas le niveau — il partage.**
`bodyShareFactors` (`household_portions.ts:2292`) rend
`entretien / moyenne(entretiens de la table)`. Somme des facteurs = nombre de
bouches, **exprès**, pour que la casserole ne gonfle pas. Rejeu sur le foyer réel
`5600347f` (iku 187/73/28 `muscle_gain` 0,35 kg/sem · Christèle 169/59/55
`maintenance`) :

```
avant :  450 + 450 = 900 g
après :  612 + 344 = 956 g     ← le RAPPORT change, le NIVEAU ne s'ancre sur rien
```

**Conclusion, et c'est la mission** : `estimatedMaintenanceFor` calcule bien
~2 800 kcal/jour pour ce corps. Cette valeur ne sert **qu'à fabriquer un rapport**.
Sa grandeur absolue est jetée. Le seul ancrage du nombre 450 dans tout le produit
est la locution **« one plate's worth »** — une intuition du modèle.

---

## 1. L'ORDRE DES LOTS — non négociable

```
LOT 0   la COUVERTURE du calcul d'énergie        ← sans lui, tout le reste s'abstient
   ↓
LOT 1   la JOINTURE : kcal livrés par bouche et par jour
   ↓
LOT 2   le FACTEUR ABSOLU remplace le facteur relatif
   ↓
LOT 3   le pot : raboter, ou dimensionner la casserole
```

**Un lot ne démarre pas tant que le précédent n'a pas rendu son chiffre de
recette.** Le lot 0 n'est pas de la préparation : c'est la condition de vérité de
tous les autres. Un ancrage branché sur une couverture de 38 % s'abstient sur deux
repas sur trois **en gardant le 450 g par défaut, sans que rien ne le dise** —
c'est-à-dire une couche qui ressemble exactement à une couche qui marche.

Le **LOT D** (affichage) est **indépendant** et peut partir en parallèle,
immédiatement, par un agent séparé.

---

## 2. LES RÈGLES TRANSVERSES — elles valent pour tous les agents

### 2.1 Ce qui est déjà mesuré et qu'on ne redécouvre pas

| Fait | Conséquence pour toi |
|---|---|
| **`coverage` compte les CONNUS, pas les PESÉS** | Ne dérive jamais une part de résolution à la main. `resolved.length / total` rend 69 % là où `coverage` rend 96 %, sur la même assiette. L'écart, c'était du sel et du poivre. Deux diagnostics successifs ont conclu « le référentiel est trop pauvre » et importé 689 aliments pour rien. |
| **Sel et huile ont le même compteur et pas le même coût** | Le sel ne déplace rien ; une huile non pesée éteint son plat (82 lignes d'huile sur 80 générations, premier poste de perte). L'abstention légitime est `unweighedEnergyDense`, **jamais** `unweighedTerms`. |
| **La lane foyer expire à 4 min** | N'allonge **jamais** le prompt sans nécessité mesurée. Le prompt de portions est déjà le plus long du brief, et son propre commentaire dit « ce qui est ajouté remplace, il ne s'empile pas ». |
| **Aucune calorie ne sort vers l'élève** | Les grammes d'**aliment** sont voulus. Les kcal et les chiffres de **corps** ne sortent ni à l'écran, ni dans le prompt, ni dans un log nominatif. On calcule avec, on n'énonce jamais. |
| **Un paramètre de garde optionnel est une garde désarmée** | Tout nouveau paramètre qui gouverne un grammage est **requis**, jamais `?`. Un `?` ne fait remonter aucun appelant au compilateur. Cicatrice répétée du dépôt. |
| **Un compteur à deux nombres ment** | « aucune cible » et « une cible qu'on n'a pas su appliquer » doivent avoir deux motifs distincts. Le patron en place est `BOX_SIZING_REASONS` / `BODY_SHARE_REASONS` — étends-le, n'en crée pas un second. |
| **Le facteur ne porte que sur la part mobile** | Cicatrice mesurée : un plancher laissé ouvert de 23 g, un plafond ×2 qui mord. Relis-la avant d'écrire une multiplication. |
| **Les préparations doivent être pliées dans les plats** | 51 % de la protéine restait hors du verdict sans le prorata. `foldPreparationsIntoDishes` (`meal_verdict.ts`) est l'opérateur ; ne le réécris pas. |
| **Un test paramétré par sa propre constante reste vert** | Si tu écris un seuil, le test qui le garde doit porter un littéral, pas la constante importée. Sinon changer le seuil ne casse rien. |

### 2.2 Le poste

- `supabase migration up` **seulement**. ⛔ Jamais `db reset`, `db push`,
  `functions deploy`, `secrets set`, `config push`, `link`. Si tu en as besoin :
  arrête-toi et donne la commande exacte à l'utilisateur.
- **Le runtime edge sert des `_shared` périmés.** Un fichier MODIFIÉ n'est pas
  rechargé. Après toute modification d'un module partagé, avant tout run réel :
  `docker restart supabase_edge_runtime_Sophia_2`, puis **prouver la fraîcheur**
  sur le plan produit.
- **`agent-gate` ne lance pas vitest.** Lance-le toi-même. `tsc -b --force`
  (2 s) — l'incrémental invente des erreurs. Le tsconfig utile est
  `frontend/tsconfig.app.json` ; `frontend/tsconfig.json` ne vérifie rien.
- **Sessions parallèles sur ce dépôt.** ⛔ Jamais `git stash` (emporte 200+
  fichiers d'autres sessions). Horodate tout fichier que tu déposes dans
  `scratchpad/`. Avant d'éditer un fichier hors de ton lot, vérifie `git status`.
- Foyer de référence : `5600347f-f0a4-448c-b355-c5f1d3b35d95`
  (iku `02520b63-7a1c-458a-9e25-c5fdaf744258`, Christèle sans compte).
  Base locale : `docker exec supabase_db_Sophia_2 psql -U postgres -d postgres`.

### 2.3 Ce que ce chantier ne fait PAS

- Il ne touche pas à la lane individuelle (`generate-meal-v1`).
- Il ne rebranche aucun écrivain sur `student_week_plans`.
- Il n'affiche **aucun** kcal, nulle part, à personne.
- Il ne demande **aucun** nombre de plus au modèle. Tout ce qui est ajouté est
  déterministe et postérieur au parseur.

---

## LOT 0 — LA COUVERTURE DU CALCUL D'ÉNERGIE

### Mission
Faire passer `dishEnergy` d'un taux de réponse de **37,8 %** à **≥ 85 %** sur les
plats de foyer réels, sans jamais compter un plat dont l'énergie est réellement
inconnue.

### L'état mesuré (2026-08-19, 1 204 plats de foyer en base)

```
plats de foyer                      1204
  sans ingrédient propre             193      ← plats de reprise : voir ⚠ ci-dessous
  un terme INCONNU du référentiel    304   (25,2 %)
  un terme connu NON PESÉ            252   (20,9 %)
     dont au moins un DENSE            5   ( 0,4 %)

AUJOURD'HUI  dishEnergy rend         455   (37,8 %)
SI abstention = celle de verdictFor  702   (58,3 %)
```

Référentiel : 911 lignes dans `food_composition_refs`, dont 235 marquées
`energy_dense` (min 86 kcal — la colonne est **propre**, ne la « répare » pas).

### ⛔ CORRECTION DU 2026-08-19 22h — L'ÉTAPE ① DE LA PREMIÈRE RÉDACTION ÉTAIT FAUSSE

**Ce qui était écrit ici** : « `dishEnergy` s'abstient sur n'importe quel terme non
pesé, `verdictFor` ne s'abstient que sur le dense ; le même défaut a été corrigé
une fois à un endroit et pas à l'autre ; relâche la règle, +20 points. »

**C'est faux sur les deux moitiés, et ça a été mesuré avant d'être appliqué.**

**① Ce n'est pas un oubli, c'est une décision écrite.** `plan_energy.ts:214-219`
argumente le seuil à 100 % : le verdict rend une DIRECTION qui survit à une marge,
ce module rend un NOMBRE que quelqu'un lit comme sa journée, et un ingrédient
manquant ne retire jamais d'énergie — l'erreur est donc systématique et toujours
dans le même sens.

**② Relâcher la règle ferait tomber de la vraie nourriture.** Sur les 247 plats que
la règle relâchée ferait passer, **38 ignoreraient un terme à ≥ 100 kcal/100 g** :

```
   330 kcal/100g × 13  black pepper        ← condiment, pesée ≈ 0,5 g : anodin
   285 kcal/100g ×  3  thyme, rosemary     ← idem
   145 kcal/100g ×  3  cooked rice         ← ALIMENT. ~150 g. 220 kcal perdues.
   132 kcal/100g ×  2  black beans         ← ALIMENT
   122 kcal/100g ×  2  chickpeas           ← ALIMENT
   111 kcal/100g ×  2  tuna                ← ALIMENT
   262 kcal/100g ×  2  pain complet        ← ALIMENT
```

`kcal/100 g` **n'est pas le bon critère** — et `energy_dense` non plus. Ce qui
sépare le poivre du riz n'est pas la densité, c'est la **masse plausible** :
une pincée de poivre pèse 0,5 g, une portion de riz 150 g. Deux aliments de
densité voisine ont des coûts d'omission dans un rapport de 300.

### ⛔ SECONDE CORRECTION, 22h30 — LA MESURE PAR `grams_raw` ÉTAIT BIAISÉE

`student_generated_meals.dishes[].ingredients[].grams_raw` est **figé à la
génération**. Il dit l'état du référentiel **le jour de ce plan-là**, pas
aujourd'hui. `cucumber` (×50), `red onion` (×19), `courgettes` (×17),
`salmon fillets` (×9), `tuna` (×9) portent tous `grams_raw: null` en base **et
portent déjà `unit_grams` dans le référentiel d'aujourd'hui** — ils se pèsent
maintenant.

⚠️ **Toute mesure de couverture doit rejouer `resolveIngredients` avec l'index
vivant.** Une requête SQL sur `grams_raw` mesure une archive et rend une worklist
déjà à moitié périmée. Le remplissage de `unit_grams` que la correction
précédente chiffrait à 261 plats n'en vaut, mesuré correctement, que **17**.

### ① LES TROIS CAUSES RÉELLES — index vivant, 1 204 plats

```
plats calculables aujourd'hui   455
plats bloqués                   556

  307   un terme SANS `amount`            ← la cause dominante
  225   un terme INCONNU du référentiel
   17   `unit` sans `unit_grams`
    7   autre
```

#### 0-A · LE TERME SANS QUANTITÉ — 307 plats, la cause n°1

```
× 49  parsley          × 20  salt              condiments : masse bornée
× 23  mint             × 19  basil
× 14  black pepper     × 20  fresh coriander
─────────────────────────────────────────────────────────────────────
× 36  lemon            × 15  lettuce           ALIMENTS sans nombre
× 26  roast chicken thighs                     ← 26 plats, une protéine entière
```

**Ce n'est pas un problème de référentiel, c'est un problème de prompt.** Le
générateur écrit « roast chicken thighs » sans aucune quantité, 26 fois. La
correction du 2026-08-12 avait posé l'exigence `amount` + `unit` **sur les
matières grasses, fruits à coque et sucrants uniquement**. Elle doit s'étendre à
**tout ce qui n'est pas un condiment**.

⚠️ **Et elle doit nommer sa propre échappatoire.** « Sois précis » sans dire ce
qu'on refuse se fait satisfaire par une paraphrase — mesuré deux fois sur ce
prompt (run E1 : le modèle a réduit son découpage de 2,0:1 à 1,5:1 au lieu de
l'abandonner). La consigne dit donc explicitement que la pincée d'herbes reste
une pincée, et que tout le reste porte un nombre.

⚠️ **Le prompt ne s'allonge pas : il remplace.** La lane foyer expire à 4 min et
le bloc de portions est déjà le plus long du brief.

#### 0-B · LES 112 TERMES INCONNUS — 225 plats

`corn tortillas` (22), `plums` (18), `pepper` (16), `blackcurrant jam` (13),
`lemon wedge` (12), `dill` (12), `braised beef` (11), `sourdough bread` (10),
`apricots` (10), `hot sauce` (9).

Trois familles, à compter séparément :
- **alias vers une ligne existante** (`plums`→prune, `pepper`→poivre ou poivron —
  ⚠️ ambigu, tranche-le explicitement, `lemon wedge`→citron) ;
- **lignes réellement manquantes** (source CIQUAL, comme les 911 existantes) ;
- **composés du produit** (`braised beef`, `roasted vegetables`) — ce sont des
  plats, pas des aliments : ils viennent d'une reprise et se résolvent par le
  pliage des préparations, **pas** par une ligne de référentiel. Ne les ajoute
  pas.

### ⛔ TROISIÈME CORRECTION, 23h30 — LE PLIAGE FAIT **DESCENDRE** LE TAUX, ET 0-C PASSE EN TÊTE

Vérifié deux fois, indépendamment (lot 0-B puis contre-mesure) :

```
                             par plat      APRÈS pliage   ← la mesure qui fait foi
départ du chantier            455 (37,8 %)   344 (28,6 %)
après curation 0-B            603 (50,1 %)   485 (40,3 %)
si la classe condiment
  cessait de bloquer            —            731 (60,7 %)
```

**Le vrai point de départ était 28,6 %, pas 37,8 %.** Les 193 plats de reprise
récupèrent bien une énergie, mais les casseroles apportent 51 termes inconnus de
plus (163 contre 112) et éteignent plus de plats qu'elles n'en rallument. La
cible ≥ 85 % est plus loin qu'elle n'en avait l'air.

**Et l'ordre des sous-lots s'inverse.** Les bloqueurs dominants après pliage :

```
× 185  salt          × 45  parsley       × 24  mint
× 130  black pepper  × 39  garlic        × 23  roast chicken thighs
× 109  pepper        × 27  water         × 20  lemon
```

**`salt` + `black pepper` + `pepper` = 424 occurrences bloquantes.** Ce sont
exactement les termes que 0-A laisse — à raison — rester une pincée. Aucune
consigne de prompt ne les débloquera : **0-C est désormais le premier levier du
chantier**, mesuré à **+20,4 points**, et il passe DEVANT la longue traîne.

⚠️ `water` bloque 27 plats. Zéro kcal. C'est le cas le plus absurde de la liste.

⚠️ **La classe doit être BILINGUE.** Après simulation, `sel` (×11) et `poivre`
(×11) remontent en tête des bloqueurs restants. Une garde testée dans une seule
langue est une garde à moitié armée — cicatrice connue du dépôt.

⚠️ **Masse conventionnelle, pas abstention relâchée.** Une pincée de sel PESÉE à
0,5 g donne 0 kcal et un plat calculable ; la même pincée IGNORÉE donne un plat
calculable et une règle qui laisserait aussi passer le riz. Peser, ne pas ignorer.

#### 0-C · LA CLASSE DES CONDIMENTS — PREMIER LEVIER (ex-« après 0-A »)

Une classe **fermée**, dérivée du référentiel et non écrite à la main, avec une
masse conventionnelle. `food_group_ref` ne la donne pas telle quelle : le sel et
le poivre sont dans `sauce_dressing`, avec la vinaigrette.
⛔ Ne démarre pas avant que 0-A ait mesuré ce qui reste sans quantité.

### ② Les 25,2 % de termes inconnus — le vrai reste

Ce sont trois familles distinctes, à traiter séparément et à compter séparément :

- **les composés** (`roast chicken thighs`, `corn tortillas`) → alias vers une
  ligne existante, dans `food_composition_aliases` ;
- **les manquants réels** → nouvelles lignes de référentiel (source CIQUAL,
  comme les 911 existantes) ;
- **les unités de pièce** (`0.25 unit` de `Broccoli head`, `1/2 citron`) →
  la colonne `unit_grams` existe déjà sur `food_composition_refs` et est
  simplement vide pour ces lignes.

⛔ **N'importe pas un lot d'aliments « au cas où ».** Le dépôt l'a fait deux fois
(689 aliments) en réponse à un compteur qui mesurait autre chose. Pars de la liste
des termes **réellement** inconnus, classée par fréquence, et justifie chaque ajout
par son compte.

### ⚠️ Ce que ma mesure ne couvre pas, et que tu dois établir

Les 1 204 plats ont été résolus **sans plier les préparations dedans**. Les 193
plats sans ingrédient propre sont des reprises : leur énergie vit dans leurs
casseroles. **Refais la mesure via `foldPreparationsIntoDishes`** avant de conclure
— elle peut monter (les 193 récupèrent une énergie) comme descendre (les
préparations apportent leurs propres termes inconnus). Le chiffre de recette du
lot 0 est celui-là, pas le mien.

### Recette du lot 0
- Le taux de réponse **après pliage** est mesuré avant et après, sur les 1 204
  plats, et rendu dans le rapport.
- ≥ 85 %.
- **La contre-épreuve existe** : un plat portant une huile sans quantité
  s'abstient toujours. Une garde sans cas qui passe *et* sans cas qui mord n'est
  pas une garde.
- Aucun `energy_dense` modifié en base pour faire passer un plat.

---

## LOT 1 — LA JOINTURE : kcal livrés, par bouche et par jour

### Mission
Un module **pur** qui répond : *combien d'énergie cette bouche reçoit-elle
réellement, ce jour-là, de ce plan ?*

### Les briques, toutes existantes, aucune reliée

```
foldPreparationsIntoDishes()   meal_verdict.ts        plier les casseroles
dishEnergy(index, dish)        plan_energy.ts:225     → kcal du plat entier
× (part de la bouche / total de la boîte)             → kcal de CETTE bouche
somme sur la journée                                  → kcal/jour livrés
```

Le référentiel est **déjà chargé** dans le générateur foyer
(`generate-household-meal-v1/index.ts:3671`, `composition`), dans la même
fonction, **avant** le bloc de dimensionnement (`index.ts:4926`). Aucune lecture
supplémentaire n'est nécessaire.

En face, la cible — elle aussi entièrement construite :

```
executedPaceFor(direction, subject, chosenKgPerWeek)   weight_pace.ts
  → { maintenanceKcal, dailyDeltaKcal, clampedBy }
```

Elle est **déjà bornée** par le plancher TCA, la fraction du mineur et le plafond
A1 (500 kcal/j). ⛔ **Ne réécris aucune de ces bornes.** `energy_gate.ts` est en
lecture seule pour ce chantier : il porte le seul point d'écriture de la chaîne
①②③, et recopier ses trois `if` ferait les deux points de décision que le module
interdit en toutes lettres.

### Pièges nommés
- **La part d'une bouche est une fraction de la BOÎTE, pas de la casserole.** Une
  boîte de repas tire de N casseroles ; `sizeBoxesFromTarget` fait déjà ce prorata
  (`household_portions.ts:2674`). Lis-le, ne l'invente pas une deuxième fois.
- **L'abstention est par plat et la journée l'avoue.** Un jour qui contient un plat
  sans chiffre ne rend pas un total qui a l'air complet. C'est le mode de
  défaillance que `plan_energy.ts` nomme comme le plus tentant.
- **Rien ne se stocke.** Un chiffre en colonne survit au plan qui l'a produit et
  ment le jour où le plan change. On recalcule à la lecture.

### Recette du lot 1
- Module pur, sans I/O, sans horloge, sans aléa, avec ses tests.
- Sur le foyer `5600347f` : la fonction rend un kcal/jour par bouche **ou** un
  motif d'abstention nommé. Jamais un zéro ambigu.
- Un test prouve que le total d'un jour incomplet est marqué incomplet.

---

## LOT 2 — LE FACTEUR ABSOLU REMPLACE LE FACTEUR RELATIF

### Mission
`facteur = cible / livré`, par bouche et par jour, appliqué aux parts de boîte.

### ⚠️ Ce lot RETIRE du code, et c'est le point le plus important

Une fois l'ancrage absolu en place, `bodyShareFactors` devient **redondant** : le
rapport des entretiens tombe naturellement du rapport des cibles. Le garder ferait
**deux couches qui dimensionnent** — exactement le double comptage déjà mesuré sur
trois runs (le modèle découpait par classe, le moteur multipliait par-dessus, et
l'ado de 70 kg dont le corps demande 2,03× la part de l'adulte de 47 kg en
recevait 1,02×).

**Tu retires la couche relative, tu ne l'empiles pas.** Si tu conclus qu'elle doit
survivre, écris pourquoi, avec une mesure — pas par prudence.

### Les bornes
- Les bornes actuelles (`BOX_FACTOR_MIN/MAX` 0,70–1,25 ;
  `BODY_SHARE_FACTOR_MIN/MAX` 0,55–1,45) ont été **calculées**, pas devinées, et
  leur dérivation est écrite au-dessus d'elles. Un facteur absolu n'a pas les
  mêmes bornes structurelles : **recalcule-les et écris la dérivation**, ne
  recopie pas les nombres.
- Rappel de l'arbitrage en place, et il est asymétrique : sur la chaîne
  d'objectif un facteur hors bornes **se refuse** (rendre 0,70 au lieu de 0,40
  servirait un déficit que personne n'a validé) ; sur la part de fiche il **se
  rabote** (refuser rendrait la boîte de l'adulte de 79 kg à l'enfant de 23 kg).
  Dis lequel des deux gouverne le facteur absolu, et pourquoi.

### Le prompt suit
`boxingOrderLines` bascule sur `weightGroups`. Si le nombre de poids servis change
de définition, la consigne envoyée au modèle change avec. **Vérifie les deux
branches** : aujourd'hui, quand le moteur renonce, le prompt redemande au modèle de
différencier — alors qu'il lui a interdit d'en tirer une quantité. Les deux moitiés
se renvoient la balle et personne ne pèse. Ne reproduis pas cette bascule.

### Recette du lot 2
- Sur `5600347f`, avec `muscle_gain` 0,35 kg/sem : le grammage servi correspond à
  la cible calculée, à la tolérance près, **et le nombre 450 n'apparaît plus**.
- Le motif de chaque bouche est compté (`sized` / abstention nommée), y compris
  les facteurs à 1.
- **Mutation testée** : forcer le rythme à 0 change le grammage. Si le test reste
  vert, il ne teste rien.

---

## LOT 3 — LE POT : RABOTER, OU DIMENSIONNER LA CASSEROLE

### Le fork, à trancher avec une mesure et pas une opinion
Quand la cible demande 1,5× ce que le plan a composé :

- **en aval seulement** — on réécrit les grammes de la boîte et on tape le plafond
  du récipient (`sizeBoxesFromTarget` §③). La casserole ne contient pas 1,5×. On
  rabote, et l'ancrage redevient décoratif ;
- **en amont** — le facteur remonte dans les **quantités des préparations**, donc
  dans la liste de courses. C'est la seule version où le grammage cesse d'être une
  intuition.

**Décision prise** : le lot 2 construit le calcul en aval, **mais rend le facteur
AVANT rabotage**, pour que ce lot-ci puisse le pousser en amont sans réécrire le
calcul. Mesure d'abord : sur les plans réels, combien de fois le plafond du
récipient mord ? Si c'est rare, l'aval suffit. Si c'est le cas nominal, l'aval est
un habillage et il faut le dire.

---

## LOT D — L'AFFICHAGE (indépendant, parallélisable tout de suite)

`BoxTable` rend `LA BOÎTE · iku 450 g`, sous le titre d'un plat, sans dire que le
nombre couvre le **repas entier** — poulet, légumes **et** semoule ensemble.
L'utilisateur l'a lu comme 450 g de poulet, et c'est la lecture normale.

Fichiers : `frontend/src/keel/components/plan/BoxTable.tsx`,
`frontend/src/keel/components/DishCard.tsx:301`.

⛔ Aucun « pourquoi » à côté du gramme : la carte n'a structurellement aucun champ
où un objectif pourrait entrer, et c'est voulu (`member_portions` est lisible par
tout le foyer). Une mention de **contenu**, jamais de raison.

⛔ La couche i18n n'est pas commitée (`fr.ts` absent de `HEAD`) : livre sur le
disque, ne commite pas les fichiers de traduction sans le dire.

---

## LE PROTOCOLE, POUR CHAQUE LOT

**Un agent d'implémentation, puis un agent de vérification distinct.** Le
vérificateur ne lit pas le rapport de l'implémenteur avant d'avoir fait sa propre
mesure.

Chaque lot rend :
1. **Le chiffre avant / après**, sur les données réelles, avec la requête ou le
   script qui le produit (horodaté, dans `scratchpad/`).
2. **La contre-épreuve** : le cas qui doit encore échouer, et qui échoue.
3. **Ce qui reste ouvert**, nommé. Un lot qui ne déclare aucune limite n'a pas été
   relu.
4. **La preuve de fraîcheur du runtime** si un run réel est invoqué.

⛔ **Interdits communs**
- Conclure d'un test vert sans avoir muté la valeur qu'il garde.
- Introduire un second compteur là où `BOX_SIZING_REASONS` peut être étendu.
- Écrire un kcal dans un prompt, un écran, une réponse HTTP ou un log nominatif.
- « Réparer » `signing_keys.local.json`, ou passer une fonction en
  `verify_jwt = false`, si un 401 apparaît. Lire `docs/keel/JWT-HS256.md`.
