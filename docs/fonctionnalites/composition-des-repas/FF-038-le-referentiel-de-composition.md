# FF-038 · Le référentiel de composition, et les quantités qu'on recalcule

| | |
|---|---|
| **Identifiant** | `FF-038-le-referentiel-de-composition` |
| **Statut** | 🟠 En cours |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · [LEGAL.md](../../keel/LEGAL.md) (hygiène des tables neuves) · design d'origine : `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§2.1, §6 étapes 2-3) |
| **Dépend de** | `tokens.ts` (`FOOD_GROUP_REFS`) · `food_items.ts` (`count_axis`, `typical_amount`) · `forbidden_matcher.ts` (`normalizeForMatch`) · `meal_generation.ts` (`DishIngredient`, `buildMealPrompt`, `parseGeneratedMeal`) · FF-037 |
| **Effort estimé** | 3 à 4 jours (dont ~1 pour le seed) |

> **Deux étages du chantier dans une fiche, et c'est délibéré.** Le référentiel
> (étape 2) sans les quantités structurées (étape 3) sait ce qu'est un aliment
> et pas combien il y en a ; les quantités sans le référentiel savent combien de
> grammes et pas de quoi. Séparés, ni l'un ni l'autre n'est vérifiable. Ils se
> livrent en **deux commits**, dans cet ordre, et la mesure de couverture du
> premier conditionne l'intérêt du second.

---

## 1. Le problème

Le produit ne sait pas ce qu'il met dans l'assiette.

`DishIngredient` porte trois champs : `term` (prose libre du modèle), `quantity`
(prose libre, filtrée contre les unités d'énergie) et `in_pantry` (calculé). Il
n'existe **aucun** chemin, dans tout le dépôt, qui aille de « 400 g de cuisses
de poulet » à une grandeur quelconque. `food_items` est un catalogue de **115
libellés** pour l'écran du coach : il porte un `typical_amount` et un
`count_axis`, et pas une valeur de composition.

Trois conséquences, toutes vérifiées le 2026-08-10 :

1. **Rien ne peut être vérifié.** L'ancre protéique de [FF-037](FF-037-l-ancre-proteique.md)
   sait dire qu'un plat contient du poulet ; elle ne sait pas si « 2 œufs » porte
   une ancre ou une décoration. La différence est un facteur cinq.
2. **L'arithmétique du modèle serait la seule preuve.** Si on demandait des
   grammes au générateur, on n'aurait aucun moyen de les contrôler — et ce dépôt
   a déjà payé la classe d'incidents « le drapeau du modèle n'est pas une
   preuve » (`in_pantry`, garantie 2 de `meal_generation.ts`).
3. **Le piège cru/cuit n'est même pas nommé.** « 100 g de riz » vaut 350 kcal
   cru et 130 cuit. Aucun champ ne dit lequel, et le modèle alterne sans le dire.

**Ce que ça coûte de ne rien faire.** Tout le reste du chantier des unités de
composition (enveloppes, verdicts, boucle de correction, résolution foyer)
suppose qu'on sache calculer l'énergie et les macros d'un plat à partir de ses
ingrédients. Sans référentiel, ces étages ne peuvent ni être construits, ni même
être *mesurés en observation* — et le produit continue de composer à
l'aveugle en promettant qu'il compose selon une méthode.

## 2. Job stories

> **Quand** je reçois une semaine, **je veux** qu'elle ait été vérifiée par
> autre chose que la bonne volonté d'un modèle, **pour que** « composé selon la
> méthode de mon coach » veuille dire quelque chose.

> **Quand** le générateur écrit « 100 g de riz », **je veux** que le produit
> sache si c'est avant ou après cuisson, **pour que** ce qui se calcule dessus
> ne soit pas faux d'un facteur trois.

> **Quand** un ingrédient est inconnu du référentiel, **je veux** que le produit
> le dise plutôt que de l'ignorer, **pour que** personne ne prenne une mesure
> amputée pour une mesure.

## 3. Périmètre

### Dans le périmètre

**Étage A — le référentiel (étape 2, « en ombre »)**

- Table `food_composition_refs` : slug, groupe (FK vers les 30 existants),
  valeurs pour **100 g crus**, drapeaux sentinelles **booléens**, `yield_class`,
  `atwater_discount`.
- Table `food_composition_aliases` : `alias` normalisé → `slug`, **fermée et
  curée**.
- Seed d'environ 300 entrées, source Ciqual (ANSES, licence Etalab).
- Module pur `food_composition.ts` : résolveur, conversions, rendements,
  décote, imputation d'huile de friture.
- **Un rejeu** sur les repas déjà générés, qui produit le chiffre de
  **couverture de résolution** et la worklist d'alias.
- **Zéro assiette changée** : aucun prompt modifié, aucun comportement de
  parseur modifié.

**Étage B — les quantités structurées (étape 3)**

- `amount` / `unit` / `state` sur `DishIngredient`, à côté de `quantity` prose,
  qui ne bouge pas.
- Le contrat JSON du prompt système gagne ces trois champs. Bump de
  `MEAL_PROMPT_VERSION`.
- Le parseur **recalcule** les grammes crus lui-même, via l'étage A.
- Champ absent ou illisible ⇒ `null` **compté** dans les issues.

### Hors périmètre — engageant

- ❌ **Aucun chiffre affiché, nulle part.** Ni à l'élève, ni au coach, ni dans
  un message d'erreur. Le référentiel est un instrument de mesure interne. La
  sortie du produit reste ce qu'elle est : des recettes grammées.
- ❌ **Aucun vocabulaire fermé imposé au générateur.** On ne lui donne pas la
  liste des aliments qu'il a le droit d'écrire. Coût mesuré et documenté par le
  design (§8) : 1 à 3k tokens par génération, couplage prompt↔table de données,
  recettes de kit, problème de locale fabriqué, et asymétrie des échecs — un
  aliment absent de la liste deviendrait imprescriptible **en silence**, alors
  qu'un aliment non résolu est non compté et **visible**.
- ❌ **Aucun milligramme de micronutriment.** Les sentinelles sont des
  **booléens** (`omega3_marine`, `iron_source`, …). La variance sol/saison/
  cuisson est de ±30-50 % ; le booléen « source de » est la seule granularité
  honnête. La vitamine D sort entièrement du moteur.
- ❌ **Aucun verdict, aucune enveloppe, aucune correction.** C'est FF-039 et la
  suite. Cette fiche produit une capacité de mesure, pas une décision.
- ❌ **Aucun alias deviné.** Un terme dont on ne sait pas à quel aliment il
  correspond reste **non résolu**. Gonfler la couverture avec de faux
  appariements produirait exactement le bruit que la gate de FF-039 existe pour
  empêcher.
- ❌ **Aucune écriture depuis le front.** Les deux tables sont en lecture
  service-role. Voir R8.
- ❌ **Aucune donnée utilisateur dans le référentiel.** C'est de la donnée de
  référence : pas de `user_id`, donc pas de réclamation RGPD — et cette absence
  est un choix écrit dans la migration, pas un oubli (R9).

## 4. Le circuit

```
  ── ÉTAGE A ────────────────────────────────────────────────────────────────

  Ciqual (ANSES, Etalab)          food_items (115 slugs existants)
        │                                    │
        └────── script de seed ──────────────┘
                       ↓
        food_composition_refs                food_composition_aliases
        slug · food_group_ref (FK 30)        alias (normalisé) → slug
        energy_kcal · protein_g · carbs_g
        fat_g · fiber_g            (/100 g CRUS)
        omega3_marine · iron_source · …      (booléens)
        yield_class · atwater_discount
                       │
                       ↓
              food_composition.ts   ← MODULE PUR (aucune I/O)
                       │
     resolveIngredient(term)  →  CompositionRef | null      (jamais deviné)
     gramsRawOf(amount, unit, state, yieldClass) → number | null
     nutrientsOf(ingredients) → Nutrients | "unknown"       (jamais 0 par défaut)
                       │
                       ↓
              rejeu hors ligne (scratchpad/)
              lit student_generated_meals
                       ↓
        couverture de résolution médiane  +  worklist d'alias
        → LE CHIFFRE QUI CONDITIONNE LA SUITE DU CHANTIER

  ── ÉTAGE B ────────────────────────────────────────────────────────────────

  MEAL_SYSTEM_PROMPT
  "ingredients": [{ "term", "quantity", "amount", "unit", "state" }]
                       │
                       ↓ (le modèle rend ses trois champs)
              parseGeneratedMeal()
                       │
     amount/unit/state lus TOLÉRAMMENT   ── illisible ──→ null + issue comptée
                       │
     gramsRaw = gramsRawOf(...)  ← RECALCULÉ ICI, jamais lu d'un champ du modèle
                       │
              DishIngredient { term, quantity, in_pantry,
                               amount, unit, state, gramsRaw }
```

**Ce que l'étage B ne fait PAS, et c'est le point.** Il ne demande **pas** au
modèle de calculer quoi que ce soit. Il lui demande de **déclarer** ce qu'il a
déjà écrit en prose (« 100 g de riz cru » → `amount:100, unit:"g",
state:"raw"`), et le produit fait l'arithmétique. La prose reste destinée à
l'humain, `ENERGY_UNIT_RE` reste armé dessus, et le champ structuré ne remplace
rien : il double.

## 5. Modèle de données

### `food_composition_refs` — donnée de RÉFÉRENCE

| colonne | type | d'où ça vient |
|---|---|---|
| `slug` | `text` PK | réutilise les slugs de `food_items` là où ils existent |
| `food_group_ref` | `text` FK → `food_groups(slug)` | les 30 groupes existants, jamais une seconde taxonomie |
| `label` | `text` | libellé lisible, pour la worklist et le débogage |
| `energy_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g` | `numeric` | **pour 100 g CRUS**, Ciqual |
| `omega3_marine`, `iron_source`, `calcium_source`, `iodine_source`, `zinc_source`, `b12_source`, `folate_source` | `boolean` | **présence/absence**, jamais des mg |
| `yield_class` | `text`, liste fermée | rendement cru→cuit ; les facteurs sont des constantes NOMMÉES du module |
| `atwater_discount` | `numeric`, défaut `1.0` | ~0,72 pour les fruits à coque entiers (Novotny 2012) |
| `energy_dense` | `boolean` | classe dense (matières grasses, fruits à coque, sucres). C'est elle qui déclenche l'abstention de FF-039 |

### `food_composition_aliases` — la table qui se cure

| colonne | type | d'où ça vient |
|---|---|---|
| `alias` | `text` PK | **déjà normalisé** par `normalizeForMatch`, écrit tel quel |
| `slug` | `text` FK → `food_composition_refs` | curé à la main, **jamais deviné** |
| `note` | `text` | pourquoi cet alias existe, quand ce n'est pas évident |

### `DishIngredient` — trois champs de plus

| champ | forme | qui l'écrit |
|---|---|---|
| `amount` | `number \| null` | le modèle, lu tolérablement |
| `unit` | `"g" \| "ml" \| "unit" \| "tbsp" \| "tsp" \| null` | le modèle, **liste fermée** |
| `state` | `"raw" \| "cooked" \| null` | le modèle |
| `gramsRaw` | `number \| null` | **le parseur**, recalculé. Jamais lu du modèle |

`quantity` (prose) ne bouge pas d'un octet, et `ENERGY_UNIT_RE` reste armé
dessus.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Un terme non résolu rend `null` et est **compté** dans `unresolved_terms`. Jamais deviné, jamais rapproché « au plus proche » | Une résolution approximative est indiscernable d'une bonne dans la sortie, et elle empoisonne tout ce qui se calcule dessus. Le compte est la worklist. |
| R2 | Un ingrédient inconnu propage **de l'inconnu**, pas du zéro | Un `0` silencieux fait passer un plat non calculable pour un plat léger — le sens exactement inverse. Le type est `Nutrients \| "unknown"`, pas un nombre. |
| R3 | Les valeurs du référentiel sont pour **100 g CRUS**, et le passage cuit→cru se fait par `yield_class` | C'est LE piège du domaine : « 100 g de riz » vaut ~350 kcal cru et ~130 cuit. Le tester nommément est une exigence, pas un confort. |
| R4 | La normalisation est celle de `forbidden_matcher.ts` (`normalizeForMatch`), jamais une seconde | Même raison qu'en FF-037 R2, et ici elle est plus dure : la table d'alias STOCKE des formes normalisées, donc un second normaliseur rendrait la table illisible par son propre lecteur. |
| R5 | La désaccentuation, le pluriel et les **modificateurs de préparation** sont une NORMALISATION, pas une devinette. La liste des modificateurs est **fermée** et testée | « tomatoes » et « chopped tomatoes » désignent la tomate sans ambiguïté ; « butter or olive oil » n'en désigne aucune et reste non résolu. La frontière est là : réduire une forme, jamais choisir entre deux aliments. |
| R6 | Le parseur **recalcule** les grammes. Aucun champ de grammes n'est jamais lu du modèle | Précédent `in_pantry` : l'arithmétique du modèle n'est pas une preuve. Un modèle qui rend `grams: 400` sur « 2 filets » a écrit un nombre, pas une mesure. |
| R7 | `amount`/`unit`/`state` absents ou illisibles ⇒ `null` **compté**, jamais défaut-é | Un `state` deviné « raw » sur du riz fausse le calcul d'un facteur trois dans le sens qui gonfle. `null` se lit « on ne sait pas » et l'abstention de FF-039 sait quoi en faire. |
| R8 | Les deux tables naissent avec `revoke all … from anon` et `revoke … from authenticated` **dans leur propre migration** | Les privilèges par défaut Supabase accordent TOUT à `authenticated` sur toute table neuve, TRUNCATE compris, et TRUNCATE échappe à RLS. Deux cicatrices du dépôt, écrites une fois de plus ici. |
| R9 | **Aucune réclamation RGPD** pour ces deux tables, et l'absence est **écrite** dans la migration | Ce sont des données de référence : aucune colonne `user_id`, aucune donnée d'utilisateur. Le dépôt a une cicatrice inverse (« le lifecycle ne réclame pas les tables neuves ») ; la parade n'est pas de tout réclamer, c'est que chaque table dise laquelle des deux elle est. |
| R10 | Les migrations sont **ré-appliquables** : `create table if not exists`, `drop constraint if exists` avant `add`, `on conflict do nothing` sur le seed | `supabase db reset` est interdit sur ce chantier. Une migration qui ne passe qu'une fois sur une base vierge est une migration cassée. |
| R11 | L'étage A ne change **aucune** sortie du produit | *En ombre.* Aucun prompt touché, aucun comportement de parseur touché, aucun bump de version. La preuve est qu'aucun test existant ne bouge. |
| R12 | Condition de désarmement de l'étage B : une sortie de modèle **sans** les trois nouveaux champs (l'ancien format) parse exactement comme avant, aux issues près | C'est ce qui rend le lot rejouable sur les plans existants et survivable à un modèle qui ignore la consigne. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Terme d'ingrédient absent du référentiel et des alias | `null`, compté dans `unresolved_terms`. Le plat **sort** normalement — l'étage A ne décide de rien. |
| `unit` hors liste fermée (« cup », « handful ») | `null` compté. Pas de conversion inventée : une tasse n'a pas de volume universel. |
| `state` absent sur un aliment qui absorbe l'eau (riz, pâtes, légumineuses) | `gramsRaw = null`, compté. **Jamais** un état par défaut : le défaut fausserait d'un facteur trois, et toujours dans le même sens. |
| `state` absent sur un aliment dont le rendement est neutre (huile, noix, fromage) | `gramsRaw` calculé normalement. Le rendement de la classe est 1,0 : il n'y a rien à deviner. |
| Le modèle rend `amount` mais pas `unit` | `null` compté. Un nombre sans unité n'est pas une quantité. |
| Le modèle met une unité d'énergie dans `quantity` | **Inchangé** : `ENERGY_UNIT_RE` mord, le plat est rejeté, `rejected_numeric` compte. Les nouveaux champs ne créent aucune porte. |
| Le seed Ciqual est provisoire ou incomplet | La couverture est basse et le rejeu **le dit**. C'est le seul mode de défaillance de cette fiche qui a une métrique dédiée, et c'est la gate de FF-039. |
| **Le silencieux, et le plus grave** : un alias faux (« crème » → `cream_double`) | Un plat calculé faux, indiscernable d'un plat calculé juste, dans TOUT ce qui se construit dessus. C'est pour ça que la table est **curée** et jamais générée : un alias ajouté doit être défendable en une phrase, et la colonne `note` est là pour l'écrire. |
| Deux alias en conflit (même forme normalisée, deux slugs) | La PK sur `alias` le rend impossible en base. Le script de seed échoue bruyamment plutôt que de garder le dernier. |

## 8. Critères d'acceptation

```gherkin
Étant donné le terme "chicken breast"
Quand on le résout
Alors il rend l'entrée de référentiel du blanc de poulet
```

```gherkin
Étant donné le terme "chopped tomatoes"
Quand on le résout
Alors il rend l'entrée de la tomate
Et le modificateur "chopped" n'a pas changé l'aliment choisi
```

```gherkin
Étant donné le terme "butter or olive oil"
Quand on le résout
Alors il rend null
Et il apparaît dans les termes non résolus
```

```gherkin
Étant donné 100 g de riz déclarés "cooked"
Et 100 g de riz déclarés "raw"
Quand on calcule les grammes CRUS de chacun
Alors le second vaut environ trois fois le premier
```

```gherkin
Étant donné un plat de trois ingrédients dont un seul est non résolu
Quand on calcule son énergie
Alors le résultat est "unknown"
Et il n'est PAS la somme des deux ingrédients connus
```

```gherkin
Étant donné 30 g d'amandes entières
Quand on calcule leur énergie
Alors la décote d'Atwater du groupe des fruits à coque est appliquée
```

```gherkin
Étant donné une méthode de cuisson "deep-fried" (ou "friture")
Quand on calcule le plat
Alors une imputation d'huile est ajoutée
Et une méthode "sauté à sec" n'en déclenche aucune
```

```gherkin
Étant donné une sortie de modèle SANS les champs amount, unit et state
Quand elle est parsée
Alors la sortie est identique à celle d'avant l'étage B, aux issues près
```

```gherkin
Étant donné la migration du référentiel
Quand on l'applique deux fois de suite sur la même base
Alors elle réussit les deux fois
```

## 9. Rabbit holes

- **Vouloir un référentiel complet.** Ciqual fait ~3 000 lignes ; on en prend
  ~300. Le critère n'est pas l'exhaustivité, c'est la **couverture mesurée** des
  termes que le générateur écrit réellement. Le rejeu du §10 dit lesquels
  manquent ; tout le reste est du travail sans preneur.
- **Faire du seed un chantier.** La structure prime sur la précision du seed :
  une entrée à ±10 % est utile, une entrée absente ne l'est pas. Si l'extraction
  Ciqual scriptée n'est pas disponible, on écrit les entrées les plus fréquentes
  à la main **en le disant dans la migration** — un commentaire, pas un silence.
- **Le piège cru/cuit, dans les deux sens.** Le riz gonfle (×2,5-3), la viande
  perd (×0,7). Une seule direction codée en dur donnerait des résultats
  plausibles sur la moitié des plats — c'est-à-dire un bug qu'on ne verrait pas.
  Les classes de rendement sont des constantes nommées avec leur facteur, pas
  des nombres éparpillés.
- **Confondre la mesure et le pilotage.** Cette fiche **mesure**. Elle ne change
  aucune assiette, et la tentation de « puisqu'on sait, corrigeons » est
  exactement ce que la gate de FF-039 existe pour retenir : corriger sur une
  résolution à 60 % serait corriger sur du bruit.
- **Élargir la liste des modificateurs pour faire monter le chiffre.** La
  frontière de R5 est fine et il faut la tenir : « cooked rice » se réduit,
  « rice pudding » ne se réduit pas — ce n'est pas du riz avec un adjectif,
  c'est un autre plat. Un modificateur ajouté doit passer le test « la
  réduction change-t-elle l'aliment ? ».
- **Le jumeau côté écran.** `frontend/src/keel/api/mealGeneration.ts` duplique
  le PARSEUR. **Vérifié fichier en main le 2026-08-10** : son `readIngredients`
  lit `term`, `quantity` et `in_pantry`, et ignore tout le reste — les quatre
  champs de l'étage B lui passent au-dessus sans rien casser, ce qui est le bon
  comportement (ils sont de l'instrumentation, pas de l'affichage). Ce n'est
  pas une dispense générale : c'est le résultat d'une vérification, à refaire
  au prochain lot qui touche la sortie.
- **Croire que `food_items` suffisait.** Il porte `typical_amount`, ce qui
  ressemble à de la composition et n'en est pas : c'est la taille d'une portion
  pour l'écran du coach, pas la densité d'un aliment. Les deux tables coexistent,
  partagent leurs slugs là où c'est vrai, et ne se remplacent pas.

## 10. Ce qu'on mesure

- **La mesure principale, et c'est la raison d'être de l'étage A :** la
  **couverture de résolution médiane** par repas — part d'ingrédients résolus
  sur le total, rejouée sur les 603 plats déjà en base. Elle sort avec sa
  distribution, pas seulement sa médiane : une médiane à 85 % avec un quart des
  repas sous 60 % ne dit pas la même chose qu'une distribution serrée.
- **La mesure secondaire :** part de repas dont l'énergie serait **calculable**
  (résolution ≥ 80 % ET aucun ingrédient dense non résolu ET aucun ingrédient
  dense **non pesé**). C'est elle qui décide de ce que FF-039 pourra observer.

### 10 bis. Ce que « résolu » veut dire — mesuré le 2026-08-12

La couverture compte les termes que le référentiel **connaît**, pesés ou non.
Ce n'est pas la taille du tableau `resolved`, qui ne contient que les termes
**pesés**.

L'écart n'est pas théorique : sur une assiette réelle, le second compteur
rendait 69 % là où le premier rend 96 %. Les 26 lignes d'écart étaient du sel,
du poivre, de la cannelle et des légumes comptés à l'unité — des aliments
parfaitement connus dont on ignore le poids. Comme chaque plat en porte, la
porte des 80 % était structurellement condamnée à se fermer, et elle éteignait
d'un coup le verdict, la boucle de correction et la mise à l'échelle des
portions. **Pour des condiments.**

Le danger réel des non-pesés n'est pas leur nombre, c'est leur **densité** :

| | inconnu du référentiel | connu mais non pesé |
|---|---|---|
| **classe dense** (huile, noix, sucre) | `unresolvedEnergyDense` → abstention | `unweighedEnergyDense` → abstention |
| **classe ordinaire** (sel, courgette) | compte dans la couverture | ne compte pas contre la couverture |

La seconde case était **vide jusqu'au 2026-08-12**. Un « filet d'huile d'olive »
se résolvait, comptait comme connu, et son énergie n'entrait dans aucune somme :
un plat amputé de 120 kcal se présentait comme lisible à 100 %. Mesuré sur 80
générations réelles : **82 lignes d'huile d'olive sans quantité**, de loin le
premier poste de perte.

La garde côté lecture ne suffit pas — elle constate sans réparer. Le prompt
exige donc désormais `amount` + `unit` sur les matières grasses, les fruits à
coque et les sucrants (« a drizzle of olive oil » = 1 tbsp), et le parseur
**nomme** les denses non pesés dans une issue à part (`energy_dense_unweighed`).
Le sel et les herbes restent une pincée : exiger un chiffre partout ferait
inventer des nombres, ce que le même prompt interdit deux paragraphes plus haut.
- **La worklist :** les `unresolved_terms` par fréquence décroissante. Ce n'est
  pas une métrique, c'est le livrable ops de cette fiche — et le design nomme
  son payeur : une passe de curation hebdomadaire pilotée sur la couverture.
- **La contre-mesure de l'étage B :** `rejected_numeric` après le bump de
  `MEAL_PROMPT_VERSION`. Un contrat JSON qui gagne trois champs numériques est
  exactement le genre de changement qui pousse un modèle à écrire des chiffres
  ailleurs. Si elle monte, la faute est dans la formulation du contrat.
- **La seconde contre-mesure :** part de plats qui perdent des ingrédients ou
  des issues nouvelles après le bump. Le dépôt a mesuré deux fois qu'un prompt
  qui change fait régresser ailleurs.

## 11. Questions ouvertes

1. **Le seed est provisoire tant que l'extraction Ciqual n'est pas scriptée.**
   La structure est la même dans les deux cas ; ce qui change est la précision
   des valeurs et le nombre d'entrées. La migration le dit en commentaire, et
   le remplacement se fait par une migration additive (`on conflict do update`),
   pas par une réécriture.
2. **La table d'alias n'a pas d'écran.** La curation se fait par migration, ce
   qui est lent mais traçable. Un écran d'administration serait le bon outil le
   jour où le rythme de curation le justifie — pas avant, et pas sans se poser
   la question de qui a le droit d'écrire dedans (aujourd'hui : personne, c'est
   R8).
3. **Les préparations partagent le calcul, mais pas encore la structure.**
   `MealPreparation.ingredients` est un `DishIngredient[]`, donc l'étage B lui
   donne ses trois champs « gratuitement ». Ce qui n'est PAS tranché est
   l'attribution : une préparation fait `servingsMade` portions, et savoir
   combien de grammes atterrissent dans le plat qui en prélève `servings` est
   une division simple — mais elle suppose que le modèle ait rempli les deux
   nombres honnêtement. À instruire avec le verdict de FF-039, qui est le
   premier lecteur à en avoir besoin.
4. **L'imputation d'huile de friture est une convention, pas une mesure.** 12 %
   du poids cuit est un ordre de grandeur de la littérature, appliqué sur un
   lexique fermé de méthodes. Elle est **avouée comme opérationnelle** en
   commentaire, au même titre que les plafonds de densité de FF-039 — pas
   présentée comme un fait.
