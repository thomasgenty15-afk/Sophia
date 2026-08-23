# LOT 1 — la jointure énergie : ce que chaque bouche reçoit vraiment

**Date** 2026-08-20 00h10 · **Branche** `ff-001-quotidien-du-coach` · rien n'est commité.
Chantier : `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`.

## Ce qui est livré

`supabase/functions/_shared/keel/mouth_energy.ts` — module **pur**, et son test.

```
mouthDayEnergy({ index, dishes, preparations }) -> MouthDayEnergy[]
```

Une ligne par couple (bouche, jour). Le calcul, en trois gestes :

```
foldPreparationsIntoDishes()   plier les casseroles dans les plats
dishEnergy(index, plié)        -> kcal du plat entier
x (sa part / total du couvercle)  -> kcal de CETTE bouche sur CE plat
somme par jour
```

## Les trois décisions qui portent le module

**① La part vient du COUVERCLE, et de rien d'autre.** Une boîte porte un repas
entier avec une part par nom ; la fraction d'une bouche est donc exactement
`sa part / le total du couvercle`. C'est le même prorata que
`sizeBoxesFromTarget` applique déjà — il n'est pas réécrit, il est lu.

**② Un plat sans couvercle n'est attribué à personne, et le jour le DIT.**
C'est le seul défaut de ce module qui tromperait activement quelqu'un. Le
répartir « équitablement » fabriquerait un nombre que rien ne soutient ;
l'ignorer en silence rendrait une journée creuse qui a l'air complète — et
creuse dans la direction qui décourage. Il est donc compté (`unattributedDishes`)
et il fait basculer `subject` de `the_day` à `what_could_be_attributed`. C'est le
patron de `mealsOut` dans `plan_energy.ts`, délibérément le même.

⚠️ **Et il touche TOUTES les bouches du jour**, pas la première rencontrée : un
plat sans couvercle ne nomme personne, donc il rend le total de chacun partiel.

**③ Le module ne décide RIEN.** Aucune comparaison à une cible, aucun facteur,
aucune part touchée. `energy_gate.ts` reste en lecture seule. Aucun kcal d'ici ne
s'énonce — ni prompt, ni écran, ni réponse HTTP, ni log nominatif.

## Les lacunes sont nommées, jamais un `null` nu

| jeton | se répare |
|---|---|
| `no_box` | le prompt des boîtes |
| `empty_box` | le parseur |
| `dish_incomplete` | le référentiel (lots 0-B / 0-C) |

Trois causes, trois endroits. Un compteur qui les fondrait nommerait la mauvaise.

## Vérification — faite ici

- `deno check` propre.
- **11 tests**, tous verts. Suite `keel` complète : **3 838 passés, 0 échec**.
- **Quatre mutations, quatre rouges**, restauration verte :

| mutation | |
|---|---|
| part égale au lieu du rapport du couvercle | rouge |
| plat sans couvercle ignoré | rouge |
| préparations non pliées | rouge |
| abstention comptée comme zéro | rouge |

Le test d'arithmétique est vérifié **à la main** contre une table ronde
(200 g d'un aliment à 100 kcal/100 g = 200 kcal) : l'écart attendu est nul, et la
somme des parts vaut l'énergie du plat — rien ne se crée, rien ne se perd.

## ⛔ CE QUI N'EST PAS PROUVÉ, ET C'EST IMPORTANT

**Aucun plan en base ne porte la nouvelle forme de boîte.** Mesuré :

```
plans de foyer en base        136
  dont au moins une boîte       0
```

L'unité « une boîte par repas » date du 2026-08-19 et **aucune génération
persistée ne l'a encore écrite**. Le module ne peut donc pas être éprouvé sur
l'archive : sur les 1 204 plats existants il rendrait `no_box` partout, ce qui
est le verdict juste et n'apprend rien.

**La recette réelle du lot 1 est donc :**

1. `docker restart supabase_edge_runtime_Sophia_2` — le runtime sert des
   `_shared` périmés et un fichier modifié n'est PAS rechargé ;
2. régénérer un plan de foyer ;
3. appeler `mouthDayEnergy` dessus et lire les deux nombres par bouche et par
   jour, avec leurs motifs.

Tant que ce run n'a pas eu lieu, ce lot est **construit et non éprouvé**. C'est
exactement l'état que ce dépôt a payé plusieurs fois — un lot armé qui ressemble
à un lot qui marche — et il est écrit ici pour que personne ne l'oublie.

## Ce qui reste ouvert

1. **Le module n'a aucun appelant.** C'est voulu : le brancher est le LOT 2, qui
   compare cible et livré. Un module pur sans appelant est une moitié de lot, et
   il doit le rester jusque-là.
2. **`for_member_id` n'est pas lu.** Un plat dédié à une bouche porte cet
   identifiant ; s'il n'a pas de couvercle, il tombe en `no_box` comme les
   autres. À instruire au lot 2 — l'attribution par plat dédié est une seconde
   source de vérité, et deux sources qui se contredisent sur qui mange quoi est
   pire qu'une seule.
3. **La couverture reste le plafond.** Après les lots 0-B et 0-C, un plat sur
   trois environ n'a toujours pas de chiffre ; `dish_incomplete` sera le motif
   dominant, et c'est le référentiel qui le fera descendre, pas ce module.
