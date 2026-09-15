# QA en conditions réelles — 2026-08-11

Harnais : `scratchpad/qa_real_generation_20260811.ts`
Fixture : `meals-demo@test.dev` (`fat_loss`, coach à doctrine publiée, 2 convictions)
Modèle : `gpt-5.6-sol` · consigne `meal.en.v8_distinct_health_direction`

---

## 0. Ce qui n'a PAS pu être testé, et pourquoi

**La couche HTTP.** `supabase functions serve` recrée le conteneur du runtime à
chaque sauvegarde de fichier. Mesuré : le conteneur n'a **jamais tenu plus de
11 secondes** pendant qu'une autre session écrivait dans le dépôt. Une
génération prend 120 s — elle ne peut pas aboutir, et Kong rend un 502 qu'on
prendrait à tort pour un défaut du produit.

Les tests portent donc sur la **même chaîne sans HTTP** : vraies données de la
base, vrai `buildMealPrompt`, vrai appel modèle, vrai `parseGeneratedMeal`.
Non couverts : authentification, routage, et les écritures en base de l'edge
function.

---

## 1. Le résultat principal : **avec un profil complet, toute la chaîne marche**

Fixture peuplée de bout en bout — taille 178, sexe, date de naissance, série de
trois poids (94 → 93 → 92), tour de taille, rythme avec tailles de repas,
temps de cuisine, apport fixe (shaker 30 g au petit-déjeuner, `replaces_meal`),
propriétés de jour, et une situation en prose.

**L'enveloppe se calcule :**

```
mode = per_kg   energy = 2279–2362 kcal   proteinFloor = 184 g/j   densityCeiling = 1,3
```

**Les neuf injections de consigne passent :** taille · poids daté · bande d'âge ·
sexe · apport fixe · propriété de jour · situation · doctrine · **et aucun
chiffre d'énergie sur la personne**.

**Le moteur de composition résout réellement :** index chargé depuis la base,
4/5 ingrédients résolus, `1 tbsp` d'huile → **15 g**, valeurs nutritionnelles
et drapeaux sentinelles par aliment (skyr → calcium ✓, B12 ✓), et
« quinoa flakes » non résolu **signalé, pas deviné**.

**Et la sortie montre que le contexte est compris :**

```
mon/lunch   — Lemon chicken pitta with crisp leaves
tue/lunch   — Chicken and vegetable CANTEEN plate      ← « je mange à la cantine le midi »
tue/dinner  — LATE-SHIFT chicken and crunchy slaw wrap ← « je travaille tard le mardi »
```

Aucun petit-déjeuner en semaine : **le shaker n'est pas dupliqué.**

### ⚠️ Une statistique que j'avais mal lue

Une première lecture disait « 142 élèves sur 143 n'ont pas de taille, donc le
moteur est muet pour 99 % de la base ». **C'est faux comme diagnostic
produit.** Ces 143 lignes datent du 4 au 8 août, c'est-à-dire d'avant le champ
« Basic info » qui collecte taille, sexe et naissance. Le seul profil qui les
porte est celui du propriétaire — preuve que la collecte fonctionne.

La statistique mesurait l'âge des fixtures, pas un trou. Ce qui reste vrai, et
utile : **sans poids, l'enveloppe dégrade en `per_portion` et tout l'étage de
verdicts se tait** — c'est le comportement voulu, pas un défaut.

---

## 2. La génération réelle — elle marche, et bien

**Scénario 1 · nominal (`fat_loss`, 3 jours, coach)**

| | |
|---|---|
| plats composés | **12** |
| liste de courses | **47 lignes** |
| ingrédients grammés | **48/48** |
| latence | **120 s** |
| taille du prompt | 12 986 caractères |

Exemple de sortie :

```
« Skyr, berry and oat bowl » (mon / breakfast)
  - skyr (170 g)  - rolled oats (40 g)
  - berries (100 g)  - pumpkin seeds (1 tbsp)
```

Deux issues remontées par le parseur :
- `structured_quantity_missing: 3/48 ingredients` — 6 % des ingrédients
  n'ont pas les champs `amount/unit/state`
- `composition_index_unavailable` — attendu ici (le harnais passe
  `composition: null`), à revérifier dans la vraie fonction

**Scénario 3 · le corps et le plancher TCA** — 5/5. Taille et poids daté
entrent dans la consigne ; sous `restriction_flag`, **aucune mesure ne fuit**,
ni dans les blocs ni dans la consigne complète.

---

## 3. Le défaut trouvé — et il n'était trouvable qu'en réel

**Scénario 2 · régime végan.** Le modèle a composé trois plats au
`unsweetened soy yogurt` — exactement ce qu'il fallait faire. **Ma garde a
mordu dessus**, parce que `yogurt` est dans les formes laitières et que
« soy yogurt » le contient. Idem pour `peanut butter`, attrapé par `butter`.

> Une fois le verrou câblé en **rejet dur**, il aurait vidé les plans des
> végans — les seuls qu'il existe pour protéger. Une garde qui casse sur sa
> population cible est pire qu'une garde absente : elle a l'air de marcher.

**Corrigé** (`dietary_regime.ts :: isPlantAnalogue`), et la première tentative
de correctif a été tuée par son propre test symétrique : chercher des
*marqueurs* en mot entier faisait de **« riz au lait »** un analogue végétal.
Le français distingue « lait de riz » de « riz au lait » par la seule
préposition — aucune heuristique de mots ne le rattrape.

Retour à la doctrine du fichier : **liste plate, fermée, écrite à la main,
jamais une inférence.** Deux listes — les mots qui suffisent seuls (`vegan`,
`tofu`, `plant-based`…, qu'aucun produit animal ne porte) et les locutions
nommées une par une.

Rejoué en réel après correctif : **12 plats, zéro violation**, `soy yogurt` et
`peanut butter` correctement exemptés.

---

## 4. Audit de câblage

| Module | État |
|---|---|
| `generation_model` | ✅ 2 appelants |
| `dietary_regime` | ✅ 1 appelant |
| `fixed_intakes` | ✅ 2 appelants |
| `day_properties` | ✅ 2 appelants |
| `meal_verdict` | ✅ 2 appelants |
| `composition_steering` | ✅ 4 appelants |
| `activity_stance` | ⚠️ seulement par `activity_floor` |
| **`plan_feedback`** | ❌ **aucun appelant — inerte** |
| **`activity_floor`** | ❌ **aucun appelant — inerte** |

Conforme à ce qui était annoncé : les noyaux des chantiers E et F sont écrits
et testés, le câblage attend que `doctrine.ts` soit libre.

---

## 5. Deux casses préexistantes (ni les miennes, ni de ce chantier)

- `daily_recommendation_test.ts` — 6 erreurs de type, fichier committé et non
  modifié
- `day_properties_test.ts` — attend `v7`, le code est en `v8` (bump non
  répercuté)

Sur **2110 tests**, ce sont les deux seuls rouges.

---

## 6. Recommandations, par ordre de valeur

### 1. Renouveler les fixtures QA — elles datent d'avant la moitié du produit

Les 143 personas ont été créés du 4 au 8 août, avant « Basic info », avant les
apports fixes, avant les propriétés de jour. **Une QA sur ces fixtures teste le
produit d'il y a une semaine** et rend des verdicts `not_computable` qu'on
prend pour des défauts — c'est exactement ce qui m'est arrivé.

Un script de peuplement (`scratchpad/populate_fixture.sql` en donne la forme)
qui remplit un persona *complet* devrait accompagner le harnais. Sans lui, le
prochain qui teste conclura la même chose que moi, à tort.

### 2. La latence est un risque de production immédiat

**120 s pour 3 jours.** Le timeout Kong local est à 150 s, et l'hébergé est du
même ordre. Un plan de **7 jours** — le cas nominal — passera très
probablement au travers.

Trois pistes, par ordre de coût : mesurer d'abord 7 jours (une commande),
étendre le timeout (`scripts/local_extend_kong_functions_timeout.sh` existe
déjà pour le local), ou découper la génération.

C'est une conséquence directe du passage à `gpt-5.6-sol` : le mini était
probablement plus rapide. Le banc d'essai du chantier A doit **mesurer la
latence**, pas seulement la qualité.

### 3. Câbler le verrou de régime avant de lui faire confiance

Aujourd'hui le régime n'atteint la consigne que par le **texte libre** de
`context`. La sortie était correcte, mais parce que le modèle est bon — pas
parce que le produit le garantit. Le rejet au parseur (FF-042 §3) est ce qui
transforme une chance en garantie.

**Et il ne doit pas être câblé sans `isPlantAnalogue`** : sans elle, le verrou
casse sur les végans.

### 4. Les 6 % d'ingrédients sans quantité structurée

`structured_quantity_missing: 3/48`. Chaque ingrédient sans `amount/unit/state`
est un ingrédient dont les grammes ne se calculent pas, donc un trou dans
l'enveloppe. À suivre comme métrique après chaque bump de consigne.

### 5. Réparer les deux casses préexistantes

Petites, et elles polluent chaque run de la suite — donc elles entraînent à
ignorer le rouge.

### 6. Deux pièges d'environnement à documenter

- **`--env-file` de Deno casse silencieusement** sur une valeur non quotée
  contenant des espaces (`supabase/.env` en a une : « Sofia on earth »). Les
  variables suivantes ne sont pas chargées, et l'erreur qui en résulte est un
  `401 Incorrect API key: undefined` — parfaitement trompeur.
- **Aucun test HTTP réel n'est possible pendant qu'une session écrit dans le
  dépôt.** À dire dans le mode d'emploi QA, sinon chaque 502 sera diagnostiqué
  comme un bug produit.
