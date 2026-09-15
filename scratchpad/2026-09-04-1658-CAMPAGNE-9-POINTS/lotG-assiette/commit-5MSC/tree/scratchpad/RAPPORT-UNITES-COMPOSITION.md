# Rapport de PHASE I — les unités de composition

**Date** : 2026-08-10 · **Périmètre** : étapes 1 à 4 du chantier
**Design d'origine** : [`DESIGN-UNITES-DE-COMPOSITION.md`](DESIGN-UNITES-DE-COMPOSITION.md)
**Plan** : [`PLAN-IMPLEMENTATION-UNITES-DE-COMPOSITION.md`](PLAN-IMPLEMENTATION-UNITES-DE-COMPOSITION.md)

---

## ⛔ LA GATE DES 80 % — **PASSÉE**

| | |
|---|---|
| **Couverture de résolution médiane, par repas** | **96,2 %** |
| Seuil | 80 % |
| Repas sous 80 % | **0 / 69** |
| p10 / p25 | 88,9 % / 93,4 % |
| Médiane par plat | 100 % |
| Repas dont l'énergie serait calculable (règle FF-039 R6) | 510 / 603 plats (**84,6 %**) |
| Plats bloqués par un ingrédient DENSE non résolu | 5 |

Mesuré sur les **69 repas / 603 plats / 2 728 ingrédients** réellement présents en
base locale, par `scratchpad/replay-composition.ts`.

**Aucune passe de curation d'alias n'a été nécessaire** — le protocole de
rattrapage (2 × 50 alias) n'a pas été utilisé. Les 756 alias du seed initial
suffisent.

**Conséquence : la phase II (étapes 5 à 8) est autorisée à démarrer.** Elle a
été enchaînée dans le même run — **rapport de phase II en fin de document**.

---

## 1. Ce qui est livré, étape par étape

### Étape 1 — L'ancre protéique (FF-037)

| | |
|---|---|
| `tokens.ts` | `PROTEIN_SOURCES` : **10** des 30 `FOOD_GROUP_REFS`, typé `satisfies`, pas une seconde taxonomie |
| `protein_anchor.ts` | lexique EN+FR par groupe, apparié par `findForbiddenMatches` en **mode audit**, liste fermée de disqualification (`egg noodles`, bouillons, fonds) |
| Consigne | `PROTEIN_ANCHOR_PROMPT_LINE`, qualitative, **zéro chiffre** (testé au filtre numérique du produit) |
| Parseur | issue `protein_source_missing`, **le plat passe** (pass-with-issue) |
| Relance | **une seule**, sur les DEUX lanes (individuelle et foyer), adoptée uniquement si elle rend ≥ autant de plats et strictement moins de manques |
| Version | `meal.en.v4_student_body` → `meal.en.v5_protein_anchor` → `meal.en.v6_structured_quantities` |

**Mesure AVANT, sur les 603 plats déjà en base :**

```
repas principaux                498   (collations 93, plats sans créneau 12)
  dont porteurs d'ancre         485   (97,4 %)
  sans ancre                     13   ( 2,6 %)
```

**Les 13 manques, un par un — et il n'y a AUCUN faux positif du lexique :**

| n | cas | jugement |
|---|---|---|
| 8 | petits-déjeuners « peanut butter toast + fruit » | **vrai manque**, `nuts_seeds` exclu par l'arbitrage écrit (FF-037 §9) |
| 2 | porridges (flocons + lait + fruit) | **vrai manque** |
| 1 | « Tomato and basil pasta with mozzarella » | **vrai manque**, `dairy_cheese` exclu par le même arbitrage |
| 1 | « Traybake **sausage**, potatoes and peppers » | ⚠️ **la saucisse est dans le TITRE et absente des ingrédients** |
| 1 | « **Salmon**, potatoes and green beans » | ⚠️ **le saumon est dans le TITRE et absent des ingrédients** |

Les deux derniers sont le résultat qui justifie la vérification au parseur : le
modèle a nommé la protéine dans le titre et l'a oubliée dans la liste
d'ingrédients — **donc dans la liste de courses**. L'élève partait faire ses
courses sans le saumon de son dîner, et rien ne le disait. Le taux de faux
positifs du lexique (la contre-mesure du §10 de FF-037) est de **0 sur 13**.

### Étape 2 — Le référentiel de composition (FF-038, étage A)

| | |
|---|---|
| Migration | `20260810160000_food_composition_refs.sql` — 2 tables, **208 aliments, 756 alias** |
| Source | **ANSES-CIQUAL 2020** (XML, licence Etalab, via data.gouv.fr) — 192 entrées ; **16 entrées `source = 'manual'`** pour ce que Ciqual ne contient pas (skyr, cottage cheese, halloumi, huile de coco, graines de courge…) |
| Traçabilité | `ciqual_code` + `ciqual_name` sur chaque ligne : on peut relire de quelle ligne ANSES la valeur sort |
| Hygiène | `revoke all … from anon, authenticated` + RLS sans politique. **Vérifié en base** : `anon` et `authenticated` n'ont aucun privilège |
| RGPD | **pas de réclamation, et l'absence est écrite dans la migration** — donnée de référence, aucun `user_id` |
| Rejouabilité | **prouvée** : la migration réappliquée à la main sur la base vivante passe (`on conflict do update`) |
| Module | `food_composition.ts` (pur) + `food_composition_io.ts` (lecture) |
| Générateur | `scratchpad/ciqual_catalogue.py` + `gen_composition_seed.py` + `emit_seed_sql.py` — le seed se **régénère** |

Deux points où l'extraction a dû décider, et les deux sont écrits :

- **Ciqual laisse le champ énergie vide pour ~28 % de ses aliments** (le miel en
  fait partie) tout en donnant les macros. L'énergie est alors **calculée** par
  l'arithmétique que la constante porte dans son nom (Règlement UE 1169/2011 :
  4/4/9, fibres à 2). Ce n'est pas une invention, c'est la définition.
- **Ciqual n'a pas d'énergie pour beaucoup de formes CRUES** (« Brocoli, cru »
  n'en porte aucune). L'extraction retient alors la forme qui en a — et
  `ciqual_name` dit laquelle, pour qu'on puisse juger l'écart.

### Étape 3 — Les quantités structurées (FF-038, étage B)

- `DishIngredient` gagne `amount` / `unit` / `state` **et `gramsRaw`**, ce
  dernier **recalculé par le parseur** et jamais lu d'un champ du modèle
  (précédent `in_pantry` — testé nommément avec un `grams_raw: 9999` menteur).
- Le contrat JSON du prompt système porte les trois champs, avec la règle
  « `state` obligatoire pour ce qui prend ou perd de l'eau ».
- `composition: CompositionIndex | null` est **REQUIS** sur `parseGeneratedMeal`.
  La casse de compilation a recensé **8 sites d'appel** (2 edge functions,
  6 fichiers de test) — c'est le mécanisme, pas un accident.
- Migration `20260810180000_food_composition_unit_grams.sql` : **28 aliments**
  portent un poids d'unité, pour que « 3 œufs » se pèse. Les autres restent
  `null` — « 2 courgettes » n'a pas de poids honnête.
- Deux compteurs distincts : `structured_quantity_missing` (le contrat) et
  `unweighedTerms` (le référentiel). Les confondre ferait chercher des alias
  pour un problème de prompt.

### Étape 4 — Enveloppes et verdicts, en observation (FF-039)

- `meal_envelope.ts` : l'union à deux formes. `per_portion` **ne porte
  structurellement ni énergie ni plafond de densité** — prouvé par deux
  `@ts-expect-error`, qui échoueront le jour où quelqu'un fusionne les formes.
- **Indiscernabilité prouvée par égalité de chaînes**, et sur **les six
  dynamiques** : `{"mode":"per_portion","proteinPortionPerMeal":true}` pour un
  élève flaggé, pour un corps absent, et pour un corps sans poids.
- **A1 tenu** : aucun paramètre ne lève le plafond de 500 kcal/j (la signature
  est la preuve, et le test la vérifie ; elle est passée à **cinq** paramètres à
  l'étape 6 — le cinquième est le pilotage du coach, et lui non plus ne peut
  pas le lever).
- `meal_verdict.ts` : abstention avant erreur, protéine en **grammes calculés**
  rendue en **mots**, abstention aqueuse sur la densité (EN+FR), sentinelles
  dérivées du référentiel.
- Table `meal_composition_verdicts` — service-role, `revoke` vérifié en base,
  `envelope_mode` **sans sa raison**, et **réclamée par le lifecycle RGPD**
  (cascade pour la suppression, ajout explicite dans `account-export-v1`).
- Écriture dans `generate-meal-v1` **après** l'écriture du plan, dans un
  `try/catch` qui ne fait jamais échouer une génération.
- **Le verdict n'est jamais actionné** : la sortie de `parseGeneratedMeal` est
  prouvée profondément égale avec et sans le calcul.

---

## 2. Les deux défauts que la MESURE a trouvés (et pas la relecture)

### a. Le plafond de déficit ne mordait que d'un côté

Sur un gabarit de 140 kg, « M − 15 % » — le HAUT de la bande `fat_loss` — est
déjà un déficit de **556 kcal**. Le code ne remontait que le bas de la bande :
l'enveloppe prescrivait donc un déficit supérieur au plafond **sur toute sa
largeur**, tout en ayant l'air de le respecter. Trouvé par le test qui compare
au plafond plutôt qu'au pourcentage. Corrigé : le plafond remonte les **deux**
bords, quitte à rendre une bande de largeur nulle — le régime « direction » lui
rend sa largeur par la marge de ±10 %, qui vient de l'incertitude de la mesure
et pas d'une tolérance qu'on s'accorderait.

### b. Les sentinelles rendaient 26 groupes sur 30

Première règle : « un groupe est sentinelle si au moins un de ses aliments porte
un drapeau ». Sur le référentiel réel, le seuil réglementaire « source de »
(15 % de la VNR) est atteint par presque tout : `fried_food` à 100 %,
`sauce_dressing` à 63 %. Le verdict annonçait « il te manque 26 groupes cette
semaine » — du bruit, et il aurait armé la correction de l'étape 5 dessus.

Corrigé en deux temps : un groupe est **porteur** d'un nutriment quand **deux
tiers** de ses aliments le portent, et un nutriment **couvert** retire tous ses
porteurs de la liste (du saumon couvre l'oméga-3 : les fruits de mer n'ont plus
à paraître). Trouvé par la vérification de bout en bout contre la vraie base —
aucun test unitaire ne l'aurait vu, parce qu'aucune fixture n'a 208 aliments.

**Ce qui reste, et qui est écrit en FF-039 §11 n°4** : `fried_food` entre encore
dans les porteurs (ses deux entrées sont sources de fer et de zinc). Sans
conséquence aujourd'hui — rien ne lit `missing` — mais un jeton
`place_missing_sentinel` qui le servirait recommanderait de la friture pour
combler un trou en fer. La correction appartient à l'étape 5, et **pas** à une
liste noire écrite à la main, qui divergerait du seed au premier aliment déplacé.

---

## 3. La worklist d'alias

**103 termes distincts non résolus, 234 occurrences.** Complète dans
[`worklist-alias-composition.json`](worklist-alias-composition.json). Les plus
fréquents :

| n | terme | quoi en faire |
|---|---|---|
| 28 | `pepper` | **rien.** Ambigu (poivron / poivre) — retiré des deux listes à la curation. Un terme qui désigne deux aliments doit rester non résolu ; en choisir un serait la devinette que FF-038 R1 interdit. C'est le premier poste de la worklist, et c'est **volontaire**. |
| 17 | `garlic powder` | alias vers `garlic` — réduction franche |
| 6 | `cooked chicken thigh meat` | le résolveur réduit « cooked » mais pas « thigh meat » ; alias |
| 5 | `butter or olive oil` | **rien.** Alternative — disqualifiée par construction |
| 5 | `egg noodles` | alias vers un aliment à ajouter au référentiel |
| 5 | `turkey chilli` | plat composé, pas un aliment — hors référentiel |
| 4 | `breadcrumbs` | aliment à ajouter |

Une bonne part de la queue est faite de **plats composés** (« turkey pasta
bake », « beef and bean chilli ») que le modèle écrit comme un ingrédient parce
qu'ils viennent d'une préparation. Ils ne relèvent pas de la curation d'alias :
ils relèvent de la question ouverte de FF-039 §11 n°2 (comment attribuer la part
d'une préparation à un plat).

---

## 4. Vérifications

| | |
|---|---|
| `deno test` sur `_shared/keel/` | **1 839 passés, 0 échec**, sans `--no-check` |
| `tsc -p frontend/tsconfig.app.json --noEmit` | **0 erreur** |
| Migrations : doublons de version | `uniq -d` vide |
| Migrations : rejouabilité | les 3 réappliquées à la main sur la base vivante, sans erreur |
| Grants | `anon` et `authenticated` : aucun privilège sur les 3 tables neuves |
| Chaîne base ↔ code | `scratchpad/verdict-smoke.ts` : chargement du référentiel réel (208/755), enveloppe, verdict, écriture, **retrait de la ligne de test** |
| Front | `readIngredients` ignore les quatre champs neufs — **vérifié fichier en main**, aucun changement front nécessaire |

### ⚠️ Deux fichiers de test étaient DÉJÀ cassés sur `main`

`deno test` sur le dossier entier échoue au typecheck sur deux fichiers que ce
chantier ne touche pas et qui sont **propres vis-à-vis de HEAD** :

- `daily_recap_io_test.ts` — `offPlanCount` / `DayFacts`
- `daily_recommendation_test.ts` — `.reason` sur `RecommendationDecision`

Ils sont **exclus** de la commande ci-dessus. Ce ne sont pas mes régressions,
et les corriger n'est pas mon périmètre.

**Une exception assumée** : `household_meal_generation_test.ts` était cassé de
la même façon (`memberUserId` → `memberId`, renommé par le commit `9dc442d2` et
pas suivi dans son test). Je l'ai corrigé — quatre renommages mécaniques —
parce qu'il bloquait la vérification que le plan me demande de faire. Zéro
changement de comportement.

---

## 5. Ce qui n'est PAS fait, et pourquoi

### a. Aucun commit

**Le dépôt porte un autre chantier en cours dans les mêmes fichiers.** Vérifié :
`generate-meal-v1/index.ts` et `generate-household-meal-v1/index.ts` portaient
déjà, avant que j'y touche, des modifications non commitées d'une autre session
(le lot « corps par membre » du chantier foyer — `household_portions.ts`,
`meal_body.ts`, `generate-week-plan-v1`, et douze fichiers front).

Committer ces deux fichiers emporterait le travail inachevé de l'autre session ;
ne committer que mes fichiers purs produirait une étape 1 à moitié posée. Les
deux sont pires que de laisser l'arbre de travail tel qu'il est, ce qui est
l'état dans lequel l'autre session l'a mis. **Tout est dans l'arbre de travail,
rien n'est perdu, et le découpage en commits appartient au propriétaire.**

Deux autres sessions ont par ailleurs posé des migrations pendant ce run
(`20260810140000_dietary_regime_constraint`,
`20260810170000_household_member_allergies`) : mes trois migrations ont été
renumérotées en conséquence (160000, 180000, 190000) et `uniq -d` est vide.

### b. Aucun run réel contre un modèle

`supabase/functions/.env` n'existe pas dans ce dépôt : **aucune clé de modèle
n'est disponible localement**, et poser un secret est une commande à validation
humaine. La chaîne base↔code est vérifiée sans modèle
(`scratchpad/verdict-smoke.ts`), les tests couvrent le parseur, mais **la
consigne n'a jamais été soumise à un vrai modèle**.

Reste donc à faire, par le propriétaire, dans cet ordre :

```bash
supabase functions serve --no-verify-jwt
```

(le runtime edge sert des versions périmées des modules `_shared` modifiés —
le redémarrage n'est pas optionnel), puis une génération sur une fixture
**avec plan publié** (sans lui, aucun effet KEEL n'existe), et enfin :

```sql
select prompt_version, count(*),
       count(*) filter (where (generated_from->>'protein_anchor_retry')::bool) as relances,
       avg(jsonb_array_length(generated_from->'protein_anchor_missing')) as manques_moyens
from public.student_generated_meals group by 1 order by 1;
```

```sql
select envelope_mode, count(*), avg(resolution_coverage),
       count(*) filter (where verdict->>'energy' = 'not_computable') as energie_non_calculable
from public.meal_composition_verdicts group by 1;
```

Ce qu'il faut regarder : `rejected_numeric` **ne doit pas monter** après le
double bump de version (c'est la contre-mesure de FF-038 §10 — un contrat qui
gagne trois champs numériques pousse un modèle à écrire des chiffres ailleurs),
et la part d'ingrédients portant `amount`+`unit` doit être élevée.

### c. La phase II

~~Pas démarrée.~~ **Enchaînée dans le même run** : voir le rapport de phase II
en fin de document. Étapes 5, 6 et 8 livrées ; étape 7 (foyer) spécifiée
(FF-043) et **non codée**, parce qu'un autre chantier écrivait en direct dans
ses fichiers.

### d. Trouvé en passant, hors périmètre, non corrigé

Deux lignes de `student_generated_meals` (sur 215) stockent la référence de
préparation sous `preparationId` au lieu de `preparation_id`. Le front ne lit
que la seconde orthographe et **jette la ligne** : pour ces deux plats, l'élève
ne voit pas que le plat puise dans un lot déjà cuisiné. Signalé comme tâche à
part.

---

## 6. Les fichiers

**Fiches** — `docs/fonctionnalites/composition-des-repas/`
`FF-037-l-ancre-proteique.md` · `FF-038-le-referentiel-de-composition.md` ·
`FF-039-enveloppes-et-verdicts-en-observation.md` (+ les deux index)

**Modules** — `supabase/functions/_shared/keel/`
`protein_anchor.ts` · `food_composition.ts` · `food_composition_io.ts` ·
`meal_envelope.ts` · `meal_verdict.ts` (+ leurs 4 fichiers de test)
modifiés : `tokens.ts` · `meal_generation.ts`

**Migrations** — `20260810160000_food_composition_refs.sql` ·
`20260810180000_food_composition_unit_grams.sql` ·
`20260810190000_meal_composition_verdicts.sql`

**Edge** — `generate-meal-v1` · `generate-household-meal-v1` ·
`account-export-v1`

**Outillage** — `scratchpad/` : `ciqual_catalogue.py` (le catalogue curé) ·
`gen_composition_seed.py` · `emit_seed_sql.py` · `replay-composition.ts` (la
gate) · `verdict-smoke.ts` · `worklist-alias-composition.json`

---
---

# Rapport de PHASE II — l'armement

**Date** : 2026-08-10, complété le 2026-08-11 · **Périmètre engagé** : étapes 5 à 8
**Livré : les quatre étapes.** L'étape 7 a été reprise une fois la lane foyer
rendue par le chantier qui l'occupait — voir §5.

---

## 1. Ce qui est livré

### Étape 5 — La boucle de correction (FF-040)

| | |
|---|---|
| `meal_correction.ts` | 6 jetons fermés, mapping verdict→jeton par `switch` **sans `default`** (un verdict nouveau ne compile pas) |
| `DIET_REGISTER_LEXICON` | dans `nutrition_lexicon.ts`, avec `findDietRegisterWord` |
| Préséance adhérence | un jeton qui contredit une déclaration n'est **pas servi**, et c'est compté |
| Relance | **une seule**, adoptée seulement si elle rend ≥ autant de plats **et** réduit le nombre de grandeurs hors bande |
| Ordre | protéine → énergie → densité → sentinelles (la hiérarchie du design), **inversé** sous le plancher de couverture |
| Colonnes | `tokens_served`, `coverage_flag` sur `meal_composition_verdicts` (+ export RGPD) |

**Le verdict remonte AVANT l'écriture du plan.** C'est le seul changement d'ordre
du lot : une boucle qui tournerait après l'écriture corrigerait un plan déjà
servi.

### Étape 6 — Le pilotage du coach (FF-041)

| | |
|---|---|
| Colonne | `coach_doctrines.composition_steering jsonb NOT NULL DEFAULT '[]'`, CHECK de **forme** seulement |
| `composition_steering.ts` | `SteeringEntry` **sans** `deficit_style: "aggressive"` (A1), parse strict et bruyant, `applyPiloting`, `steeredFocus` |
| `composition_forks.ts` | **4 débats**, 13 positions, chacune avec son **effet en langage plan/aliment** ; `deriveSteeringFromPositions` écrit **deux choses** (conviction citable + jeton) |
| `envelopeFor` | gagne `steering` **REQUIS** — la casse de compilation a recensé les appelants |
| Pilotage maison | publié sur la ligne du coach maison existant, **même format, un seul chemin de code** — vérifié en base : `house \| 1` |
| Front | `COMPOSITION_FORKS` exposé par `coachDoctrine.ts`, comme `STARTER_FORKS` |

**Le hash du bloc chat ne bouge pas** — testé sur **les six variantes**, texte et
hash, plus `doctrineCacheFootprint` et `compileAllDoctrineVariants`.

### Étape 8 — Plancher, ré-ancrage, anonymat (FF-040)

| | |
|---|---|
| `meal_coverage.ts` | plancher ~1550 kcal **côté plan** (donc armé même en `per_portion`), `ok` / `unsatisfiable` / `unverified` |
| Ré-ancrage | 5 % par palier après 3 semaines contraires, cumul **borné à 10 %**, `static` ⇒ zéro |
| k = 5 | `aggregateMayShip` **et** `aggregatePairMayShip` — l'inférence par soustraction est bloquée |

---

## 2. Les défauts que la mesure a trouvés, en phase II

### a. « surplus » n'est pas un mot du régime

Le test lexical est tombé sur une phrase du prompt système qui existe depuis des
mois et qui est juste : *« say plainly in the method that the surplus goes in the
FREEZER »*. C'est le **surplus de cuisson**. Le réflexe — réécrire la consigne —
aurait tordu un texte correct pour satisfaire une garde mal calibrée. Corrigé
dans la garde : seules les formes composées entrent (`calorie surplus`,
`surplus calorique`). `deficit` reste nu, il n'a pas d'usage innocent.

### b. Une liste qui nomme l'interdit contient l'interdit

Même test, second échec : `MEAL_SYSTEM_PROMPT` contient « No calories. No macro
grams. » — la section qui **interdit** le registre. Retirer « calorie » du
lexique aurait désarmé la garde pour arranger une constante. C'est la cicatrice
« références legacy qui doivent survivre » du dépôt. Le test vérifie maintenant
que les occurrences sont **confinées à la section de prohibition**, ce qui est la
propriété qu'on voulait vraiment.

### c. La préséance adhérence ne mordait qu'en anglais

`SENTINEL_GROUP_LABELS` est écrit pour le modèle, en anglais (« a pulse —
lentils, beans or chickpeas »). Un élève écrit « je ne mange pas de
légumineuses ». Chercher les mots du libellé anglais dans une déclaration
française ne trouve rien : la garde d'adhérence n'aurait mordu **que pour les
anglophones**. C'est exactement la cicatrice « garde testée dans une seule
langue », attrapée avant la livraison. Corrigé par
`SENTINEL_GROUP_MATCH_WORDS`, EN + FR, distinct du libellé d'affichage.

### d. « protein » est un nom d'axe ET un mot ordinaire

Le test §3.0 (« aucun nom d'axe n'atteint le coach ») échouait sur « a protein
food ». Interdire le mot aurait interdit au produit de parler d'aliments. Le test
porte maintenant sur le **jargon du moteur** — les noms composés qui n'existent
que dans le code (`satiety_density`, `micro_coverage`, `carb_timing`,
`plant_diversity`) — et sur les slugs bruts.

---

## 3. Vérifications

| | |
|---|---|
| `deno test` sur `_shared/keel/` | **1 905 passés, 0 échec**, sans `--no-check` |
| `tsc -p frontend/tsconfig.app.json` | **0 erreur** |
| Migrations : doublons | `uniq -d` vide |
| Migrations : rejouabilité | les 3 de la phase II réappliquées à la main, sans erreur |
| Pilotage maison | présent en base, **1 entrée** sur la doctrine publiée du coach `house` |
| Hash du bloc chat | identique sur les 6 variantes, avec et sans pilotage |

Les deux fichiers de test cassés **sur `main`** (`daily_recap_io_test`,
`daily_recommendation_test`) restent exclus — voir le rapport de phase I.

---

## 4. L'étape 6 — la surface coach, livrée et VÉRIFIÉE AU NAVIGATEUR

La carte **« How you compose a plate »** est dans `CoachDoctrinePage.tsx`, entre
les pratiques quotidiennes et les dynamiques — c'est une question de méthode
globale, comme la voix, pas une par objectif.

`coach-doctrine-v1` dérive à l'enregistrement et écrit **deux colonnes**
(`composition_positions`, la feuille de réponses ; `composition_steering`, la
forme compilée) plus les convictions citables, **idempotentes par clé**.

**Vérifié dans le navigateur, sur la vraie base locale :**

| ce qui a été vérifié | résultat |
|---|---|
| les 4 débats et leurs 14 positions rendus | ✅ |
| chaque position affiche son effet en plan/aliment | ✅ (capture) |
| aucun nom d'axe du moteur à l'écran | ✅ |
| état vide correct sans réponse | « Sophia composes in her default order » |
| enregistrement → `composition_positions` | `{"how_you_run_a_cut":"cut_gentle","what_drives_a_plate":"calories_are_noise"}` |
| enregistrement → `composition_steering` | `off:["energy"]`, `deficit_style:"gentle"`, `belief_key` renseignée |
| les convictions citables ajoutées | 2, avec `source:"composition_fork"` |
| second enregistrement | **aucune duplication** (5 convictions, pas 7) |

La ligne de test (une version brouillon non publiée) a été **retirée** après
vérification.

**Une colonne de plus que prévu, et c'est un arbitrage.**
`composition_positions` n'était pas au design. Sans elle, réafficher l'écran
demanderait de re-dériver les réponses depuis les jetons — un décompilateur,
faux dès que deux positions produisent le même jeton, ce qui arrive déjà. Le
coach rouvrirait son écran et n'y retrouverait pas sa réponse.

---

## 5. L'étape 7 (foyer) — différée, puis livrée

**Différée d'abord.** Au moment de l'attaquer (18h54), un autre chantier
écrivait **en direct** dans ses fichiers : `generate-household-meal-v1/index.ts`
modifié **à la seconde**, `household_meal_generation.ts` deux minutes plus tôt,
deux migrations posées dans la même fenêtre. Y écrire en parallèle, c'est deux
agents qui s'écrasent sans que ni l'un ni l'autre ne le voie.

**Reprise à 00h09**, la lane étant restée intouchée pendant cinq heures.

| | |
|---|---|
| `household_composition.ts` | verrou de lane, référent, tronc sur le MIN, sécurité, deltas, écart résiduel |
| Migration | `20260811010000_household_reference_member.sql` — `reference_member_id`, **déclarée** |
| Branchement | `generate-household-meal-v1` : résolution avant les restrictions, `member_deltas` au payload et à la réponse |
| Tests | 19, dont l'indiscernabilité, le MIN, l'union des interdits, A3 |

**Le défaut que le test a trouvé, et il valait le détour.** `HouseholdLaneMode`
distinguait `per_kg` (aucune enveloppe calculable) de `per_portion` (quelqu'un
est protégé) : **l'enum lui-même désignait quelqu'un**, à qui lirait la ligne
aujourd'hui ou l'agrégerait dans six mois. Corrigé — le mode rend `per_portion`
dans les deux cas, exactement comme `envelope_mode` mélange ses deux populations
(FF-039 R14). Il ne coûte rien à l'appelant : sans enveloppe calculable, il n'y
avait ni tronc dimensionné ni delta.

**Ce qui reste sur FF-043 :** les surfaces d'écran. Le référent se déclare en
base et le moteur le lit, mais aucun écran ne le demande ; les add-ons sont
écrits dans le payload et aucune surface ne les rend. C'est le bon ordre — le
rendu d'une divergence à table est la partie qui demande le plus de soin, et la
fiche §12 dit ce qu'elle s'interdit d'y montrer.

---

## 6. Ce qui n'a toujours pas été fait

- **Aucun commit** — même raison qu'en phase I, et elle s'est aggravée : la lane
  foyer est maintenant activement écrite par une autre session.
- **Aucun run réel contre un modèle** — pas de clé locale. La phase II a bumpé
  la consigne **zéro fois** (les jetons de correction sont une relance, pas une
  consigne permanente), donc `MEAL_PROMPT_VERSION` reste
  `meal.en.v6_structured_quantities`. Le run décrit au §5.b de la phase I couvre
  les deux phases.
- **La surface coach de l'étape 6** — §4 ci-dessus.

---

## 7. Les fichiers de la phase II

**Fiches** — `FF-040-la-boucle-de-correction.md` ·
`FF-041-la-methode-du-coach-executable.md` (composition-des-repas) ·
`FF-043-la-resolution-foyer.md` (le-foyer, spécifiée seulement)

**Modules** — `meal_correction.ts` · `meal_coverage.ts` ·
`composition_steering.ts` · `composition_forks.ts` (+ leurs 4 tests)
modifiés : `nutrition_lexicon.ts` · `doctrine.ts` · `meal_envelope.ts`

**Migrations** — `20260810230000_meal_verdict_correction_columns.sql` ·
`20260810240000_coach_composition_steering.sql` ·
`20260810250000_house_composition_steering.sql`

**Edge / front** — `generate-meal-v1` · `account-export-v1` ·
`frontend/src/keel/api/coachDoctrine.ts`
