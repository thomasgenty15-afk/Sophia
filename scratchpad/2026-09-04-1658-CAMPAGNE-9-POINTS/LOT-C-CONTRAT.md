# Lot C — les courses ne plafonnent plus les sessions ; le cru se congèle

> Contrat écrit le **2026-09-04 vers 20h45**, pendant que la lane
> `supabase/functions/` est prise par une session voisine. Rien n'est codé ici.
> Écrire le contrat pendant que la lane est occupée, coder après.

## La règle, telle que l'utilisateur l'a tranchée

> « c'est sessions > ou = à courses (on ne peut pas avoir 2 sessions de courses
> et une seule session de cuisine) »

**`runs ≤ sessions`.** On ne va pas au magasin plus souvent qu'on ne cuisine.

## Ce que le code fait aujourd'hui, et pourquoi c'est l'inverse

`deriveCookingPlan` (`cooking_plan.ts:265`) **sème les sessions avec les
courses** :

    let wanted = input.runs;          // ← les courses DÉCIDENT des sessions
    if (wanted === 1 && !freezer) wanted = 2;   // ① le congélateur
    if (wanted > profile.sessionCap) wanted = cap;  // ② le style plafonne
    if (wanted > eaten) wanted = eaten;             // ③ la fenêtre plafonne
    const sessions = Math.max(1, wanted);

Conséquences mesurées : **1 course ⇒ 1 session** ; et `index.ts:3268` dérive
`askedOneSession` de `groceryRuns === 1`, donc une réponse de logistique décide
d'un mode de cuisine que personne n'a demandé. `usesFreezer` (`:321`) vaut
`sessions === 1` — le congélateur n'est pas une déclaration de la personne, c'est
un effet de bord du nombre de courses.

## Ce que chaque entrée doit gouverner après le lot

| entrée | ce qu'elle gouverne | ce qu'elle ne gouverne plus |
|---|---|---|
| conservation (frigo 3 j, congélateur 7 j) | le **plancher** de sessions | — |
| `style` | le **plafond** de sessions (`sessionCap`) | — |
| fenêtre (`daysToEat`) | plafond de sessions | — |
| `runs` | le nombre de **vagues de courses**, borné par `sessions` | **les sessions** |
| congélateur déclaré | ce qui peut être **gelé à l'achat**, et allonge le plancher | `usesFreezer` par déduction |

⚠️ **HYPOTHÈSE ASSUMÉE, à corriger d'un mot si elle est fausse.** Le plancher de
sessions devient **physique** : `ceil(joursMangés / fenêtre de conservation)`,
avec 3 jours au frigo et 7 au congélateur. Sept jours sans congélateur donnent
donc **3 sessions** ; avec congélateur, **1** suffit. C'est la seule lecture qui
rende le congélateur signifiant et qui explique pourquoi on cuisine plusieurs
fois. Le style reste le plafond : si le plancher dépasse le plafond, **c'est le
style qui gagne et le plan le DIT** (`conservation_exceeds_style`), plutôt que de
promettre en silence une nourriture qui ne tiendra pas.

## Les gestes, fichier par fichier

### ① `cooking_plan.ts::deriveCookingPlan`

- `sessions` cesse d'être semé par `runs`.
- `runs` sort borné : `runs > sessions` ⇒ raboté, note **`runs_capped_by_sessions`**.
- La règle « une course sans congélateur ⇒ deux » **reste**, mais elle porte
  désormais sur les **courses** (note `runs_1_needs_freezer` conservée), pas sur
  les sessions.
- `usesFreezer` cesse d'être `sessions === 1`. Il devient « un congélateur est
  déclaré ET le plan s'en sert » — cuit gardé au congélateur, ou cru gelé à
  l'achat.
- **Invariant testé par énumération** : style × jours × runs × congélateur, et
  `runs ≤ sessions` sur toute la table.

### ② `index.ts:3268`

`askedOneSession` **ne se dérive plus** de `groceryRuns === 1`. La case explicite
reste seule à le dire.

### ③ `grocery_waves.ts`

- Plier les dates d'achat en **≤ `runs`** vagues.
- Une ligne dont `buy_on` + fenêtre de conservation du groupe **< jour de
  cuisson** ⇒ `freeze_on_purchase: true` **si** un congélateur est déclaré ;
  sinon comportement d'aujourd'hui (vague suivante).
- Compteur `{ lines, frozen_on_purchase, needs_later_shop }`, **écrit même à
  zéro**.

### ④ Le prompt

Une ligne qui dit la cadence — aujourd'hui **le nombre de courses n'atteint
jamais le modèle** — et, avec congélateur, « les périssables de la session de
mercredi sont achetés dimanche et CONGELÉS ». Bump `MEAL_PROMPT_VERSION`
(tronc : les deux lanes).

### ⑤ Les écrans

`ShoppingListPanel` et `DayGroceriesCard` : badge « à congeler à l'achat » par
ligne, compte par vague. PDF `meal-document-v1`. Carte de session : « sors X du
congélateur la veille », **dérivé de `freeze_on_purchase` + `cook_on`**, distinct
du « sors-la la veille » de `DishCard` (qui parle d'une portion CUITE).

## Coordination

`offerableGroceryRuns` (session voisine, non commité) calcule déjà
`max = min(3, cap(style), ⌈jours / conservation⌉)`. **C'est le bon plafond de
`runs` sous la nouvelle règle** — s'aligner dessus, ne pas le réécrire, et
prévenir avant d'écrire dans `cooking_plan.ts`.

## Les mutations qui doivent rougir

| mutation | ce qui doit tomber |
|---|---|
| `runs` resémé dans `sessions` | l'énumération `runs ≤ sessions` |
| `runs_capped_by_sessions` jamais poussée | le test de note |
| `freeze_on_purchase` sans la porte congélateur | la ligne se gèle sans congélateur |
| compteur de vagues retiré | le test « écrit même à zéro » |
| `askedOneSession` redérivé de `runs === 1` | le test de câblage par source |

## Ce que ce lot ne fait PAS

Il n'ajoute aucune session que la personne n'a pas les moyens de tenir : le style
reste le plafond, et un plancher de conservation qui le dépasse **se dit** au
lieu de forcer. Il ne touche pas au verrou `cook_day`, qui est antérieur et juste.

---

## Les ancres d'écran, relevées à la lecture (2026-09-04, 21 h)

Relevé pendant que la lane serveur est prise, pour que l'écriture soit courte et
sans surprise. **Rien n'est écrit.**

| quoi | où, exactement |
|---|---|
| le type de ligne | `frontend/src/keel/api/mealGeneration.ts:552` — `ShoppingItem { term, quantity, aisle }`. Le champ `frozenOnPurchase` s'ajoute **là**, nulle part ailleurs |
| la ligne rendue | `ShoppingListPanel.tsx` ~225-236, dans le `<span className="flex flex-wrap items-baseline gap-2 text-sm">`, **à côté de `item.quantity`** — le `flex-wrap` est déjà là, un badge de plus ne casse pas la ligne à 320 px |
| les vagues | déjà construites : `waveAssignments` / `wavesAreMeaningful` (`api/groceryWaves.ts`), rendues par `wave.buyOn` autour de la ligne 273. **Le compte par vague se pose là**, pas dans `renderGroup` |
| la règle de vague | vit **une seule fois**, côté serveur (`grocery_waves.ts`) ; `groceryWaves.int.test.ts` n'éprouve que le BRANCHEMENT. Ne pas y écrire une seconde règle |

⚠️ **Deux pièges de couleur, écrits dans le fichier et déjà payés une fois.**
`@tailwindcss/forms` n'est pas installé : sur la case à cocher, `border-*` et
`rounded-*` sont **inertes**, seule `accent-*` peint. Et `Badge tone="info"`
occupe le **bleu système**, qui est déjà la teinte de la case native — un badge
« à congeler » en `info` se lirait comme une coche. Prendre une autre tonalité.

⚠️ **Le badge n'est pas une phrase.** La carte de session porte l'instruction
(« sors X du congélateur la veille ») ; la ligne de course porte la marque. Les
deux se dérivent du même `freeze_on_purchase`, jamais l'une de l'autre.
