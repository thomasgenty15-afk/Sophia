# Cas 06 — la présence jour par jour, la gamelle, et un objectif

**Le cas 03 plus trois entrées.** Corps, activité, appétit, interdits, shaker,
forfaits, plat de tradition et équipement *(four · plaques · congélateur)* ne
bougent pas.

C'est le premier cas de la série où **un chiffre sort à l'écran**.

Socle : `2026-08-21-CAS-03-EQUIPEMENT-ET-PLAT-TRADITION.md`.
Design : `2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md`, partie 5 — § ⑯ et ⑰,
lots 36 et 37.

---

## 1. Ce qui s'ajoute

| entrée | valeur |
|---|---|
| **le déjeuner en semaine** | bureau · **gamelle** · micro-ondes **oui** |
| **la grille jour par jour** | **mercredi midi décoché** |
| **l'objectif** | **prise de poids, 0,35 kg/semaine** |

---

## 2. Qui traite quoi

| | **MOTEUR — avant** | **LE MODÈLE** | **MOTEUR — après** |
|---|---|---|---|
| **grille jour par jour** | décide **quelles occasions sont composées** ; les autres passent en **estimées** et gardent leurs kcal | reçoit **une liste plus courte**, rien d'autre — il ignore qu'un midi existe ailleurs | *rien* |
| **déjeuner en semaine** | traduit en **contraintes de forme** — transportable, se réchauffe. **Ne touche aucune cible** | compose un plat de gamelle. **Lui seul sait qu'une pomme dauphine réchauffée devient molle** | ⚠️ **rien, et il ne peut pas** — « transportable » n'est pas une colonne du référentiel |
| **objectif** | `executedPaceFor` · la cible monte de 385 kcal · portes TCA et mineur | ⛔ **jamais vu** — ni kcal, ni objectif, ni rythme | ouvre la **boîte pesée** et **l'affichage du nombre** |

⚠️ **L'entrée la plus lourde du cas est celle que le modèle ne voit pas.**
L'objectif déplace la cible de 385 kcal, ouvre une prescription pesée et fait
sortir un chiffre à l'écran — **sans jamais franchir la frontière du prompt**.

---

## 3. La règle à deux axes

> **La grille jour par jour décide la PRÉSENCE. Le déjeuner en semaine décide la
> FORME. La seconde ne crée jamais une occasion et n'en retire jamais une.**

| il déclare | la grille dit | résultat |
|---|---|---|
| bureau + gamelle | midi **non coché** | ⛔ **on ne compose pas** |
| mange dehors | midi **coché** | **on compose** |

**⛔ Et décoché ne veut pas dire sauté.** Ça veut dire *« le plan ne le prépare
pas »*. Tout le monde déjeune : **son énergie compte toujours dans la journée**, en
occasion **estimée**.

⇒ Il n'existe **pas** d'état « absente ». Quatre états suffisent — composée,
estimée, résolue, forfaitaire — et **la redistribution ne se pose jamais**. *(Sans
cette règle, le midi de mercredi reporté sur les autres donnait un petit-déjeuner
à 1 468 kcal.)*

⚠️ Un vrai « je ne mange pas » vit un étage plus haut, dans les **moments
déclarés**. La grille ne parle que de préparation.

⛔ **La copie de l'écran demande la mauvaise chose** — *« décoche les repas que
quelqu'un va vraiment sauter »*. Ce qu'il faut demander, c'est **« décoche les
repas que le plan ne doit pas préparer »**. Quelqu'un qui déjeune dehors tous les
midis ne saute rien et laisserait toutes ses cases cochées.

---

## 4. Moteur — avant

```
① métabolisme de base                                    1 758 kcal/j
② × 1,63   assis + 3-4 séances                           2 865
③ × 1,10   appétit                                       3 152 kcal/j   entretien
④ objectif  0,35 kg/sem  ->  0,35 × 7 700 / 7            + 385 kcal/j   (+12,2 %)
                                                         -------
   CIBLE                                                 3 537 kcal/j

⑤ 3 537 − 70 (shaker résolu)                             3 467 à répartir
      petit-déjeuner   0,268   ->    929 kcal    composé
      déjeuner         0,391   ->  1 356 kcal    composé, EN GAMELLE
      dîner            0,341   ->  1 182 kcal    dont 922 composés + 260 de forfait

⑥ plancher protéique   117 g ÷ 3 537   =   33 g / 1 000 kcal
```

⚠️ **Le plafond de rythme a changé de place** (lot 37). L'ancien
`MAX_SURPLUS_FRACTION` de +10 % autorisait 0,29 kg/sem et **refusait 0,35**. Il
autorisait +315 kcal/j — soit exactement la taille de l'ajusteur d'appétit, et
**la moitié de la barre d'erreur sur l'entretien (±580 kcal/j)**. Le plafond est
descendu au niveau de l'avertissement `surplus_becomes_fat` : **0,5 kg/sem**. Il
est ici à **70 %** de son plafond.

---

## 5. Les trois repas

### Petit-déjeuner — 929 kcal · *plaque*

| | ordinaire | après correction |
|---|---|---|
| flocons d'avoine | 50 g | **91 g** |
| lait demi-écrémé | 200 ml | **362 ml** |
| banane | 100 g | **181 g** |
| purée de tournesol | 10 g | **18 g** |
| œuf | 1 | **2** |
| **livré** | 512 kcal | **929 kcal** |

`× 1,81` · **752 g** · **1,24 kcal/g** · **43 g de protéines**

### Déjeuner — 1 356 kcal · la tradition, **en gamelle** · *four*

| | ordinaire *(cru)* | après correction | prêt |
|---|---|---|---|
| cuisses de poulet | 220 g | **394 g** | 276 g |
| **pommes de terre rôties** | 300 g | **537 g** | 516 g |
| haricots verts | 180 g | **322 g** | 290 g |
| huile | 10 g | **18 g** | — |
| **livré** | 758 kcal | **1 359 kcal** | **1 100 g** |

`× 1,79` · **1,24 kcal/g** · **88 g de protéines**

⛔ **Les pommes dauphine ont disparu, et c'est la gamelle qui les a retirées.**
Réchauffées au micro-ondes elles sont molles. La tradition n'est pas annulée —
**sa forme plie**, comme devant l'absence de four au cas 03. Mais **c'est un
compromis, donc il se dit** (lot 35), et **c'est le modèle qui le dit** : lui seul
sait pourquoi.

### Dîner — 922 kcal composés · *plaque*

| | ordinaire *(cru)* | après correction | prêt |
|---|---|---|---|
| lentilles | 70 g | **98 g** | 235 g |
| riz | 50 g | **70 g** | 182 g |
| légumes | 200 g | **280 g** | 238 g |
| huile d'olive | 8 g | **11 g** | — |
| **huile d'algue** | 2 g | **2,8 g** | — |
| pain complet | 40 g | **56 g** | 56 g |
| **livré** | 659 kcal | **920 kcal** | **725 g** |

`× 1,40` · **1,27 kcal/g** · **41 g de protéines**

---

## 6. Mercredi — le midi est décoché

```
déjeuner        1 356 kcal    ESTIMÉ     comptés dans la journée, PAS composés
petit-déjeuner    929 kcal    inchangé
dîner           1 182 kcal    inchangé
                -----
journée         3 537 kcal    la cible tient, rien ne se reporte
```

Le plan ne prépare pas ce déjeuner ; il suppose qu'il aura lieu. **Les deux autres
repas ne bougent pas d'un gramme.**

---

## 7. ⛔ Ce que ce cas révèle — la cible de densité est à l'envers pour une prise

Sa journée pèse **2 577 g de nourriture composée**, dont **1,1 kg au déjeuner** —
dans une gamelle.

Ce n'est pas un défaut de composition : **prendre du poids, c'est manger beaucoup**,
et l'assiette le montre. Mais ça éclaire un défaut du design :

> **La cible de densité basse (1,1-1,3 kcal/g) a été posée pour la PERTE de poids.
> Appliquée à une prise, elle travaille contre l'objectif.**

Le §2.9 le démontrait déjà à moitié : le levier de densité de Klos agit en
*ad libitum* — le poids est fixe, l'énergie est la sortie. **Notre moteur épingle
l'énergie et libère le poids.** Donc pour une bouche à objectif de prise, une
densité basse ne retire aucune kcal : **elle rend seulement le volume plus dur à
avaler.**

| densité | ce que 3 537 kcal pèsent |
|---|---|
| 1,24 kcal/g *(ce plan)* | **2 852 g/jour** |
| 1,8 kcal/g *(`DENSITY_CEILING_DEFAULT`)* | **1 965 g/jour** |

**Neuf cents grammes d'écart, pour la même énergie.**

⇒ **La densité visée doit dépendre de l'objectif :** basse en perte *(le levier
fonctionne)*, **haute en prise** *(le volume est la contrainte qui mord)*, neutre
en maintien. Le produit porte déjà deux **plafonds** par objectif
(`DENSITY_CEILING_FAT_LOSS = 1,3` et `DENSITY_CEILING_DEFAULT = 1,8`) — **il lui
manque le plancher, et son sens s'inverse.**

⚠️ **Et le plancher de densité du lot 9 bis (`>= 0,80`) reste correct dans les deux
cas** : il ne sert qu'à refuser les 2 kg de soupe. C'est la **cible** qui doit
tourner, pas le plancher.

---

## 8. Ce qui s'affiche — première fois de la série

L'objectif ouvre **deux sorties** que les cinq cas précédents gardaient fermées :

**① Une boîte pesée.** Le gramme devient une **prescription**, plus une quantité de
récipient.

**② La recommandation du mercredi s'affiche** — *« vise environ 1 360 kcal à
midi »*.

⚠️ **Le calcul est identique aux cas 01 à 05. Seule la sortie change** — et elle
passe le plancher TCA comme le reste : un refus de la porte retire **l'affichage**,
pas seulement l'objectif.

---

## 9. Le bilan

```
petit-déjeuner        929     composé
déjeuner            1 356     composé — tradition, en gamelle
après-midi             70     résolu
dîner               1 182     920 composés + 110 fromage + 150 dessert
                    -----
                    3 537     cible 3 537
```

**Protéines** : `43 + 88 + 41 + 15 + 7 + 3 =` **197 g** pour 3 537 kcal, soit
**56 g / 1 000 kcal**. Seuil 33 — très large, et **définitif** *(aucune occasion
estimée ce jour-là)*.

---

## 10. Ce que ce cas ne teste PAS

| cas | ce que ça ajoute | ce que ça devrait faire bouger |
|---|---|---|
| **07** | un objectif de **PERTE** | ⛔ le plancher TCA, `MAX_DAILY_DEFICIT_KCAL`, **et le repas réellement sauté** — c'est le sens qui creuse |
| **08** | un **aliment inconnu** | l'abstention pesée et l'auto-remplissage *(lots 17-18)* |
| **09** | un **foyer** de plusieurs bouches | une casserole, N portions, l'union des interdits, la **variante de plat** *(lot 26)*, le **budget divisé par N** |
| **10** | un **mineur**, ou une **grossesse** | des portes qui **refusent**, pas des cibles qui bougent |

⚠️ **Le cas 07 est le premier où une erreur peut faire du mal.** Tous les défauts
trouvés jusqu'ici sous-nourrissent ou sur-nourrissent à la marge. En perte, la
même erreur s'additionne au déficit prescrit et peut franchir un plancher.

---

## 11. Les identifiants du code

| ce que ce cas ajoute | où |
|---|---|
| le rythme et son plafond | `weight_pace.ts` — `MAX_SURPLUS_FRACTION`, `PACE_WARNINGS.surplus_becomes_fat`, `PACE_WARN_UP_KG_PER_WEEK` |
| le curseur de rythme | `frontend/src/keel/lib/mouthForm.ts` — `paceControlFor`, `paceCeilingFor`, `PACE_STEP_KG` |
| la borne en base | `household_members_target_pace_range_check` |
| les plafonds de densité | `DENSITY_CEILING_FAT_LOSS = 1,3` · `DENSITY_CEILING_DEFAULT = 1,8` |
| la boîte pesée | `weighedPortionMembers` · `docs/keel/BOITES-PAR-REPAS.md` |
| ⛔ la grille de présence | ⚠️ **sa copie demande « sauter »** — lot 36 |
| ⛔ « transportable » | **n'est pas une colonne** — envoyé au modèle, jamais vérifié |
| ⛔ la cible de densité par objectif | **n'existe pas** — voir §7 |
