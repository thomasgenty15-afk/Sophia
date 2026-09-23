# Sessions de cuisine : la matrice style × durée du plan — 2026-09-21

> **Point de départ.** Plan `2c742011` (3 bouches, 3 jours à manger, style
> « un juste milieu ») : le moteur posait **trois** jours de cuisine, lundi,
> mercredi et jeudi, pour six déjeuners et dîners. Le modèle n'y est pour rien :
> le calendrier des sessions est calculé avant le prompt (`cooking_plan.ts`) et
> lui est imposé.

## 1. Ce que le sélecteur voulait dire avant

`COOKING_STYLE_PROFILE` fixait un **nombre** de sessions par style — 2 / 3 / 3 —
pris tel quel, rabattu seulement si le plan avait moins de jours que de
sessions. Sur 7 jours c'était raisonnable (lundi, mercredi, vendredi). Sur
3 jours c'était cuisiner tous les jours, et « j'aime cuisiner » ne donnait
jamais plus que « un juste milieu ».

## 2. La matrice, décidée avec le propriétaire le 2026-09-21

Jours à manger → sessions (`sessionsForStyle`, épinglée case par case dans
`cooking_plan_test.ts`) :

| Jours | Le moins possible | Un juste milieu | J'aime cuisiner |
|---|---|---|---|
| 1 | 1 | 1 | 1 |
| 2 | 1 | 1 | 2 |
| 3 | 1 | 2 | 3 |
| 4 | 2 | 2 | 3 |
| 5 | 2 | 3 | 3 |
| 6 | 2 | 3 | 4 |
| 7 | 3, ou 2 avec congélateur | 3 | 4 |

- **Le moins possible** cuisine ce que le frigo impose et rien de plus : un
  plat cuit se mange dans les 3 jours (`MAX_FRIDGE_DAYS`), donc une session
  pour trois jours. Le congélateur permet d'en garder deux sur sept jours.
- **Un juste milieu** cuisine un jour sur deux, trois fois au plus.
- **J'aime cuisiner** cuisine chaque jour jusqu'à trois jours, puis un jour
  sur deux, quatre fois au plus.

Les durées par session ne bougent pas : 30 / 60 / 120 min.

## 3. Ce qui ne bouge pas, et ce qui suit

- Les **jours de cuisine déclarés** gagnent toujours sur la table ; « tout
  cuisiner en une seule fois » force une session ; jamais plus de sessions que
  de jours à manger.
- `MAX_COOKING_SESSIONS` passe de 3 à **4**. Les **courses** restent à trois au
  plus (`GROCERY_RUNS`) et ne dépassent jamais les sessions : une quatrième
  session se nourrit de la troisième course.
- `sessionCap` est devenu un **plafond** par style (3 / 3 / 4), plus un nombre
  voulu.
- **L'offre de courses** (`offerableGroceryRuns`) suit les sessions que le
  style donne sur la fenêtre, et connaît désormais le **congélateur**
  (`freezer`, requis) — sinon elle proposait une course que le plan
  n'organiserait pas. Le champ `GroceryRunsField` le reçoit de ses deux
  écrans (`hasFreezerDeclared`).
- Le motif « c'est ton style qui limite les courses » ne se produit plus
  qu'avec un congélateur, sur sept jours en « le moins possible » ; partout
  ailleurs c'est la fenêtre qui borne, et c'est elle qu'on nomme.

## 4. Le cas vu à l'écran, après

Plan de 4 jours (un jour de courses et de cuisine, 3 à manger), « un juste
milieu » : **2 sessions**, lundi et mercredi. Lundi nourrit mardi et mercredi,
mercredi nourrit jeudi.
