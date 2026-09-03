# FF-037 · L'ancre protéique

| | |
|---|---|
| **Identifiant** | `FF-037-l-ancre-proteique` |
| **Statut** | 🟢 **Livrée et câblée** — vérifié dans le code le 2026-09-01 : `_shared/keel/protein_anchor.ts` (467 l., 18 tests) est appelée par les **deux** générateurs (`generate-meal-v1`, `generate-household-meal-v1`) et par `meal_generation.ts`, `fixed_intakes.ts`, `meal_verdict.ts`. Le « 🟠 En cours » avait survécu à la livraison |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · design d'origine : `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§1 rang 2, §2.4, §6 étape 1) |
| **Dépend de** | `tokens.ts` (`FOOD_GROUP_REFS`) · `forbidden_matcher.ts` (`findForbiddenMatches`, `normalizeForMatch`) · `meal_generation.ts` (`buildMealPrompt`, `parseGeneratedMeal`, `MEAL_PROMPT_VERSION`) · `doctrine.ts` (patron `doctrineRetryInstruction`) |
| **Effort estimé** | 1 jour |

> **Cette fiche est le premier étage d'un chantier de huit.** Le document
> d'origine est `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` ; les arbitrages
> **A1** (plafond de déficit non débrayable) et **A2** (mécanisme ≠ contenu)
> gouvernent les étages suivants et n'ont pas de prise ici — la présence d'un
> aliment protéique est un **mécanisme produit**, jamais une opinion de coach.

---

## 1. Le problème

Le générateur compose des plats libres. Rien, à aucun endroit de la chaîne, ne
vérifie qu'un déjeuner ou un dîner porte de quoi tenir jusqu'au repas suivant.

Ce que le prompt système dit aujourd'hui de la protéine, en tout et pour tout :

> *« one adult portion is roughly a palm of protein, a fist of starch, and
> vegetables on top »* — `meal_generation.ts`, section `A PORTION IS ONE
> PERSON'S PLATE`.

C'est une aide au **dimensionnement**, posée dans un paragraphe qui parle de
quantités, et elle ne dit pas qu'un plat DOIT porter une protéine. Le mot
n'apparaît nulle part ailleurs, et **aucune ligne du parseur ne le cherche**.
Le seul mécanisme déterministe qui existe côté composition est un filtre
NÉGATIF (`findNumericTarget`, `ENERGY_UNIT_RE`) : il dit ce qui ne doit pas
sortir, jamais ce qui doit y être.

Conséquence mesurable : une semaine peut sortir avec un déjeuner « pâtes,
tomates, parmesan » et un dîner « soupe de légumes, pain », et rien ne le
signale — ni au moment de composer, ni après.

**Ce que ça coûte de ne rien faire.** C'est la grandeur au fondement le plus
solide du corpus (Morton 2018, Helms 2014, Moore 2015) et la seule que la
composition d'un plat peut réellement garantir. Un élève qui abandonne son plan
le mercredi parce qu'il a faim à 16h abandonne pour cette raison-là bien plus
souvent que pour une erreur de calorie que personne n'a mesurée. Et le chantier
entier des unités de composition (référentiel, enveloppes, verdicts) suppose que
l'assiette porte une ancre : sans elle, il mesurera l'absence sans jamais la
corriger.

## 2. Job stories

> **Quand** je reçois mon plan de la semaine, **je veux** que chaque vrai repas
> porte de quoi me tenir, **pour que** je n'aie pas à raider le placard à 16h et
> à décider que le plan ne marche pas.

> **Quand** mon coach a écrit une méthode qui ne parle jamais de protéine,
> **je veux** quand même que mes repas en portent une, **pour que** le produit
> ne me livre pas un plan qu'aucune méthode sérieuse ne signerait.

> **Quand** mon plancher de restriction alimentaire est levé, **je veux** que
> mes repas restent construits, **pour que** ma protection ne se paie pas en
> assiettes vides.

## 3. Périmètre

### Dans le périmètre

- **`PROTEIN_SOURCES`** : un sous-ensemble FERMÉ des 30 `FOOD_GROUP_REFS`
  existants, dans `tokens.ts`, à côté de la liste dont il est tiré.
- **`protein_anchor.ts`** : module pur. Le lexique EN+FR des formes de surface
  par groupe, apparié par `findForbiddenMatches` — le moteur de matching du
  dépôt, jamais un second.
- **La consigne**, qualitative, dans la section de composition de
  `MEAL_SYSTEM_PROMPT`. Bump de `MEAL_PROMPT_VERSION`.
- **La vérification au parseur** : un plat de repas principal sans ancre porte
  une issue nommée `protein_source_missing` **et passe quand même**.
- **Un retry**, un seul, quand au moins un plat principal manque d'ancre.
  Instruction anglaise sans aucun chiffre, sortie repassée par tous les verrous.
- **La mesure avant/après** sur les plans déjà en base.

### Hors périmètre — engageant

- ❌ **Aucun gramme, aucune cible.** Ni « 30-40 g de protéines », ni « un quart
  de l'énergie », ni dans le prompt, ni dans le retry, ni dans une issue. La
  consigne dit **un aliment**, jamais une quantité de nutriment. C'est la
  frontière aliment/personne de [CONTRACT.md](../../keel/CONTRACT.md), et c'est
  le motif exact pour lequel l'ancre « ~30-40 g » d'un des designs candidats a
  été écartée.
- ❌ **Aucun affichage.** L'ancre ne se voit pas à l'écran, ne se dit pas à
  l'élève, ne remonte dans aucune synthèse coach. Elle vit dans `issues`, qui
  est interne.
- ❌ **Aucun blocage.** Un plat sans ancre **sort**. Seul le verrou de sécurité
  existant vide un repas ; un verdict de composition n'a jamais ce pouvoir
  (design §2.4).
- ❌ **Aucune mesure de la protéine.** « Ce plat porte-t-il ASSEZ de
  protéine ? » demande un référentiel de composition, qui est la fiche
  suivante (FF-038) et le verdict de FF-039. Ici on ne répond qu'à
  « en porte-t-il une ? ».
- ❌ **Aucune seconde taxonomie.** `PROTEIN_SOURCES` est un sous-ensemble des
  30 groupes existants. Le dépôt a déjà payé une duplication de vocabulaire
  alimentaire.
- ❌ **Aucun snack pénalisé.** Une collation sans protéine est une collation.
- ❌ **Aucune branche « sous plancher TCA ».** Voir R4.

## 4. Le circuit

```
  tokens.ts                       protein_anchor.ts
  FOOD_GROUP_REFS (30)  ──sous-ensemble──→  PROTEIN_SOURCES (10)
                                                    │
                                            PROTEIN_SURFACE_FORMS
                                            (EN + FR, par groupe)
                                                    │
                                     findForbiddenMatches / normalizeForMatch
                                            (forbidden_matcher.ts)
                                                    │
        ┌───────────────────────────────────────────┴──────────┐
        ↓                                                      ↓
  buildMealPrompt()                                  parseGeneratedMeal()
  == BUILD EVERY MAIN MEAL AROUND                    detectProteinAnchor(ingredients)
     A PROTEIN FOOD ==                                        │
  (une ligne, aucun chiffre)                    slot ∈ {breakfast, lunch, dinner} ?
        │                                                     │
        │                                   non ──→ rien                oui
        │                                                               │
        │                                              ancre ? ──oui──→ rien
        ↓                                                     │
     modèle ──────────────────────────────→ issue `protein_source_missing`
        ↑                                            LE PLAT PASSE
        │                                                     │
        └──── un seul retry ────────── proteinAnchorRetryInstruction()
              (generate-meal-v1)         « give each main meal a full
                                           protein food as its anchor »
                                                     │
                                    la sortie du retry repasse par
                                    parseGeneratedMeal EN ENTIER
                                    (verrous, filtres, plafonds)
```

**Le retry vit chez l'appelant, pas dans le parseur.** `parseGeneratedMeal` est
un module pur : il ne peut pas rappeler un modèle. Il rend le constat
(`proteinAnchorMissing`, la liste des plats concernés) et
`generate-meal-v1` décide. C'est exactement le partage que `doctrine.ts` a déjà
posé entre `findDoctrineViolations` (pur, constate) et l'appelant (relance).

## 5. Modèle de données

**Néant de neuf. Aucune table, aucune colonne, aucune migration.**

| ce qui est produit | où ça vit | qui l'écrit |
|---|---|---|
| `protein_source_missing (dishes[i])` | `GeneratedMeal.issues` | `parseGeneratedMeal` |
| la même issue, archivée | `student_generated_meals.generated_from.issues` | `generate-meal-v1`, déjà (il y écrit `meal.issues`) |
| `prompt_version` | `generated_from.prompt_version` | déjà — c'est lui qui sépare avant/après |
| `protein_anchor_retry: true` | `generated_from` | `generate-meal-v1`, quand une relance a eu lieu |

Le bump de `MEAL_PROMPT_VERSION` est ce qui rend la mesure du §10 faisable
après coup : sans lui, les plans d'avant et d'après se mélangent dans la même
colonne.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | `PROTEIN_SOURCES` est un **sous-ensemble typé** de `FOOD_GROUP_REFS`, déclaré dans le même fichier | Une seconde taxonomie diverge de la première le jour où un groupe est ajouté. Le typage (`readonly FoodGroupRef[]`) fait échouer la compilation sur un slug inventé, avant la FK. |
| R2 | L'appariement passe par `findForbiddenMatches` / `normalizeForMatch`, jamais par une seconde normalisation | Cicatrice écrite en tête de `forbidden_matcher.ts` : deux moteurs de matching divergent, et c'est celui qu'on regarde le moins qui garde l'ancien comportement. |
| R3 | Le lexique est **EN + FR**, et les deux langues sont testées nommément | Le dépôt a payé « `not` ne couvre pas `doesn't` » : une garde testée dans une seule langue est une garde à moitié armée. Le produit est en anglais et la base porte des plats français. |
| R4 | Sous `restriction_flag`, **rien ne change** — aucune branche, aucune exception | L'ancre est côté ALIMENT (présence), pas côté personne (quantité). Le plancher TCA retire ce qui se vise ; « ce plat porte du poisson » ne se vise pas. Une branche spéciale serait un endroit où le statut de l'élève devient observable dans la sortie, ce que le design interdit (§1 principe 4). Un test le prouve. |
| R5 | Un plat sans ancre **passe**, avec son issue. Aucun plat n'est jeté pour cette raison | *Pass-with-issue.* Seul le verrou binaire de sécurité vide un repas (design §2.4). Un plan imparfait bat un plan absent, et un `empty_meal` sur un motif de composition serait un refus dont l'élève ne peut rien faire. |
| R6 | Seuls `breakfast`, `lunch`, `dinner` sont vérifiés. Un `slot` **absent** ne l'est pas | Une collation sans protéine est une collation. Et un plat dont le créneau n'est pas nommé ne peut pas être PROUVÉ principal : le pénaliser inventerait un fait. `MAIN_MEAL_SLOTS` est une constante nommée dérivée de `EATING_OCCASIONS`. |
| R7 | **Un seul** retry, et sa sortie repasse par `parseGeneratedMeal` **en entier** | Patron `doctrineRetryInstruction`. Une sortie de relance acceptée sur bonne mine est une sortie non vérifiée ; et une boucle sans borne est une facture de modèle sans borne. Si la relance échoue aussi, le plan sort avec ses issues. |
| R8 | L'instruction de retry ne contient **aucun chiffre** et aucun mot du registre du régime | Un accent qui parle la langue du régime se fait échoer par le modèle dans les `why` visibles — c'est le défaut nommé par la revue TCA. `findNumericTarget` mord sur les chiffres, pas sur les mots ; ici la garde est que la constante n'en contient aucun, et le test le vérifie sur la table de constantes, pas à la main. |
| R9 | Condition de désarmement : un plan dont **tous** les plats principaux portent une ancre produit une sortie identique, octet pour octet, à celle d'avant le lot — zéro issue, zéro retry | C'est la preuve que le lot est additif. Testée par égalité de structure sur la sortie complète de `parseGeneratedMeal`, pas par absence d'une chaîne. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le modèle rend un plat sans ancre | Issue `protein_source_missing` sur ce plat, **plat conservé**. Une relance est demandée si c'est le premier passage. |
| La relance rend encore un plat sans ancre | Le plan **sort** avec ses issues. Aucune seconde relance (R7). L'issue est archivée dans `generated_from.issues`, où elle est comptable. |
| La relance échoue (modèle en erreur, tool call) | La **première** sortie est gardée telle quelle. Une relance ratée ne doit jamais coûter le plan à l'élève. |
| Le plat n'a aucun ingrédient (il vit d'une `uses`) | Les ingrédients de la **préparation référencée** comptent. Un plat qui puise dans un rôti de cuisses n'a pas à relister le poulet — c'est même l'architecture qu'on lui a demandée. |
| **Le silencieux, et le plus probable** : un aliment protéique dont la forme de surface manque au lexique | Faux `protein_source_missing`, donc une relance inutile et une issue trompeuse. Parade : le §10 mesure la distribution des issues sur les plans EXISTANTS avant de livrer la relance, et les termes non appariés qui reviennent sortent en worklist — pas en devinette. |
| Un coach interdit toutes les sources protéiques d'un élève | Le verrou de doctrine mord en aval, comme aujourd'hui. L'ancre ne crée pas de conflit : elle ne prescrit **aucun** aliment, elle constate une classe. |
| Le prompt bumpe et `rejected_numeric` monte | Contre-mesure du §10. Le changement de consigne a fait dériver le modèle vers le chiffre ; la ligne à durcir est celle de la consigne, pas la vérification. |

## 8. Critères d'acceptation

```gherkin
Étant donné un plat de dîner dont les ingrédients contiennent "chicken thighs"
Quand le repas est parsé
Alors aucune issue "protein_source_missing" n'est produite
```

```gherkin
Étant donné un plat de dîner dont les ingrédients contiennent "cuisses de poulet"
Quand le repas est parsé
Alors aucune issue "protein_source_missing" n'est produite
```

```gherkin
Étant donné un plat de déjeuner "pâtes, tomates, basilic"
Quand le repas est parsé
Alors une issue nommée "protein_source_missing" porte l'index de ce plat
Et le plat est présent dans la sortie
```

```gherkin
Étant donné une collation de l'après-midi "pomme, thé"
Quand le repas est parsé
Alors aucune issue "protein_source_missing" n'est produite
```

```gherkin
Étant donné un élève sous plancher de restriction alimentaire
Et un plat de dîner sans aliment protéique
Quand le repas est parsé
Alors la sortie est identique, caractère pour caractère, à celle du même plat
  pour un élève sans plancher
```

```gherkin
Étant donné un plan dont tous les plats principaux portent une ancre
Quand le repas est parsé
Alors la sortie est identique à celle produite avant ce lot
Et aucune relance n'est demandée
```

```gherkin
Étant donné l'instruction de relance de l'ancre protéique
Quand on la passe au filtre numérique du produit
Alors il ne mord pas
Et elle ne contient aucun chiffre
```

## 9. Rabbit holes

- **Vouloir mesurer la quantité tout de suite.** « Un aliment protéique » et
  « assez de protéine » sont deux questions, et la seconde exige un référentiel
  de composition (FF-038) qu'on n'a pas encore. Répondre à la seconde ici, à
  l'estime, produirait le chiffre inventé que tout ce produit refuse. Le
  découpage est délibéré : présence d'abord, grammes ensuite (FF-039).
- **Le fromage.** `dairy_cheese` est **exclu** de `PROTEIN_SOURCES`. Une pincée
  de parmesan n'est pas une ancre, et l'inclure rendrait la garantie vraie pour
  presque tous les plats — c'est-à-dire vide. *Ce que ça coûte, et qui est
  accepté :* une salade réellement construite autour de 150 g de feta reçoit une
  issue et une relance qu'elle ne mérite pas ; la relance propose alors une
  autre ancre végétarienne (légumineuses, œufs, tofu, yaourt), toutes présentes
  dans la liste. Le coût est un appel modèle, pas une assiette. La révision de
  cet arbitrage passe par le calcul en grammes de FF-039, pas par un ajustement
  d'intuition.
- **Le lexique qui grossit sans fin.** Chaque forme de surface manquante est
  une tentation d'en ajouter dix « pendant qu'on y est ». La règle est la même
  que pour la table d'alias de FF-038 : on ajoute ce qu'une **mesure** a montré
  absent, jamais ce qu'on imagine. Un lexique gonflé à l'intuition finit par
  apparier des mots qui ne sont pas des aliments.
- **Croire que la consigne suffit.** Une règle qui n'existe que dans le prompt
  n'est pas une garantie — ce fichier le documente déjà trois fois pour le
  plafond de plats, les absences et le temps de session. La vérification au
  parseur n'est pas une ceinture de trop : c'est la moitié qui rend la promesse
  vraie.
- **Faire du retry une boucle.** « Deux relances valent mieux qu'une » est faux
  ici : la deuxième coûte une génération complète pour un gain non mesuré, et le
  plan sort de toute façon. La borne est dans R7, et elle se défend par le
  §10 — pas par le confort.

## 10. Ce qu'on mesure

- **La mesure principale, et elle est faisable AVANT de livrer :** on passe les
  603 plats déjà en base au détecteur et on sort la part de plats principaux
  qui portent une ancre. C'est le « avant ». Le « après » se lit sur les plans
  écrits avec le nouveau `MEAL_PROMPT_VERSION`.
- **La mesure secondaire :** part de générations qui déclenchent une relance,
  et part de relances qui règlent le problème. Une relance qui ne règle
  presque rien est une relance à retirer.
- **La contre-mesure :** `rejected_numeric` après le bump. Si elle monte, la
  nouvelle ligne de consigne a poussé le modèle vers le chiffre — la faute est
  dans la formulation, pas dans la vérification.
- **La seconde contre-mesure :** part de plats qui portent une issue
  `protein_source_missing` alors qu'un humain lisant le plat y voit une ancre.
  C'est le taux de faux positifs du lexique, et il se juge à la main sur un
  échantillon. S'il dépasse quelques pour cent, le lexique est à compléter avant
  d'armer la relance — pas après.

## 11. Questions ouvertes

1. **Le plan hebdo (`week_plan_generation.ts`) n'est pas couvert.** Il produit
   des LIGNES DE MÉTHODE (« construis ton déjeuner autour d'une ancre
   protéique »), pas des plats : `WeekPlanItem` n'a ni `ingredients` ni `slot`,
   et il n'y a donc rien à apparier. L'ancre ne s'y applique pas, et c'est un
   constat de structure, pas un oubli — vérifié fichier en main le 2026-08-10.
   Ce qui reste ouvert est plus étroit : ses lignes `nutrition` pourraient citer
   l'ancre comme conviction, mais elles doivent tracer à une conviction DU
   COACH, et l'ancre n'en est pas une. À instruire avec le pilotage maison
   (étape 6 du chantier), où la philosophie de Sophia devient une doctrine
   publiée qui, elle, a des clés citables.
2. **`dairy_cheese` exclu — à réviser sur mesure.** Voir §9. La donnée qui
   tranchera est le calcul en grammes de FF-039, pas une intuition.
3. **Le seuil de « repas principal » est le créneau, pas la taille.** Un élève
   qui déclare `snack_pm` en `large` mange peut-être un vrai repas à 17h. On ne
   le vérifie pas : `MEAL_SIZES` est relatif et sans unité, et en tirer un
   statut de repas principal serait une déduction. À rouvrir si la mesure du
   §10 montre des collations `large` systématiquement dépourvues d'ancre.
