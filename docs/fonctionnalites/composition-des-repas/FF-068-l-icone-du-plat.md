# FF-068 · L'icône du plat — l'aliment principal, dessiné

| | |
|---|---|
| **Identifiant** | `FF-068-l-icone-du-plat` |
| **Statut** | 🟠 En cours — code écrit le 2026-09-25, non commité, non déployé |
| **Date** | 2026-09-25 |
| **Autorité produit** | [CLAUDE.md](../../../CLAUDE.md) (le modèle produit) |
| **Dépend de** | `food_composition_refs.family` (2026-09-23), `grams_raw` sur les lignes (FF-038) |
| **Effort estimé** | 1 jour |

---

## 1. Le problème

Un plan est une liste de titres en texte : « Poulet rôti, riz et brocoli »,
« Petit-suisse, avoine, lait, fruits rouges et amandes ». On ne repère pas un
plat d'un coup d'œil. Chaque plat est composé sur mesure : générer une image
par plat coûterait une génération d'image par repas, pour une image qu'on ne
revoit jamais.

## 2. Job stories

- Quand je parcours mon plan de la semaine, je veux reconnaître chaque plat à
  son aliment principal sans lire le titre, pour retrouver vite le dîner du
  jeudi.

## 3. Périmètre

### Dans le périmètre
- Le serveur choisit UN aliment principal par plat et l'écrit sur le plat
  (`main_food`).
- L'écran en tire une icône, dans une banque fixe (environ 130 familles et
  20 groupes), et l'affiche à gauche du titre dans `DishCard`.

### Hors périmètre — engageant
- ❌ Générer une image par plat.
- ❌ Chercher l'aliment dans le TITRE. Le titre est écrit par le modèle, dans
  la langue du foyer ; seul le référentiel (`ref` de chaque ligne) nomme un
  aliment sans se tromper (« laitue » contient « lait »).

## 4. Le circuit

```
generate-household-meal-v1
  dishes + preparationsWritten (la charge écrite)
    └─ readAvoidPlan → mainFoodsOf(plan, composition)      dish_main_food.ts
         └─ dishes[i].main_food = { family, group } | null   (en place)
              ├─ student_meal_drafts.response   (l'aperçu)
              ├─ student_generated_meals.dishes (le plan écrit)
              └─ log keel.household_meal.main_food { dishes, named, by_protein, no_index }

frontend
  readDishes → GeneratedDish.main_food
    └─ foodIconOf(main_food)   lib/foodIcon.ts : famille, puis groupe, sinon null
         └─ DishCard : pastille ronde à gauche du titre, aria-hidden
```

## 5. Modèle de données

- `food_composition_refs.family` : remplie pour les légumes et les fruits par
  `20260925093000_un_legume_a_une_famille.sql` (213 lignes : `tomato_cherry`,
  `passata` → `tomato`). Les protéines et féculents l'étaient depuis le
  2026-09-23.
- `dishes[i].main_food` dans le JSON du plan : `{ family, group }` ou `null`.
  Dérivé par le serveur, jamais saisi, jamais déclaré par le modèle.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | La protéine la plus lourde d'abord (viande, poisson, œufs, légumineuses, tofu — pas le yaourt). Sans protéine, le végétal le plus lourd (légume, féculent, fruit). Sans végétal, le laitage. | Au poids cru, 200 g de brocoli pèsent plus que 150 g de poulet : « poulet, riz, brocoli » aurait l'icône du brocoli. La protéine nomme le plat. |
| R2 | Le plat est lu AVEC les préparations qu'il utilise, au prorata de la part tirée. | En cuisine par lots, le poulet vit dans la préparation, pas dans le plat. Même lecture que la liste « à éviter ». |
| R3 | On additionne par famille, pas par slug. | `chicken_breast` + `chicken_leg_meat` = du poulet. |
| R4 | Moins de 20 g (`INGREDIENT_MIN_G`) : une pincée, ignorée. Poids inconnu : 0 g. | Le parmesan râpé ne nomme pas un plat. |
| R5 | Les à-côtés (`side_courses`) ne sont pas lus. | Le pain servi à côté n'est pas l'aliment du plat. |
| R6 | L'écran cherche la famille, puis le groupe, par clé EXACTE. | Pas de recherche de sous-chaîne. |
| R7 | `main_food` est écrit même à `null`. | « Rien de reconnu » se distingue d'un plan écrit avant ce lot. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Plan écrit avant le 2026-09-25 | Pas de `main_food` ⇒ pas d'icône ; la ligne est celle d'avant. |
| Référentiel non chargé | Tous les plats à `null`, `no_index: true` dans le log. |
| Famille sans icône (poisson, ligne du sas) | Icône du groupe (🐟). |
| Poids de la protéine absent | Elle compte 0 g : une protéine pesée ou une légumineuse (houmous) passe devant. Mesuré sur un plan du 2026-09-21 : « Poulet, tortillas, houmous… » → 🫘. Les plans du 2026-09-23 n'ont plus de protéine non pesée. |
| Windows 10 | Les emojis récents (🫘 🫑 🫒 🫐 🫛 🫚) s'affichent en carré vide. |

## 8. Critères d'acceptation

```gherkin
Étant donné un plat avec 150 g de poulet, 80 g de riz et 200 g de brocoli
Quand le plan est composé
Alors le plat porte main_food = { family: "chicken", group: "poultry" }
Et DishCard affiche 🍗 à gauche du titre

Étant donné un plan écrit avant le 2026-09-25
Quand il s'affiche
Alors aucun plat n'a d'icône
```

Tests : `supabase/functions/_shared/keel/dish_main_food_test.ts` (17),
`frontend/src/keel/lib/foodIcon.int.test.ts` (10).

## 9. Rabbit holes

- Les emojis dépendent du système. Pour un rendu identique partout, remplacer
  les valeurs de `FAMILY_ICONS` / `GROUP_ICONS` par des dessins (SVG) sans
  toucher aux clés.

## 10. Ce qu'on mesure

- `keel.household_meal.main_food` : `named / dishes` (doit rester proche de
  100 %), `by_protein`.
- Mesure du 2026-09-25 sur les 3 derniers plans locaux : 71 plats, 71 nommés,
  0 sans icône, 42 nommés par leur protéine.

## 11. Questions ouvertes

- Dessins maison ou jeu d'emojis sous licence libre (Fluent Emoji, MIT) à la
  place des emojis du système.
