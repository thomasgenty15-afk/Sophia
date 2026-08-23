# LOTS ① ② — la structure du repas · l'activité en deux axes

**2026-08-20** · branche `ff-001-quotidien-du-coach` · foyer `5600347f` (iku + Christèle)
Cadre : `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`
Rien n'est commité. Les clés i18n sont **sur le disque uniquement** (`fr.ts` / `en.ts`
portent du travail non commité d'autres sessions — jamais de `git add`).

---

## 0. LE RÉSULTAT EN UNE PHRASE

Les deux lots sont **construits, branchés, comptés et mesurés**. Ils déplacent la
**cible** d'iku de **+62,6 %** sur son dîner et celle de Christèle de **−2,1 %**.

⚠️ **Et ils ne déplacent AUCUN gramme servi.** Mesuré : sur le run APRÈS dont la forme
est comparable à la photo AVANT, les deux bouches sortent à **584 g et 472 g — les mêmes
qu'avant, au gramme près**, parce que `MEAL_MAX_GRAMS_PER_KG = 8` mord AVANT l'ancrage,
sur les deux bouches, à tous les repas. C'est la mesure qui contredit l'intention du
chantier, et c'est le §7.

---

## 1. LES DEUX PHOTOS

### 1.1 AVANT — code d'avant, fiches vides (`avant.json`)

| jour · moment | iku | Christèle |
|---|---|---|
| thu dinner | **584 g** | **472 g** |
| fri lunch | 584 g | 168 g (plat séparé) |
| fri dinner | 584 g | 472 g |
| sat lunch | 584 g | — |
| sat dinner | 584 g | 472 g |

`box_sizing` : **il n'existait pas sur un `draft`.** `generated_from` n'est écrit que
sur une ligne ÉCRITE, et tout le protocole de vérification passe par `intent: "draft"`.
Le fichier le disait déjà en toutes lettres (« toute mesure faite par `intent: "draft"`
était aveugle, et un diagnostic entier s'est trompé dessus le 2026-08-17 ») sans en
tirer la conséquence. **Ce lot ajoute `keel.household_meal.box_sizing`**, qui journalise
les MÊMES variables que `generated_from.box_sizing` — pas une seconde surface.

⚠️ **584 = 8 × 73 et 472 = 8 × 59, au gramme près.** Les deux bouches étaient déjà, et
exactement, à leur plafond `MEAL_MAX_GRAMS_PER_KG`. Voir §7.

### 1.2 APRÈS — fiches renseignées (`apres.json`, `apres2.json`)

Fiches écrites **par la vraie porte** (`keel_household_set_member_body` en POST
PostgREST avec le jeton du maître), pas par un `UPDATE` :

```
iku        journée assis   · sport 5 fois ou plus · pain seulement
Christèle  journée assis   · sport 1-2 fois       · dessert + fromage + pain
```

`box_sizing` du run `apres.json` :

```json
"anchor": {"anchored":2,"day_incomplete":1,"clamped":0}, "anchor_applied": 1,
"activity":        {"answered":2,"partial":0,"not_answered":0,"not_asked":0},
"activity_source": {"crossed":2,"legacy":0,"assumed":0},
"meal_structure":  {"answered":2,"partial":0,"not_answered":0,"not_asked":0}
```

Trois runs APRÈS ont été faits, parce qu'un seul ne dit rien :

| run | iku | Christèle |
|---|---|---|
| `apres.json` | 235 · 235 · 342 · 342 · 235 · 235 g | *aucune part attribuée par le modèle* |
| `apres2.json` | 546 · 495 · 457 · 482 · 508 g | *aucune part attribuée par le modèle* |
| `apres3.json` | **584 · 584 · 584 · 584 · 584 g** | **472 · 472 · 472 · 472 · 472 g** |

⛔ **`apres3.json` EST LA COMPARAISON VALABLE, ET ELLE EST SANS APPEL.** C'est le seul
des trois où le modèle compose la même forme que la photo AVANT (cinq boîtes partagées à
deux). Les grammes servis y sont **584 et 472 — exactement ceux de la photo AVANT, au
gramme près**, alors que les deux fiches sont renseignées et que les compteurs disent
`crossed: 2` / `answered: 2`.

584 = 8 × 73. 472 = 8 × 59. **Les deux lots ont bougé la cible et n'ont pas bougé un
gramme, parce que le plafond par repas mord d'abord.** Voir §7.

⚠️ Les deux premiers runs ne se comparent pas à la photo AVANT : le modèle compose un
plan différent à chaque appel (`apres.json` porte six plats denses, `avant.json` cinq
plats pauvres) et n'a attribué aucune part à Christèle. Un avant/après sur des plans
différents mesure le modèle, pas le lot — c'est pour ça que le §2 existe.

---

## 2. LA MESURE CONTRÔLÉE — même plan, deux sémantiques

C'est celle qui répond à la question. `scratchpad/mesure.ts` (dossier de session) lit
**les fiches en base** et **un plan réel**, et calcule deux fois : sous la sémantique
d'avant les deux lots, puis sous les fiches telles qu'elles sont.

Sur `avant.json` — le plan de la photo AVANT, à l'identique :

| | avant | après | rapport |
|---|---|---|---|
| iku · PAL | 2,00 (`legacy`) | **1,73** (`crossed`) | ×0,865 |
| iku · cible/jour | 3 925 kcal | **3 395 kcal** | ×0,865 |
| iku · cible du dîner | 577 kcal | **938 kcal** | **×1,626** |
| iku · facteur brut | 1,644 | **2,673** | **×1,626** |
| Christèle · PAL | 1,80 (`legacy`) | **1,53** (`crossed`) | ×0,850 |
| Christèle · cible/jour | 2 205 kcal | **1 875 kcal** | ×0,850 |
| Christèle · cible du dîner | 432 kcal | **423 kcal** | ×0,979 |
| Christèle · facteur brut | 1,527 | **1,496** | ×0,980 |

**iku MONTE (×1,63). Aucune erreur de signe** — sa structure de repas (pain seul) lui
donne bien une part de plat plus grande que la moyenne, et le gain de part l'emporte
largement sur la baisse de PAL.

**Christèle ne bouge pas (−2 %)**, parce que les deux lots la poussent en sens
contraires et se compensent presque exactement : ×0,850 (activité) × ×1,152 (part du
plat) = ×0,979. Voir §7.

---

## 3. LA TABLE DE CROISEMENT JOURNÉE × SPORT, ET SA DÉRIVATION

Elle vit dans `supabase/functions/_shared/keel/meal_envelope.ts`, à côté de
`ACTIVITY_FACTORS`. **Elle est calculée, pas tabulée** — `crossedActivityFactor` — et un
test refait l'arithmétique à partir de ses quatre nombres FAO.

### ① Les bandes — FAO/WHO/UNU 2004, « Human energy requirements »

```
sédentaire ou activité légère   PAL 1,40 – 1,69
modérément actif                PAL 1,70 – 1,99
vigoureusement actif            PAL 2,00 – 2,40      (plancher de vie libre : 1,40)
```

### ② La base de journée, sport exclu — `DAY_ACTIVITY_BASE`

```
seated        1,45   bas de la bande sédentaire      (= ACTIVITY_FACTORS.sedentary)
on_feet       1,65   haut de la MÊME bande           (= ACTIVITY_FACTORS.on_feet)
physical_job  1,85   milieu de « modérément actif », sans une seule séance
```

Les deux premières valeurs sont **les crans existants, au chiffre près**, et un test
l'épingle : deux copies d'un même nombre finissent par diverger.

### ③ L'incrément par séance — méthode PAR du rapport lui-même

```
PAL = Σ(PAR_i × t_i) / 24 h

une séance ≈ 1,5 h porte à porte, à PAR ≈ 7,0 (course, vélo, sport collectif,
circuit en résistance), qui REMPLACE 1,5 h qui aurait valu ≈ 1,4 :

    (7,0 − 1,4) × 1,5 / 24 = 0,35 PAL le jour de la séance
    0,35 / 7                = 0,05 PAL par séance HEBDOMADAIRE
```

Milieu de bande retenu : `none` 0 · `1_2` 1,5 · `3_4` 3,5 · `5_plus` **5,5**
(et pas 7 : la bande est ouverte vers le haut, et prendre son sommet servirait
davantage à celui dont on est le moins sûr).

### La table

|                | aucun | 1-2 | 3-4 | 5+ |
|---|---|---|---|---|
| **assis**            | 1,45 | **1,53** | **1,63** | 1,73 |
| **debout / mouvement** | 1,65 | 1,73 | 1,83 | 1,93 |
| **métier physique**  | 1,85 | 1,93 | 2,03 | 2,13 |

⚠️ **L'ordre de grandeur imposé est tenu** : journée assise + « 2 à 3 séances » est à
cheval sur deux bandes, **1,53 et 1,63**, qui encadrent 1,60. Aucune des deux n'approche
le 1,80 d'avant. Aucune case ne descend sous 1,40 ni ne monte au-dessus de 2,13.

---

## 4. LA TABLE DES POIDS DE COMPOSANTS — une CONVENTION, écrite comme telle

Dans `mouth_anchor.ts`, à côté de la constante qu'elle remplace.

```
PLAT COMPOSÉ      300 kcal   le seul que le plan compose
pain               80 kcal
fromage           120 kcal
dessert / fruit   120 kcal

part = 300 / (300 + 80·pain + 120·fromage + 120·dessert)
```

| réponses | part du plat |
|---|---|
| rien coché (les trois « non ») | **1,000** — le plat EST le repas, par définition |
| pain seul (iku) | **0,789** |
| pain + fromage + dessert (Christèle) | **0,484** |
| *repli : une seule case non répondue* | **0,420** (`COMPOSED_DISH_MEAL_SHARE`) |

⚠️ **TROU NOMMÉ : l'entrée / la soupe n'est pas demandée.** La décomposition qui a
produit `0,42` comptait 100 kcal d'entrée ; la fiche ne pose que trois questions. Une
bouche qui coche les trois obtient donc **48 %** et non 42 % — parce qu'on ne fabrique
pas une entrée que personne n'a déclarée. Direction assumée : la part du plat monte.

⚠️ **La date de péremption de `COMPOSED_DISH_MEAL_SHARE` n'est pas supprimée, elle est
déplacée** — elle vaut désormais pour les DEUX. Le jour où le plan composera le repas
entier, la moyenne ET la table disparaissent ensemble.

---

## 5. LA CONTRE-ÉPREUVE « FICHES VIDES »

Faite **sur le même plan**, donc à l'abri de la variance du modèle — un avant/après sur
deux plans différents n'aurait rien prouvé.

`mesure.ts` sur `contre-epreuve.json` (nouveau code, fiches vides), deux sémantiques :

```
SÉMANTIQUE D'AVANT               FICHES TELLES QU'ELLES SONT
iku  3925 kcal · PAL 2 (legacy)  iku  3925 kcal · PAL 2 (legacy)
chr  2205 kcal · PAL 1.8         chr  2205 kcal · PAL 1.8
iku thu  1.0336 / raw 1.9558     iku thu  1.0336 / raw 1.9558
chr thu  1.0000 / raw 1.7497     chr thu  1.0000 / raw 1.7497
iku fri  1.0336 / raw 1.3167     iku fri  1.0336 / raw 1.3167
chr fri  1.0000 / raw 1.5659     chr fri  1.0000 / raw 1.5659
iku sat  1.0336 / raw 1.3070     iku sat  1.0336 / raw 1.3070
chr sat  1.0000 / raw 1.5889     chr sat  1.0000 / raw 1.5889
```

**Identiques à la quatrième décimale, sur les huit lignes.** Le repli est neutre.

Deux tests le tiennent en propriété, pas en anecdote :
`⛔ ② LE REPLI EST NEUTRE — une fiche muette rend le nombre d'hier` (les quatre crans +
le cas sans cran) et `⛔ ① LE REPLI EST NEUTRE AU BIT PRÈS — trois cas sur quatre`.

---

## 6. LES COMPTEURS DE REPLI, ET CE QU'ILS DISENT

⛔ **Quatre états, pas deux, et deux histogrammes pour l'activité, pas un.**

| histogramme | ce qu'il dit |
|---|---|
| `activity` | ce que la FICHE porte : `answered` / `partial` / `not_answered` / `not_asked` |
| `activity_source` | quel nombre a RÉELLEMENT multiplié le métabolisme : `crossed` / `legacy` / `assumed` |
| `meal_structure` | idem pour les trois cases du repas |

Les deux ne disent pas la même chose : une fiche `not_asked` qui porte un ancien cran
sort `legacy` — le produit d'hier à l'identique — et une fiche `not_asked` sans cran sort
`assumed`, l'hypothèse 1,5. Un seul histogramme confondrait les deux, et la
compatibilité ascendante serait invérifiable.

`not_asked` est séparé de `not_answered` par **deux colonnes horodatées**
(`activity_axes_asked_at`, `meal_structure_asked_at`), écrites par un **drapeau explicite**
(`p_activity_axes_asked`, `p_meal_structure_asked`) et jamais déduites d'un `null` de
valeur. C'est aussi ce qui permet de **dé-répondre** sans rouvrir la confusion
« `null` = efface » / « `null` = ne touche pas ».

### Ce que la base dit aujourd'hui

43 lignes dans `household_member_bodies` (le dépôt est partagé, d'autres sessions
écrivent). Mesuré en base après le lot :

```
total                                    43
axes répondus (crossed)                   2   les deux fiches du foyer 5600347f
ancien cran seul (legacy)                23
ni l'un ni l'autre (assumed, 1,5)        18
structure du repas répondue               2
```

Autrement dit : **41 lignes sur 43 sont `not_asked`**, et elles rendent exactement le
produit d'hier — 23 par leur cran, 18 par l'hypothèse. C'est ce que le double
histogramme permet de lire, et qu'un compteur unique aurait écrasé en un seul zéro.

⛔ **Aucune valeur n'a été migrée, et c'est la décision centrale.** « Assis + sport 2-3× »
n'est pas reconstructible depuis `trains_some` : l'information n'a jamais été saisie. Les
13 lignes gardent leur cran comme **repli nommé**, et le compteur dit combien elles sont.

---

## 7. ⛔ CE QUI CONTREDIT L'INTENTION DU CHANTIER, ET QU'IL FAUT LIRE

Le prompt imposait trois nombres. Deux sont tenus, **un ne l'est pas.**

### ✅ « iku MONTE, il ne descend pas »
Tenu : sa cible de dîner passe de 577 à 938 kcal, son facteur brut de 1,644 à 2,673.

### ✅ « aucune part ne dépasse `MEAL_MAX_GRAMS_PER_KG` × son poids »
Tenu — **et c'est justement le problème.**

### ❌ « Christèle ~250-300 g de plat au dîner (elle est à 421 g aujourd'hui) »
**Non tenu, et il ne peut pas l'être avec ces deux lots.** Sa cible bouge de **−2,1 %** :

```
LOT ② activité   1,80 → 1,53   ×0,850
LOT ① part plat  0,42 → 0,484  ×1,152
                              ─────────
                              ×0,979
```

Descendre de 472 g à 275 g demanderait ×0,58. **Aucune composition de ces deux lots ne
produit ce facteur.** Même en supposant que le LOT ① la laisse à 0,42 (la lecture « à peu
près juste par accident »), le seul LOT ② donnerait ×0,85, soit ~400 g — pas 275.

### La vraie cause, mesurée

Sur la photo AVANT **comme sur `apres3.json`**, iku est servi à **584 g = 8 × 73 kg** et
Christèle à **472 g = 8 × 59 kg**, au gramme près, avant et après. Ce ne sont pas des
valeurs d'ancrage : ce sont les **plafonds `MEAL_MAX_GRAMS_PER_KG`** eux-mêmes.
`physicalMax` mord sur les deux bouches, à tous les repas de ces plans, **avant** que le
facteur d'ancrage n'ait la parole — et il rend donc les deux lots invisibles à l'écran
tant qu'il mord.

C'est le patron que ce dépôt a déjà mesuré trois fois, écrit noir sur blanc au-dessus
de `ANCHOR_FACTOR_MAX` : *« une borne qui mord sur la population entière n'est plus une
borne de plausibilité, c'est le calcul »*. `MEAL_MAX_GRAMS_PER_KG` est aujourd'hui dans
cet état sur ce foyer.

Et sa propre documentation dit quoi faire : *« quand elle mord, la cible d'énergie n'est
pas atteinte, et c'est voulu — la réparation d'un plan trop peu dense est de composer
PLUS DENSE, jamais de servir un volume que personne ne finit »*. Les plans mesurés
livrent **0,60 kcal/g** (584 g pour 351 kcal). **Le levier restant n'est pas une question
de plus sur la fiche : c'est la densité de ce que le modèle compose.**

---

## 8. CE QUI EST LIVRÉ

### Modules purs
- `_shared/keel/tokens.ts` — `DAY_ACTIVITY_LEVELS`, `SPORT_FREQUENCIES`, `MEAL_COMPONENTS`
- `_shared/keel/meal_envelope.ts` — `DAY_ACTIVITY_BASE`, `SPORT_PAL_PER_WEEKLY_SESSION`,
  `SPORT_SESSIONS_PER_WEEK`, `crossedActivityFactor`, `activityAnswerState`,
  `activityFactorOf`; `MouthBody.activityAxes` **requis**; `envelopeFor` passe à **8
  paramètres** positionnels requis; `childActivityFactor` prend les axes.
- `_shared/keel/mouth_anchor.ts` — `MEAL_COMPONENT_KCAL`, `COMPOSED_DISH_KCAL`,
  `MealStructure`, `mealStructureState`, `composedDishShare`; `AnchorMouth.structure`
  **requis**; `AnchorFactor.structureState` rendu **sur toutes les sorties**.

### Base — `20260820140000_activite_en_deux_axes_et_structure_du_repas.sql` (appliquée)
7 colonnes sur `household_member_bodies` + 2 CHECK ; `keel_household_set_member_body`
recréée à 12 paramètres (drop+create, l'ancienne signature part) ; `keel_household_bodies_for`
et `keel_household_member_bodies` recréées avec les nouvelles colonnes et deux booléens
`…_asked`. Lignée vérifiée : aucun doublon, disque == registre (218 == 218).

### Moteur
`generate-household-meal-v1` lit les sept colonnes, alimente `MouthBody.activityAxes` et
une map `lineStructures` **à part** (une structure de repas n'est pas une mesure du
corps), remplit trois histogrammes dans `generated_from.box_sizing`, **et les journalise**
sous `keel.household_meal.box_sizing` — le seul moyen de les voir sur un `draft`.

### Front
`MouthActivityAxesFields` (composant partagé, exporté de `MouthFormDialog.tsx`) rendu à
**deux endroits** : `MouthCoreFields` (fiche du maître, fiche neuve → `persistMouth`) et
`BodyFields` (rangée d'une bouche déjà inscrite → `setMemberBody`). Les deux écrivent
avec les drapeaux à `true`.

⛔ **Des « Oui / Non » et pas trois cases à cocher.** Une case ne sait dire que deux
choses, et il en faut trois. Sans le troisième état, un formulaire enregistré sans être
lu écrirait « ni pain ni fromage ni dessert » — un plat qui porte 100 % du repas,
c'est-à-dire **2,4 fois** la part servie aujourd'hui, dans le sens qui nourrit trop.

### Gates
- `deno test --allow-all supabase/functions/_shared/keel/` : **3 905 passés, 0 échec**
  (3 887 avant le lot ; +18 tests neufs).
- `npx tsc -b --force tsconfig.app.json` : vert.
- `npx vitest run` : **1 745 passés, 4 échecs** — exactement les **4 rouges antérieurs et
  étrangers** annoncés (`coverage-guard` ×2, `household.int.test` ×2). Aucun rouge neuf.

### Tests neufs qui tiennent une décision, pas une valeur
- la table de croisement est **refaite** à partir de ses quatre nombres FAO ;
- `DAY_ACTIVITY_BASE` ne peut pas diverger de `ACTIVITY_FACTORS` ;
- assis + 2-3 séances encadre 1,60 et n'atteint jamais 1,80 ;
- aucune case ne sort des bandes FAO ;
- les deux replis sont **neutres au bit près** ;
- un seul axe ne fabrique rien (`partial` → cran d'avant) ;
- `false` est une réponse, `null` n'en est pas une ;
- le plancher de l'enfant survit aux deux axes ;
- **les axes atteignent vraiment l'équation d'entretien** (on mesure la sortie, pas la table) ;
- **LANE FOYER — les deux axes viennent de la FICHE, pas d'un littéral** : le test lit le
  7ᵉ argument d'`envelopeFor` dans `generate-household-meal-v1` et exige
  `lineBodies…activityAxes`. Sans lui, remplacer cet argument par le littéral neutre
  laisserait tout le reste vert et le lot désarmé.

---

## 9. CE QUE JE LAISSE OUVERT

1. **`MEAL_MAX_GRAMS_PER_KG` est la valeur opérante sur ce foyer, pas l'ancrage.**
   584 g = 8 × 73 et 472 g = 8 × 59 exactement. Tant que le modèle compose à
   0,6 kcal/g, aucune question de fiche ne déplacera un gramme. **C'est le lot suivant**,
   et sa forme est déjà écrite dans le commentaire de la constante : composer plus dense.

2. **Le prompt attendait Christèle à 250-300 g ; elle bouge de −2 %.** Le calcul du §7
   montre que ces deux lots ne peuvent pas produire ce facteur. Si le nombre attendu est
   juste, il vient d'ailleurs — et il faut trouver d'où avant d'ajuster quoi que ce soit.

3. **`profiles.activity_level` garde l'axe unique.** La lane solo (`generate-meal-v1`) et
   `meal-energy-v1` passent `{day: null, sport: null, asked: false}` **en le disant**, et
   retombent donc sur le cran — exactement le nombre d'avant. L'entonnoir
   (`FUNNEL_QUESTIONS`) ne pose pas non plus les deux questions : `saveMouthBody` passe
   les deux drapeaux à `false`. Conséquence assumée : **une fiche remplie uniquement par
   l'entonnoir reste `not_asked`**, et le compteur le dit.

4. **L'entrée / la soupe n'est pas demandée** (§4). Répondre aux trois cases donne 48 %
   et non 42 %, donc **la part du plat MONTE pour tout le monde**, même pour qui coche
   tout. C'est la ceinture physique qui reste le garde-fou.

5. **`0,05 PAL par séance` et les poids de composants sont des CONVENTIONS dérivées, pas
   des mesures.** La dérivation est écrite au-dessus de chaque table et refaite par un
   test, mais aucune des deux n'a été confrontée à une dépense mesurée. À redériver sur
   les premiers vrais retours.

6. **La FORME du plan varie beaucoup d'un run à l'autre**, et je ne sais pas la
   contrôler. Sur trois runs APRÈS identiques en entrée : six plats denses sans part
   pour Christèle, cinq plats sans part pour elle, puis cinq boîtes partagées à deux.
   Le troisième cas est celui de la photo AVANT, donc la comparaison existe — mais deux
   runs sur trois n'auraient rien mesuré du tout. **Toute mesure de ce chantier faite
   sur un run unique est à refaire.** Je n'exclus pas non plus que la bande d'énergie
   plus basse de Christèle (PAL 1,53 au lieu de 1,80) pousse le modèle à ne plus lui
   composer de part ; c'est une hypothèse non tranchée, et elle mérite d'être instruite
   avant de livrer.

7. **`BodyFields` resème son état sur la lecture** (`useEffect` sur `JSON.stringify(body)`),
   parce que la porte accepte désormais d'effacer. Les trois champs du dessus (taille,
   poids, sexe) restent, eux, semés **au montage** — c'était déjà vrai, et ce lot ne le
   répare pas. Ils sont moins exposés (renvoyés complets à chaque fois), mais c'est une
   asymétrie dans un même composant, et elle finira par se voir.
