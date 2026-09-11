# FF-065 — Le plancher du budget : ce qu'aucun panier ne peut descendre

> **Statut** : 🟢 Livré le 2026-09-11 — écrans, moteur, tests. Aucun run modèle.
> **Décidée le** 2026-09-11 par le propriétaire.
> **Autorité** : ce fichier. Le module est
> [`supabase/functions/_shared/keel/budget_floor.ts`](../../../supabase/functions/_shared/keel/budget_floor.ts).
> La mesure qui produit ses nombres est
> [`scratchpad/2026-09-11-PLANCHER-BUDGET/mesure.sql`](../../../scratchpad/2026-09-11-PLANCHER-BUDGET/mesure.sql),
> et elle se rejoue.

## 1. Le défaut

`budget_amount` n'avait que deux bornes : `> 0` et `≤ 5 000`. On pouvait donc
demander **sept jours pour quatre personnes avec 1 €**, et le prompt partait
avec :

```
budget for this plan: 1, in the local currency of their country. It covers the
WHOLE shopping list … it is a ceiling, not a target.
when that budget is tight … cut in THIS order: expensive proteins first …
NEVER cut the portions themselves.
```

**Le modèle ne refuse jamais un plafond.** Il coupe, dans l'ordre qu'on lui
donne, et quand l'ordre ne suffit plus il rend un plan qui a l'air de tenir.
Toute la composition arbitre alors contre une contrainte imaginaire, et le seul
poste qui reste à rogner est celui que tout le reste du prompt calcule.

Et rien ne le rattrape après coup. Mesure L30b du 2026-08-23, sur 193 plans :
`0 violation démontrée`, pour la seule raison que **92 % des plans n'ont pas de
coût connu**. Le budget était une promesse sans lecteur.

## 2. D'où viennent les nombres

De la grille de prix du dépôt (`food_composition_refs.price_eur_per_100g_fr` et
`…_usd_per_100g_us` — 893 et 843 lignes chiffrées sur 943 au 2026-09-11), lue
sur des **paniers nommés**. Un panier se vérifie ligne à ligne ; un centile de
groupe ne se vérifie pas — le safran et les lentilles vivent dans le même groupe
à quatre ordres de grandeur d'écart.

Par personne et par jour, ramenés à 2 000 kcal :

| Panier | kcal | protéines | FR | US |
|---|---|---|---|---|
| **Minimum** — pâtes, lentilles, pomme de terre, carotte, oignon, tomate, huile | 1 992 | 77 g | **2,65** | 3,77 |
| Minimum sans gluten — les pâtes deviennent du riz | 2 115 | 67 g | 2,77 | **3,45** |
| Frugal — omnivore (pain, œufs, yaourt, un pilon) | 2 045 | 91 g | 3,77 | 4,15 |
| Frugal — végétarien | 2 267 | 96 g | 3,45 | 3,92 |
| Frugal — végane | 2 644 | 114 g | **3,19** | 3,46 |
| Frugal — sans gluten | 2 234 | 99 g | 3,92 | 4,27 |

Repère : les plans réellement composés coûtent 4,4 à 4,6 €/1 000 kcal, soit
environ **2,5 fois** le panier frugal. Ce plancher ne gêne personne de normal.

### ⛔ Le fait qui gouverne tout le module

**Le panier minimum est déjà végétalien.** La façon la moins chère de nourrir
quelqu'un est donc la même pour un carnivore et pour un végane, et les quatre
régimes de l'axe animal partagent leur plancher. Le régime ne le déplace que là
où il retire un aliment **bon marché** : le gluten, et seulement en France — aux
États-Unis le riz coûte moins cher que les pâtes, et la variante sans gluten y
devient le panier le moins cher pour tout le monde.

Là où le régime compte vraiment, c'est sur le seuil d'explication, et dans le
sens qu'on n'attend pas : **le jour frugal d'un végane est le moins cher des
cinq**. C'est la même mesure qui dit qu'un budget serré pousse un plan vers le
végétal — sauf qu'ici elle le dit en euros, avant la composition, au lieu de le
faire découvrir après.

## 3. Deux seuils, deux natures

```
plancher = Σ sur chaque bouche  (prix de son panier minimum × ses journées)
seuil    = Σ sur chaque bouche  (prix de son panier frugal  × ses journées)
```

- **Sous le plancher, l'écran REFUSE**, et il dit le montant qui lève le refus.
  Un refus sans son chiffre se cherche par essais successifs : c'est un bouton
  mort avec une phrase dessus.
- **Entre les deux, rien ne retient.** L'écran dit ce que ce budget va
  *changer* — « ce sera surtout des légumes secs, des œufs et des féculents, et
  des plats reviendront ». C'est le cas de quelqu'un qui mange de la viande, qui
  a peu d'argent, et à qui le modèle proposera naturellement plus de végétal :
  c'est entendable, ça ne se refuse pas, ça se dit.

### Les journées de bouche, et elles ont le droit d'être des fractions

L'unité n'est ni la personne ni le jour : c'est **la part de sa journée que le
plan compose pour elle**, lue par `dayCoverageOf` — la table `SLOT_DAY_WEIGHT`,
celle qui dimensionne déjà son assiette, jamais un second avis.

Conséquence à connaître : **quelqu'un qui ne dîne que le soir vaut 1, pas 0,35.**
La table normalise par ce que la bouche déclare, et pour elle le dîner *est* sa
journée. Ce qui descend sous 1 n'est donc pas un rythme court — c'est une
absence : un midi dehors, un jour parti. « Dehors » et « absent » comptent
pareil ici, et seulement ici : le plancher parle d'argent, et dans les deux cas
il n'y a rien à acheter.

## 4. Où ça vit

| Où | Ce qui s'y passe |
|---|---|
| `_shared/keel/budget_floor.ts` | l'arbitre : les deux tables, le marché, les journées de bouche, le verdict |
| `api/planBudget.ts` | la moitié écran : `readBudgetMarket`, `budgetMouthsFor` |
| `MealBuilder.tsx` · `SetupPage.tsx` | le refus et la phrase, **à côté du champ** |
| `SetupPage.tsx`, avant `composeDraft` | le second refus, sur des faits **relus** |
| `meal_generation.ts#buildMealPrompt` | sous le plancher, la ligne de plafond **ne s'écrit pas** |
| `generated_from.budget_floor` | ce que le prompt a fait, compté |

**Le moteur ne refuse rien.** Le refus appartient au champ : c'est le seul
endroit où quelqu'un peut corriger sa réponse, et ce dépôt a payé trois fois la
cicatrice « refus loin du geste = bouton mort ». Ce que le moteur décide est
plus étroit — *ce plafond a-t-il le droit d'entrer dans le prompt* — et quand la
réponse est non, **les deux lignes partent**, pas seulement le chiffre : garder
l'ordre de sacrifice sans le montant demanderait au modèle d'appauvrir un plan
au nom d'une contrainte qu'on vient de juger inapplicable.

## 5. ⚠️ Ce que ce plancher n'est pas

- **Ce n'est pas une estimation.** Le budget couvre toute la liste de courses ;
  ces paniers ne couvrent que des assiettes. Le plancher est donc
  structurellement **sous-estimé** — la bonne direction pour un plancher, la
  mauvaise pour un chiffre qu'on afficherait comme « ton plan coûtera X ». Il ne
  doit jamais se rendre autrement que comme un minimum.
- **Ce n'est pas indexé sur les corps.** Une bouche vaut une part de journée, pas
  un métabolisme : la cible énergétique demande un corps que le formulaire ne lit
  pas, et qui est fermé à quatre motifs (mineur, plancher de restriction, âge
  inconnu, doctrine sans comptage). **Conséquence assumée : un foyer avec de
  jeunes enfants a un plancher un peu trop haut.** Ce qui l'amortit est que le
  refus s'appuie sur le panier *minimum* (≈ 70 % du frugal) pendant qu'un enfant
  mange ≈ 50 à 70 % d'un adulte. Aucun coefficient d'âge n'est inventé :
  inventer un nombre pour corriger l'absence d'un autre en fait deux.
- **Ce n'est pas saisonnier.** La tomate varie de ±35 % dans l'année et la grille
  ne le porte pas.
- **Il n'existe que sur deux marchés.** Hors de France et des États-Unis, le
  module **s'abstient** : pas de plancher, pas de refus, pas de conversion
  inventée. Un compte marocain garde exactement le comportement d'hier.
- **Aucun chiffre de calories n'en sort.** La journée de référence (2 000 kcal)
  ne sert qu'à ramener les six paniers au même dénominateur ; rien de ce que le
  module rend ne porte autre chose que de l'argent.

## 6. Ce qui reste ouvert

- **Aucun run modèle.** Le lot est mesuré sur la grille et gardé par des tests ;
  il n'a pas tourné sur une vraie génération.
- **Le coût réel d'un plan n'est toujours pas vérifié.** `meal_cost.ts` sait le
  compter et s'abstient dès qu'une ligne manque ; il reste un instrument de
  script, sans lecteur dans le produit. Le plancher borne l'ENTRÉE ; personne ne
  mesure encore la SORTIE.
- **Le régime du titulaire n'est pas lu dans l'entonnoir.** `presenceRoster`
  fabrique sa ligne avec `diet: null`, donc son seuil d'explication est celui
  d'un omnivore — le plus haut. Effet : une phrase de plus, jamais un refus de
  plus.
