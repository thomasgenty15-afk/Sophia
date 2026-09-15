# FF-060 — Les plages suivent le besoin, et le plan porte le shaker

> **Statut** : 🟡 En cours — lot 0 écrit (`_shared/keel/eating_structure.ts`), rien de câblé.
> **Décidée le** 2026-09-04 par le propriétaire, sur la mesure ci-dessous.
> **Autorité** : ce fichier. `docs/keel/BOITES-PAR-REPAS.md` pour la forme des boîtes.

## 1. Le défaut, et il est PHYSIQUE

Mesuré le 2026-09-04 à 04:55 — foyer extrême (un qui perd 1 kg/sem, un qui prend
0,75, un qui maintient, une mineure), run réel, empreinte du code inchangée
avant/après. Pour un homme de 84 kg en `muscle_gain` à 0,75 kg/semaine :

```
cible                      4 649 kcal/jour
composé par le modèle        617 kcal/jour
facteur nécessaire            ×7,53
plafond de l'ancre            ×3        →  `clamped` 3 jours sur 3
densité réelle des assiettes   1,35 kcal/g   (mesuré : 1,13 · 1,35 · 1,56)
plus gros repas servi          672 g = exactement 8 × 84
```

**L'ancre était saturée, et elle l'était déjà avant.** Le retrait d'extras
supposé qui vivait là (58 % de la cible, retiré le même jour — voir
`meal_extras.ts`) ne corrigeait rien : il **baissait la barre** pour que l'échec
passe inaperçu. Le supprimer n'a rien cassé ; il a découvert ce qu'il cachait.

### Pourquoi ni le plafond de l'ancre ni la densité ne réparent

`MEAL_MAX_GRAMS_PER_KG = 8` borne un repas à 8 g par kilo de corps. Son pavé
(`mouth_anchor.ts:202-231`) dérive ce 8 **pour trois repas et 3 000 kcal au
plus**, en citant « un plat mixte cuisiné pèse 1,3–1,6 kcal/g ». Au-delà :

```
3 repas × 8 g/kg × 1,35 kcal/g  =  32,4 kcal/kg/jour
```

- **Monter `ANCHOR_FACTOR_MAX`** donnerait des assiettes de 1,15 kg, que le
  plafond de masse écrêterait aussitôt. On ne met pas 4 649 kcal dans trois
  assiettes : il faudrait 3,4 kg de nourriture par jour.
- **Composer plus dense** est le remède que le pavé de `MEAL_MAX_GRAMS_PER_KG`
  prévoyait — et il ne suffit pas seul : il faudrait 2,31 kcal/g, la densité du
  pain blanc, pour toute la journée.

**Le troisième levier manquait : ouvrir un moment de plus.**

## 2. Le seuil, et ce qu'il révèle

Calculé par `mouthTargetKcal` elle-même (homme de 35 ans, `no_position`) :

| corps | cible | trois assiettes portent | plages | verrou | shaker |
|---|---|---|---|---|---|
| 75 kg sédentaire | 2 422 | 2 430 ✓ | 3 | — | — |
| **75 kg debout, sport 3-4** | **3 056** | **2 430 ✗** | **4** | oui | — |
| 110 kg maintien, debout, sans sport | 3 395 | 3 564 ✓ | 3 | — | — |
| **110 kg maintien, debout, sport 3-4** | **3 765** | **3 564 ✗** | **4** | **oui** | **non** |
| 84 kg `muscle_gain` 0,75 kg/sem | 4 226 | 2 722 ✗ | 5 | oui | **oui** |

⚠️ **Ce n'est pas une affaire de grands gabarits ni d'objectif, et la ligne des
110 kg le dit** : un corps qui se **maintient** bascule de 3 à 4 moments par le
seul fait de faire du sport. Un adulte actif de 75 kg y est déjà.

**Le verrou suit le BESOIN. Le shaker ne suit que la PRISE DE POIDS.** Les deux
décisions sont séparées dans le code (`eatingStructureFor` /
`shakeDecisionFor`), et cette ligne du tableau est la raison.

## 3. Ce que le produit fait

**À l'inscription**, le nombre de moments nécessaires est dérivé du corps et de
l'objectif. Les moments **ajoutés** sont cochés et **verrouillés** à l'écran,
avec la phrase qui dit pourquoi : *« D'après ce que tu as renseigné — corps et
activité — N moments sont nécessaires. »* La personne peut en cocher **plus**,
jamais retirer un moment ouvert.

**Pour qui prend du poids et n'a pas déjà déclaré son shaker**, le plan en
**compose** un sur la première plage ouverte : un plat buvable et dense, fait
d'aliments réels du référentiel, dans une boîte à son nom.

### Les trois conditions du shaker, et aucune n'est décorative

| condition | pourquoi |
|---|---|
| `direction === "up"` | seul `muscle_gain` l'est. Le 110 kg qui se maintient reçoit le verrou, **jamais** le shaker. |
| plus de 3 moments requis | sous quatre moments, les assiettes suffisent. |
| aucun apport fixe déclaré | **elle a déjà le sien** (FF-051). En composer un par-dessus servirait deux fois la même chose, et apprendrait que déclarer ne sert à rien. |

### Ce que le shaker composé n'est pas

Ce n'est **pas** une whey. Le référentiel n'en porte aucune — mesuré le
2026-08-13 : 911 références, zéro protéine en poudre, et FF-051 explique
pourquoi on ne l'y ajoute pas (« le nombre imprimé sur LE pot de la personne est
strictement meilleur que toute moyenne »). C'est du lait ou du skyr, des
flocons, une banane, une purée d'oléagineux — sous la ceinture de régime de la
bouche (lait végétal pour une bouche végane) et sous la ceinture d'allergie de
la table (purée de graines si quelqu'un réagit aux fruits à coque).

Ce n'est **pas** un complément. FF-051 §3 exclut la supplémentation : *« un
apport fixe est un aliment »*, et FF-042 R6 dit *« on nomme, on n'ordonne
pas »*. Un shaker composé est un **repas liquide**, pas une prescription.

## 4. Ce qui reste interdit

| interdit | pourquoi |
|---|---|
| **Un kcal vers l'écran** | une plage est une STRUCTURE, pas un chiffre sur le corps. La réponse ne porte aucun champ d'énergie. Un kcal exigerait une clé nommée par sa base, une fourchette, et les quatre portes de `energy_gate.ts` (LEGAL §6.4 bis). |
| **Un kcal dans le prompt** | contrainte posée deux fois par le propriétaire : c'est **le calcul d'après** qui garantit le chiffre. La ligne du shaker dit QUOI, jamais COMBIEN. |
| **Rouvrir un moment nommé absent** | qui a écrit « je ne mange pas le matin » ne doit pas retrouver le petit-déjeuner verrouillé. On ouvre le **suivant**. Précédent mesuré : `skills/weight_divergence` a déjà proposé une collation l'après-midi à quelqu'un dont le problème était le matin — *« se tromper deux fois et perdre sa confiance »*. |
| **Un verrou deviné** | si le calcul échoue, **aucune** case n'est verrouillée. Un verrou faux est pire qu'un verrou absent : il promet. |
| **Un rabotage muet** | si tous les moments restants sont bloqués et le compte n'est pas atteint : `reason: "capped"`, compté. Une journée sous-servie ne doit pas ressembler à une journée qui n'avait besoin de rien. |
| **Ouvrir le jeton `snack` legacy** | il pèse comme une collation mais aucun écran ne le propose : la personne ne pourrait ni le décocher ni le comprendre. |

## 5. Un défaut préexistant que ce lot rend bloquant

⛔ **`mouthCells` donne à chaque bouche le rythme de la MAISON, pas le sien.**
Le rythme du foyer est une **union** (`index.ts:3218-3222`) : dès qu'une seule
bouche déclare un goûter, l'invariant « personne sans repas » attend **toute la
maison** sur ce goûter → `not_named` → la relance demande au modèle de nommer
des gens sur un plat qui n'est pas le leur → **422 `mouth_unfed`**.

Le défaut **existe déjà** : une maison où quelqu'un prend un goûter fait dire au
brief, pour les autres, *« eats at breakfast, lunch, dinner only »* pendant que
l'invariant les attend sur ce goûter. FF-060 le rendrait systématique, donc il
se corrige **avant** : le dénominateur devient `m.eatingSlots ?? rythme de la
maison`.

⚠️ **Et surtout pas `ownMealSlots(m.habits)`**, qui ressemble au bon filtre et
n'en est pas un : il dit *« à quelles cases faut-il lui cuisiner un plat à
elle »*, jamais *« à quelles cases mange-t-elle »*. L'utiliser ferait tomber le
dénominateur d'une bouche à ses seules habitudes déclarées — la garde
s'éteindrait au lieu de se corriger, et resterait verte faute de cas d'échec.

## 6. Ce que ce lot NE répare pas

- **Un shaker déclaré n'est pas vu par l'ancre du foyer.** `augmentedIndexFor`
  (qui compte l'apport dans l'énergie) n'existe que sur la lane solo. Au foyer,
  l'apport va au prompt et jamais à `mouthTargetKcal` : une bouche `declared`
  garde une cible pleine pendant qu'elle boit son shaker à côté. Nommé, pas
  réparé.
- **Le troc** — échanger une plage ouverte contre une autre de son choix.
- **Un besoin que six plages ne portent pas.** Le plan fait son maximum, `unmet`
  le compte, rien n'est promis.

## 7. Ce que ce lot déplace, et qu'il faut remesurer

`snack_pm` entre dans le dénominateur de `slotPlanTargets` (poids 0,10) et dans
`ownSlots` si le shaker est sur un couvercle à un nom. **La ligne de base
« ×7,53 contre ×3 » est donc périmée dès le premier câblage** : remesurer, ne
jamais comparer à l'ancienne.

Deux lecteurs changent aussi de population quand une plage ouverte est
persistée : `tracking_window.ts` (la part du jour d'un moment) et
`householdHabits.ts` (les extras demandés par plage déclarée). Les deux sont
souhaitables.
