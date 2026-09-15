# LOT 0-A — la quantité cesse d'être optionnelle

**Date** 2026-08-19 23h · **Branche** `ff-001-quotidien-du-coach` · rien n'est commité.
Chantier : `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`.
**Arbitrage utilisateur appliqué** : remplacer si ça ne dégrade rien ailleurs, ajouter sinon.
→ **remplacement pur**, +76 caractères nets (~19 tokens).

## Le défaut n'était pas une consigne manquante. C'était une CONTRADICTION.

Le prompt système contient **déjà**, depuis le lot des boîtes :

> `== WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED, NEVER VAGUE ==`
> *Salt, pepper and herbs may stay a pinch. **Everything else gets a number**.*

Et pourtant `roast chicken thighs` arrive **26 fois** sans aucune quantité.

**Parce que les deux blocs ne parlent pas du même objet, et que la couture entre
eux était grande ouverte** :

| bloc | gouverne | ce qu'il disait |
|---|---|---|
| `WHAT A DISH ADDS ON THE DAY` | la **phrase** `quantity` | « everything else gets a number » |
| `SAY THE SAME QUANTITY TWICE` | les champs **structurés** `amount`/`unit` | « FATS … ARE **THE ONE EXCEPTION** » |

Le modèle satisfaisait **les deux à la fois** :

```json
{ "term": "roast chicken thighs", "quantity": "2 chicken thighs",
  "amount": null, "unit": null }
```

La phrase est dénombrable (bloc 1 : ✅). Les champs structurés sont nuls, et les
matières grasses étaient « la seule exception » qui devait les porter — donc tout
le reste avait le droit de les laisser vides (bloc 2 : ✅). **Le nombre existait
dans la phrase et n'atteignait jamais le moteur.**

Deux phrases achevaient de fermer la porte :

- `"unit"` : *« If what you meant is a handful, a cup, a bunch or a pinch, leave
  amount and unit null »* — la forme **dénombrable** n'était nulle part. Rien ne
  disait que « half a lemon » s'écrit `0.5` + `"unit"`.
- *« Never guess. An ingredient whose weight you do not actually know keeps its
  phrase and leaves the three fields null. »* — permission générale, et le
  modèle l'a lue comme telle.

## Ce qui a été remplacé

**① Le champ `unit`** — 3 lignes → 3 lignes :

> `"unit":` one of "g", "ml", "unit", "tbsp", "tsp". Nothing else exists. **A
> thing you can COUNT is "unit": half a lemon is 0.5, two thighs are 2.** Only a
> handful, a cup or a pinch leaves both null.

**② La règle par défaut** — 11 lignes → 12 lignes. Le défaut est INVERSÉ :

> **EVERY INGREDIENT ALWAYS CARRIES "amount" AND "unit". Salt, pepper and herbs
> may stay a pinch; nothing else may.** The chicken, the lemon, the lettuce, the
> rice -- everything a person actually eats carries its number.
>
> Never INVENT a weight: a made-up number is worse than a missing one. But **"I
> did not write one" is not "I do not know"**. You chose this dish, so you know it
> takes two chicken thighs and half a lemon -- count what is countable.
>
> Fats, nuts and sweeteners are the strictest case: […] "A drizzle of olive oil"
> is a tablespoon […]

⛔ **CE QUI N'A PAS BOUGÉ, ET C'ÉTAIT L'INTENTION D'ORIGINE.** La consigne ne
s'étend **toujours pas** au sel : une pincée reste une pincée, et exiger un
chiffre partout ferait inventer des nombres — ce que le même prompt interdit deux
paragraphes plus haut. L'exception est simplement **nommée comme la seule**, au
lieu d'être la règle par défaut.

⚠️ **L'échappatoire est nommée littéralement** (« I did not write one » is not
« I do not know »). Sans ça, la rédaction se fait satisfaire par une paraphrase —
cicatrice mesurée deux fois sur ce prompt (run E1 : le modèle a réduit son
découpage de 2,0:1 à 1,5:1 au lieu de l'abandonner).

⚠️ **L'argument mesuré de l'huile est conservé mot pour mot** (« a spoon of oil
weighs what a whole plate of vegetables weighs »). Il vient des 82 lignes d'huile
sans quantité du 2026-08-12 et il n'est pas décoratif.

## Le troisième compteur — sans lui, on ne saurait jamais si le lot a mordu

`structured_quantity_missing: 30/94 ingredients` **ne distingue pas** « 30 pincées
de persil », qui est le produit voulu, de « roast chicken thighs », qui est le
défaut. C'est le zéro ambigu que ce dépôt paie en boucle.

Ajouté, à côté de `energy_dense_unweighed` et sur le même patron (**nommé**, car
c'est le TERME qui dit si la consigne a porté, jamais le compte) :

```
unquantified_terms: parsley, roast chicken thighs, lemon (+9 more)
```

- **Tous** les termes, pas seulement les non-condiments : la classe fermée des
  condiments est le lot 0-C, et elle ne se dérive pas de `food_group_ref` (le sel
  et le poivre y sont rangés avec la vinaigrette). Nommer tout le monde laisse le
  lecteur voir l'aliment au milieu du persil.
- **Plafond dit, jamais muet** (`UNQUANTIFIED_TERMS_NAMED = 12`, puis `+N more`).
  Une troncature silencieuse se lit « il n'y avait que douze termes ».

## Vérification — faite ici

| | |
|---|---|
| `deno check` sur le module | propre |
| suite `_shared/keel` complète | **3 827 passés, 0 échec** (3 824 avant : +3 tests) |
| coût prompt de MA modification | **+76 caractères**, +1 ligne (~19 tokens) |

**Quatre mutations, quatre rouges, restauration verte :**

| mutation | effet |
|---|---|
| l'exception redevient permissive (`oil may not`) | 🔴 |
| l'échappatoire n'est plus nommée | 🔴 |
| le plafond du compteur disparaît | 🔴 |
| le compteur n'est plus alimenté | 🔴 |

Deux tests existants **retournés, pas supprimés**, avec le pourquoi écrit dedans
(`meal_generation_test.ts`) — ils épinglaient `THE ONE EXCEPTION`, la formulation
même qui portait le défaut.

## ⚠️ Portée — à savoir avant de commiter

`meal_generation.ts` porte le **TRONC**, partagé par la lane individuelle
(`generate-meal-v1`) **et** la lane foyer. Le changement s'applique aux deux.
C'est voulu — le défaut est identique des deux côtés et le bloc est unique — mais
ce n'est pas un changement « foyer seulement ».

⚠️ Le fichier porte **1 790 lignes ajoutées / 455 retirées non commitées d'autres
sessions**. Toute mesure `git diff` contre `HEAD` sur ce fichier mélange leur
travail et le mien. Commiter par pathspec, après relecture de leur diff.

## Ce qui reste ouvert

1. **Aucun run réel.** Le lot est prouvé sur les tests et sur l'archive, pas sur
   une génération. La recette réelle est : régénérer, lire `unquantified_terms`
   dans les issues, et vérifier qu'aucun ALIMENT n'y figure. ⚠️ Redémarrer le
   runtime d'abord (`docker restart supabase_edge_runtime_Sophia_2`) — il sert
   des `_shared` périmés et un fichier modifié n'est PAS rechargé.
2. **La latence n'est pas mesurée.** +19 tokens est négligeable contre le mur des
   4 min, mais « négligeable » est une déduction, pas une mesure.
3. **`bread` / `sourdough bread` restent ambigus** (tranche 35 g vs miche 800 g).
   Le prompt les couvre désormais — il exigera un nombre — mais le lot 0-B ne
   doit toujours PAS leur inventer un `unit_grams`.
4. **Le lot 0-C (classe fermée des condiments) est maintenant mesurable** : c'est
   exactement ce que `unquantified_terms` rendra après un run réel.
