# Campagne de dix plans — 2026-09-09

Dix générations RÉELLES (`intent: "draft"`, rien n'est écrit en base), cinq solo et cinq
foyers de quatre bouches, difficulté croissante. Empreinte de code inchangée entre le
début et la fin de chaque run (`2a0c3762c1f3` solo, `0dca62ee4462` foyer).

## Le banc — comment on le relance

```bash
cd "scratchpad/2026-09-09-CAMPAGNE-PLANS"
python3 10-fixtures.py            # les dix comptes camp0909.*@keeltest.dev (mdp 1234567)
python3 20-run.py S1 F3           # une génération réelle par cas
python3 40-rapport.py S1 F3       # enveloppe, servi, rattrapage, cuisine, courses, issues
python3 45-menu.py S1             # le menu tel qu'un utilisateur le lit
python3 50-tableau.py             # une ligne par cas
```

Ce que le banc garantit, et pourquoi :

- **le corps de requête est celui de l'écran** (`planDraft.ts::composeDraft`), champ pour champ ;
- **l'enveloppe et le verdict viennent du JOURNAL du produit** (`keel.meal.envelope`,
  `keel.meal.portion_scaling`), jamais d'un calcul refait ici ;
- **l'énergie servie est mesurée par les modules de PRODUCTION importés**
  (`planEnergy`, `resolveIngredients`, `mouthDayEnergy`, `mouthTargetKcal`) sur le
  référentiel VIVANT réextrait le jour même, après pliage des préparations ;
- **on ne juge que les JOURS COMPLETS.** Un jour dont un plat ne résout pas est
  sous-compté, pas sous-nourri ; le confondre fabrique un défaut qui n'existe pas ;
- l'empreinte des mtimes de `_shared/keel` est prise avant ET après chaque run.

## Les cinq plans solo

| cas | profil | bande visée | servi (jours complets) | dans la bande | rattrapage | verdict du produit |
|---|---|---|---|---|---|---|
| **S1** socle | H 36 a, 82 kg, sédentaire, entretien | 2150–2400 | 2244 · 2353 · 2350 | **3/3** | pas déclenché | within / met |
| **S2** déficit | F 41 a, 78 kg, perte 0,5 kg/sem, 30 min, budget 60 | 1700–1900 | 2071 · 2213 · 2595 · 2557 | **0/4** | ×1,598 prot / ×0,75 autre | **above / under** |
| **S3** surplus | H 27 a, 72 kg, trains_hard + métier physique, muscle | 2600–2900 | 2754 · 2637 | **2/2** | pas déclenché | within / met |
| **S4** végane | F 29 a, 62 kg, perte, allergie arachide + fruits à coque, sans four | 1550–1750 | 2222 · 2280 | **0/2** | ×1,47 / ×0,75 | **above / under** |
| **S5** une session | H 45 a, 95 kg, perte 0,75 kg/sem, sans gluten, 6 j, congélateur | 1950–2250 | 2085 · 2085 · **3355** | **2/3** | ×1,324 / ×0,75 | within / under |

Protéines et fibres mesurées (jours complets) :

| | protéine | fibres |
|---|---|---|
| S1 | 163–191 g (2,0–2,3 g/kg) | **53–59 g/j** |
| S2 | 106–214 g (1,4–2,7 g/kg) | 38–54 g/j |
| S3 | 123–158 g (1,7–2,2 g/kg) | 37–49 g/j |
| S4 | 101–105 g (1,6–1,7 g/kg) | **69–88 g/j** |
| S5 | 165–206 g (1,7–2,2 g/kg) | 24–64 g/j |

## Les cinq foyers (quatre bouches)

| cas | bouches | ce que le plan sait dimensionner | acheté / besoin |
|---|---|---|---|
| **F1** socle | 4 adultes, tous en entretien | **aucune bouche** — `mouths.no_direction: 4`, tout au pot commun | 1757 vs 2038 = **86 %** |
| **F2** enfants | perte + entretien + 7 ans + 14 ans | 1 bouche sur 4 (le titulaire) | 1763 vs 2257 = **78 %** |
| **F3** extrêmes | muscle + perte + entretien + ado | **Theo 3248/3250 · Maya 1749/1750** (100 %) | 4797 vs 2504 = **192 %** |
| **F4** régime | F3 + Maya végétarienne + allergie fruits à coque | Theo 94 % · Maya **149 % puis 112 %** | 1866 vs 2504 = 75 % |
| **F5** maximal | F4 + une seule session + congélateur | Maya 88 % · Theo 93 % · **24 items de boîte JETÉS** | 1598 vs 2504 = **≈70 %** |

## Ce qui marche, prouvé

1. **Les régimes et les allergies mordent.** S4 végane : `breaches: 0` sur 169 formes
   contrôlées, aucun fruit à coque ni arachide dans les 51 lignes. F4/F5 : `bites: 3,
   separated: 3` — la viande sort dans une boîte à part et le pot commun passe au
   végétarien, en le DISANT (« The shared base is vegetarian: that is Maya's line »).
2. **L'arbitrage entre extrêmes existe et il est chirurgical — quand les deux bouches ont
   une direction.** F3, une seule cuisson, trois contenants : Maya 224 g de poulet, Theo
   417 g, le bac commun 643 g pour deux. Résultat mesuré : **100 % de la cible pour les
   deux**, avec des cibles qui vont du simple au double (1750 et 3250).
3. **L'entretien et la prise de poids atterrissent en solo.** S1 3 jours sur 3 dans la
   bande avec 92 ingrédients résolus sur 92 ; S3 2 jours complets sur 2.
4. **La case « tout cuisiner en une fois » tient.** S5 : 1 session, 8 préparations,
   21 reprises au congélateur sur 33, écart cuisson→repas max 6 jours (plafond 7).
5. **Le moteur dit ce qu'il déborde.** « cooking session on sat runs 230 min, but they
   said they have about 120 » ; « the meals that take from *Cooked quinoa* hold 1520 g but
   it makes about 780 g ». Il voit ses propres contradictions et les écrit.

## Les défauts, du plus grave au plus petit

### 1. La perte de poids sort HORS bande, trois fois sur trois, et le produit le sait

S2 : moyenne 2359 pour une bande qui plafonne à 1900 (**+24 %**). S4 : 2251 pour 1750
(**+29 %**). S5 : un jour à 3355 pour un plafond à 2250 (**+49 %**).

Le rattrapage n'est pas absent — il tire à chaque fois (`applied: true`) et il est BORNÉ :
`MIN_SCALE = 0.75` (`_shared/keel/portion_scaling.ts:92`). Il ne peut retirer qu'un quart.
Quand le modèle compose 3 000 kcal pour une bande à 1 700–1 900, un quart ne suffit pas.

Le verdict du produit lui-même sort `verdict_energy: "above"` dans le journal
(`keel.meal.portion_scaling`), et **rien de cet écart n'atteint `issues`, `rationale` ni
l'écran**. La personne reçoit un plan de maintien en croyant perdre 0,5 kg par semaine.

⚠️ Le vrai goulot est en amont : c'est **ce que le modèle compose** pour une bande basse.
Monter `MIN_SCALE` étirerait le pansement, pas la cause.

### 2. Le verdict juge la MOYENNE de fenêtre, jamais la dispersion

S5 sort `within` avec 2085 · 2085 · **3355**. La moyenne atterrit, un jour vaut 61 % d'un
autre. Personne ne regarde l'écart entre les jours — ni le verdict, ni le rattrapage, ni
une ligne d'écran.

### 3. Foyer : on ne dimensionne que les bouches qui ont un OBJECTIF directionnel

F1, quatre adultes en entretien : `mouths: {no_direction: 4}`, `boxes: 2, common: 2`,
zéro bouche dimensionnée, et le plan l'écrit — « The shares in this plan are served at the
plate, as close as they can be, rather than adjusted mouth by mouth ». Or les quatre
cibles vont de 1850 à 2300, **24 % d'écart**, et personne ne les distingue.

Le même moteur, dans F3, sert 100 % à Theo et à Maya. **La différence n'est pas la
difficulté du foyer : c'est d'avoir coché « perdre » ou « prendre ».** Un foyer de gens
qui maintiennent ne reçoit aucune part.

Conséquence de mesure : Georges (entretien) et Jules (mineur) sont `common_pot` dans les
quatre foyers extrêmes — **aucune vérification par bouche n'est possible pour eux**.

### 4. Foyer : la liste de courses ne suit pas les boîtes

Ce que la maison achète, par bouche et par jour, contre la moyenne des quatre cibles :
**86 % (F1), 78 % (F2), 192 % (F3), 75 % (F4), ≈70 % (F5)**. Cinq foyers, une seule
direction correcte : aucune.

Le plus lisible est F1. La casserole écrit **500 g de cuisses de poulet** et la session dit
« refrigerate two labelled portions » — les courses achètent **2 000 g**. Idem sur le
couscous (180 → 720), les lentilles (180 → 720), les tomates (400 → 1600). Les
accompagnements écrits sur les plats, eux, sont achetés ×1 : **50 g d'épinards pour quatre
personnes**. Deux multiplicateurs dans la même liste.

F3 fait l'inverse : 1210 g de cheddar et 3235 g de yaourt grec pour quatre personnes sur
deux jours, quand les boîtes n'en portent que ~350 g et ~810 g. **Les courses sont
calculées sur les quantités écrites par le modèle × les bouches, pas sur les boîtes que le
moteur a ensuite redimensionnées.**

### 5. F5 : vingt-quatre items de boîte jetés en silence

`dishes[0].boxes["vegetarian_box"]: item "Greek yoghurt" has no usable grams, dropped` —
et onze autres, plus douze « no usable name on the lid ». Le modèle a bien produit deux
boîtes par plat (végétarienne / autre) ; **aucune n'avait de grammage lisible**, donc
toutes sont tombées. C'est pour ça que Georges et Jules retombent au pot commun dans le
cas le plus difficile.

### 6. F2 : un petit-déjeuner vide livré à un foyer avec deux enfants

`dishes[0]: numeric target (macro_quantity) in an ingredient -- dish rejected
(thu/breakfast)` puis `empty_slots: thu/breakfast`, et
`shopping_list: 4 line(s) bought for a dish that is not in the plan -- removed`. Le plan
part avec un trou : jeudi matin, personne ne mange. La relance de remplissage n'a pas
rattrapé.

### 7. « Une seule session » : la case tient, la congélation ne suit pas toujours

S5 congèle 21 reprises sur 33 ✓. **F5 en congèle ZÉRO sur 22**, alors que sa propre
rationale promet « whatever would not keep in the fridge until the meal goes in the
freezer ». Sur trois jours le frigo suffit — mais la phrase promet autre chose que ce que
le plan fait.

Et les deux cas à session unique écrivent, dans le même bloc, **« You cook on Sunday »**
et **« The plan starts on Saturday, a day earlier: that is the cooking day »**, avec la
session posée le **samedi**. Une des deux lignes est fausse à l'écran.

### 8. Le débordement de temps est du simple au double

S5 : 230 min contre 120 déclarées. F5 : 240 contre 150. Le moteur le NOMME (c'est la règle
voulue), mais « votre seule session prendra 3 h 50 » n'est pas la même promesse que
« environ 2 heures », et rien ne propose d'arbitrer.

### 9. Les fibres ne sont jugées nulle part

Mesuré : **37 à 88 g par jour**. Le végane (S4) sort à 69–88 g/j, S1 à 53–59 g/j — pour un
repère de 25–30 g. `nutrientsOf` CALCULE `fiberG` ; ni `meal_envelope.ts` ni
`meal_verdict.ts` ne le lisent. C'est le seul macro-repère que le produit sait mesurer et
ne regarde jamais.

### 10. Le rétrécissement proportionnel fabrique des assiettes absurdes

F3, la boîte de Maya au déjeuner : **404 g de chili, 19 g de tortilla, 12 g d'avocat,
12 g de tomate, 7 g d'huile**. Le facteur descend tout, y compris ce qui ne se divise pas :
un cinquième de wrap, une rondelle d'avocat. Le total en kcal est juste ; l'assiette n'est
pas mangeable telle qu'écrite.

### 11. Le référentiel décide de ce qui est mesurable, et un mot anglais courant suffit

`brown onion` (S3, un jour entier non mesurable), `certified gluten free oats` (S5, trois
petits-déjeuners), `reduced salt soy sauce` (S4, deux jours), `mature cheddar` /
`hard cheese` (F2, F5). `onion`, `yellow onion` et `red onion` sont dans le référentiel ;
`brown onion` non. **Le régime aggrave le trou** : les deux cas à régime déclaré sont ceux
qui perdent le plus de jours.

### 12. La ligne d'ingrédient porte deux fois le nom de l'aliment

Le composant rend `term` puis `quantity` (`DishCard.tsx:500-501`) ; le modèle écrit le nom
DANS la quantité (« 250 g Greek yoghurt »), donc la ligne se lit « Greek yoghurt · 250 g
Greek yoghurt ». Quand le rattrapage réécrit, `portion_scaling.ts:632` écrit
`` `${next} ${unit}` `` et le nom disparaît — 27/35 lignes en S2, 38/51 en S4, 34/53 en S5,
0 quand il ne tire pas. Les deux écrivains ne s'accordent pas sur ce que `quantity`
contient. *(Lu dans le code et dans les payloads ; une capture d'écran de `/app/plan`
tranchera en dix secondes.)*

### 13. À vérifier — la cible d'un ado très sportif

Tom, 14 ans, 52 kg, `trains_hard` + `5_plus` + appétit large : **3506 kcal/j**, soit
67 kcal/kg et 71 % de plus que l'adulte du même foyer. Ce n'est pas absurde pour un
adolescent en pleine croissance qui s'entraîne six fois par semaine, mais c'est le haut de
tout repère publié, et aucune borne d'âge ne mord dessus. Lise, 7 ans, 24 kg : 1770 kcal/j.

## Les limites de cette campagne — à lire avant d'en tirer une conclusion

- **Un tirage par cas.** Le modèle varie beaucoup d'un tirage à l'autre (mesuré ailleurs :
  48 % d'écart sur la protéine, même fixture, même code). Les écarts systématiques
  (3 déficits sur 3 hors bande, 5 foyers sur 5 mal approvisionnés) portent ; un chiffre
  isolé, non.
- **Les foyers ont tourné sur DEUX jours**, pas trois. La pile locale rend `546
  WORKER_LIMIT` (« CPU time hard limit reached ») au-delà : F1 et F2 à 3 jours, F5 à
  3 jours ont été tués à 276 s, 204 s et 402 s. Ce n'est pas un défaut du produit, c'est le
  plafond CPU du runtime edge local.
- **Les jours non mesurables ne sont pas des jours pauvres.** Ils sont exclus de tous les
  verdicts de ce rapport.
- La mesure « acheté par bouche et par jour » relit la liste de courses avec un parseur
  écrit ici (le parseur de production est ancré sur la fin de chaîne et ne lit pas
  « 960 g Greek yoghurt »). Les lignes non résolues comptent zéro : les pourcentages
  d'approvisionnement sont donc des PLANCHERS.

## Ce que je regarderais en premier

1. **La composition sous bande basse** (défaut 1) — c'est le cœur de la promesse produit,
   et c'est un problème de prompt, pas de post-traitement.
2. **La liste de courses du foyer** (défaut 4) — un foyer de quatre qui achète 70 % de ce
   qu'il lui faut, ou 192 %, se voit tout de suite et casse la confiance.
3. **Les boîtes sans grammage de F5** (défaut 5) — le chemin existe, il tombe en silence.
