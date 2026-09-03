# FF-030 · Le contexte de composition

| | |
|---|---|
| **Identifiant** | `FF-030-le-contexte-de-composition` |
| **Statut** | 🟡 volet coach spécifié · 🟢 volet élève livré, **non déployé** |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) (1:N, la doctrine est le produit du coach) · [CONTRACT.md](../../keel/CONTRACT.md) |
| **Dépend de** | `doctrine.ts` (`compileDoctrineBlock`) · `doctrine_loader.ts` · `protocol_compiler.ts` (`protocolFoodBlock`) · `meal_generation.ts` (`buildMealPrompt`) |
| **Effort estimé** | 1 à 2 jours pour le volet coach · 1 jour pour le volet élève |

> **Cette fiche a DEUX volets, chacun avec ses onze sections.**
>
> Une consigne de composition a deux moitiés, écrites par deux personnes
> différentes, et elles ne se gouvernent pas pareil. Le **volet coach**
> (ci-dessous) traite de ce que le COACH met dans la consigne — sa méthode, son
> mapping — et de ce qui n'y a rien à faire. Le **[volet élève](#volet-élève--ce-que-le-produit-met-dans-la-consigne)**
> traite de ce que le PRODUIT y met de l'élève : son corps, ses contraintes
> dures, sa direction.
>
> Les fondre aurait produit une fiche dont on ne pourrait pas dire qui doit la
> lire.

---

# Volet coach — ce que le coach met dans la consigne

---

## 1. Le problème

Le générateur de repas reçoit la méthode du coach dans un bloc — et ce bloc est
celui de la **conversation**, injecté tel quel.

Mesuré le 2026-08-08 sur une doctrine réelle et complète, semaine de 7 jours,
4 moments par jour :

| | tokens |
|---|---|
| `systemPrompt` | 2 261 |
| `userMessage` | 2 010 |
| **total** | **~4 300** |
| dont bloc doctrine | 1 415 (33 %) |

**Il n'y a pas de problème de taille.** 4 300 tokens est un contexte
confortable, et c'est la première chose que cette fiche établit — parce que
l'intuition naturelle devant « beaucoup d'entrées » est d'ajouter une couche de
résumé, et que ce serait une erreur (voir §3 hors périmètre).

Le problème est la **pertinence**. Découpage section par section du bloc
doctrine tel qu'il part aujourd'hui dans un prompt de repas :

| part | section | compose un repas ? |
|---|---|---|
| 30 % | `FORBIDDEN` (pratiques) | oui — mais 19 % de la section sont des `surfaceForms` |
| 23 % | `WHAT THIS COACH BELIEVES` | oui |
| 14 % | `HOW THIS COACH ANSWERS` | **non** |
| 11 % | `WHAT THIS COACH HAS ALREADY ANSWERED` | **non** |
| 10 % | préambule | oui |
| 8 % | `FOODS…NOT ON A PLATE` | oui |
| 3 % | `THIS COACH'S WORDS` | **non** |
| 2 % | `VOICE` | **non** (sauf la langue — voir §11) |

≈ **36 %** du bloc, soit ~500 tokens par génération, est de la matière
conversationnelle : des paires question/réponse dans la voix du coach, son
vocabulaire, son ton, et six façons de dire « à jeun ».

**Ce que ça coûte.** Pas des tokens — du **ton**. Des Q/R écrites pour répondre
à un élève, posées à côté d'une consigne de composition, apprennent au modèle à
écrire des plats comme il écrirait une réponse. Et les `surfaceForms` sont pires
qu'inutiles : elles décrivent comment un ÉLÈVE formule une demande, alors que ce
générateur ne lit aucune parole d'élève.

## 2. Job stories

> **Quand** j'écris ma méthode, **je veux** qu'elle gouverne les plats de mes
> élèves, **pour que** ce qu'ils mangent soit de moi et pas d'un modèle.

> **Quand** je remplis mon mapping alimentaire, **je veux** qu'il soit lu en
> entier, **pour que** l'aliment que j'ai exclu n'atterrisse pas dans une
> assiette.

> **Quand** je change une conviction, **je ne veux pas** qu'une couche
> intermédiaire décide de ce qui en survit, **pour que** ce que l'élève reçoit
> soit traçable jusqu'à la phrase que j'ai écrite.

## 3. Périmètre

### Dans le périmètre
- Une **variante « composition »** du bloc doctrine : les sections qui
  gouvernent un plat, sans celles qui gouvernent une conversation.
- Le **mapping alimentaire inchangé**, en entier.
- La **langue d'écriture** portée jusqu'au générateur (§11 n°1).
- Le volet **élève** (rythme, absences, préférences, mesures) : à écrire
  **dans une seconde passe de cette fiche**, une fois le volet coach livré.

### Hors périmètre — engageant
- ❌ **Aucun résumé IA de la doctrine.** Ce n'est pas un arbitrage de coût,
  c'est une impossibilité structurelle : le bloc est la **source des
  citations**. `doctrineBeliefsFor` rend exactement les convictions du bloc, le
  générateur doit tracer chaque ligne de méthode à une clé, et la base le
  vérifie (`student_week_plans_doctrine_traceable_check`). Un résumé qui fond
  cinq convictions en une phrase supprime les clés — la traçabilité casse. Un
  résumé qui garde toutes les clés n'est pas un résumé.
- ❌ **Aucun résumé IA du mapping alimentaire.** `coach_food_items` est une
  table structurée sur un vocabulaire fermé de groupes ; un `label` fait 11
  caractères en moyenne. Résumer une liste de termes, c'est en perdre.
- ❌ **On ne touche pas au bloc de la conversation.** Il reste ce qu'il est.
  Cette fiche ajoute une variante, elle n'en modifie aucune.
- ❌ **On ne retire rien du chemin de DONNÉES.** Les `surfaceForms` sortent du
  **prompt**, pas de `args.doctrine` : voir R2.

## 4. Le circuit

```
  coach_doctrines           coach_food_items
   /coach/doctrine           /coach/protocol
        │                          │
        ↓                          ↓
  compileDoctrineBlock       protocolFoodBlock
   (filtré par objectif)      (filtré par objectif)
        │                          │
        ├── variante CHAT ─────────┼──→ sophia-brain   (inchangé)
        │   voix, Q/R, vocabulaire │
        │                          │
        └── variante COMPOSITION ──┴──→ buildMealPrompt   ← CE QU'ON AJOUTE
            convictions, interdits,
            aliments, langue
                                        ↓
                                  parseGeneratedMeal
                                        │
        ┌───────────────────────────────┘
        ↓
  applyKeelOutputLocks(text, doctrine)   ← LIT `args.doctrine`, PAS LE PROMPT
        surfaceForms des interdits et des aliments
```

**Le verrou est la raison pour laquelle ce nettoyage est sûr.**
`applyKeelOutputLocks` tourne sur la prose générée (titres, méthodes, `why`,
ingrédients, liste de courses) et reçoit `forbidden` + `foods` par le **chemin
de données**, en paramètre de `parseGeneratedMeal`. Retirer les `surfaceForms`
du bloc de prompt ne lui enlève rien : il ne l'a jamais lu.

## 5. Modèle de données

**Néant de neuf.** Aucune colonne, aucune table. Une variante de compilation de
plus sur des données déjà écrites — et `compileAllDoctrineVariants` existe déjà.

Le contenu de la variante composition, champ par champ :

| source | dans le bloc composition ? | pourquoi |
|---|---|---|
| `beliefs[].key` | **oui, obligatoire** | source de citation, CHECK de traçabilité |
| `beliefs[].claim` + `.rationale` | oui | c'est la méthode |
| `beliefs[].goalScope` | oui (filtre) | déjà appliqué |
| `forbidden[].token` + `.reason` | oui | « pas de séance à jeun » décide du repas d'avant |
| `forbidden[].surfaceForms` | **non** | matcher de la parole d'élève ; le verrou les a déjà |
| `forbidden[].instead` | déjà absent | n'entre pas dans ce bloc |
| `foods.discouraged[].term` + `.reason` | oui | un aliment à ne pas plater |
| `foods.discouraged[].surfaceForms` | **non** | idem |
| `arbitrations[]` | **non** | few-shot de ton sur un élève qui craque |
| `qa[]` | **non** | répond à des questions ; un plat n'en pose pas |
| `vocabulary[]` | **non** | pour parler comme lui |
| `voice.address` / `.length` / `.emojis` | **non** | sans objet sur un titre de plat |
| `voice.language` | **oui — et il manque** | §11 n°1 |
| `dailyPractices[]` | déjà exclu | délibérément, et documenté sur le type |
| `protocolFoodBlock` (4 sections) | **oui, en entier** | tout y compose |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | La variante composition porte **exactement** les clés de conviction que le générateur peut citer | C'est déjà l'invariant de `doctrineBeliefsFor`. Une variante qui filtrerait autrement que la liste rendrait la citation d'une clé absente du prompt — donc un plat qui se réclame d'une conviction que le modèle n'a pas lue. |
| R2 | Retirer les `surfaceForms` du prompt **ne les retire pas** de `args.doctrine` | Le verrou de sortie est la garde ; le prompt est une consigne. Les confondre est la façon dont on désarme une ceinture en croyant nettoyer. |
| R3 | Aucune section de la variante n'est produite par un modèle | Voir §3. Le bloc est la source des citations. |
| R4 | Le mapping alimentaire part **en entier**, sans troncature ni sélection | Un aliment exclu qu'on ne montre pas est un aliment qui arrive dans l'assiette. |
| R5 | Une doctrine vide rend le même bloc de repli qu'aujourd'hui | `NO_COACH_METHOD_BLOCK` / `NO_DOCTRINE_FOR_THIS_GOAL_BLOCK`. Le chantier est additif : un coach sans méthode reçoit le produit d'avant. |
| R6 | Le bloc de la conversation est **inchangé, octet pour octet** | Deux variantes d'une même source ne doivent pas se déplacer ensemble par accident. Un test compare l'ancien rendu au nouveau sur la lane chat. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| La variante composition oublie une section qui gouverne un plat | Le plan est composé **sans** cette partie de la méthode, en silence. C'est le mode le plus grave, et le seul que R1 ne couvre pas : la parade est un test qui compare les deux variantes et **liste** ce que la composition laisse tomber, plutôt qu'un test qui vérifie ce qu'elle garde. |
| Un `goalScope` filtre tout | `empty_for_goal`, bloc de repli nommé. Déjà tenu. |
| Le mapping alimentaire est absent | Chaîne vide, aucun bloc de repli — c'est la doctrine qui porte « il n'a pas tranché ». Déjà tenu, et délibéré. |
| La langue du coach n'est pas celle de l'élève | À trancher (§11 n°1). Aujourd'hui la question ne se pose pas : `voice.language` n'arrive pas. |
| Un coach modifie sa doctrine pendant une génération | Le bloc est compilé au chargement, la génération finit sur la version qu'elle a lue. Pas de changement. |

## 8. Critères d'acceptation

```gherkin
Étant donné une doctrine avec des convictions, des interdits, des Q/R,
  du vocabulaire et une voix
Quand un plan de repas est composé
Alors la consigne contient les convictions et les interdits
Et ne contient ni Q/R, ni vocabulaire, ni consigne de tutoiement
```

```gherkin
Étant donné un interdit qui porte six formulations de surface
Quand un plan de repas est composé
Alors la consigne ne contient aucune de ces formulations
Et le verrou de sortie les reconnaît toujours dans la prose générée
```

```gherkin
Étant donné une doctrine inchangée
Quand un tour de conversation est composé
Alors le bloc injecté est identique, caractère pour caractère, à celui d'avant
```

```gherkin
Étant donné un coach sans doctrine publiée
Quand un plan de repas est composé
Alors la consigne porte le même bloc de repli qu'avant ce chantier
```

## 9. Rabbit holes

- **La tentation du résumé.** Elle revient dès qu'on regarde la liste d'entrées
  et qu'on la trouve longue. Elle est traitée en §3, et la raison n'est pas le
  coût : c'est la traçabilité. Relire ce paragraphe avant de rouvrir la
  question.
- **Deux variantes qui divergent.** Le jour où quelqu'un ajoute une section à la
  doctrine, il l'ajoutera à une seule des deux. La parade est en §7 : un test
  qui liste l'écart, pas un test qui vérifie une liste figée.
- **Confondre le prompt et le verrou.** `surfaceForms` sort du prompt et reste
  dans les données. Quelqu'un qui « nettoie » en retirant le champ de
  `args.doctrine` désarme une ceinture médicale sans s'en apercevoir — le test
  du §8 n°2 existe pour ça.
- **Croire que ce chantier améliore la pertinence.** Il retire du bruit. Le vrai
  levier de pertinence est ailleurs : voir §11 n°2.

## 10. Ce qu'on mesure

- **La mesure :** part de plats dont la ligne de méthode trace à une conviction
  du coach, avant / après. Et taille du bloc composition en tokens — attendu
  ~900 contre 1 415.
- **La contre-mesure :** part de plats **rejetés par le verrou de sortie**. Si
  elle monte après le nettoyage, c'est que le prompt tenait une partie du
  travail du verrou et qu'on l'a retirée — auquel cas la section retirée
  n'était pas conversationnelle, et il faut la remettre.

## 11. Questions ouvertes

1. **`voice.language` n'atteint pas le générateur de repas.** Il lit
   `student_goals.content_locale`. Un coach dont la doctrine est en `fr-FR`
   peut donc recevoir des plats en anglais — c'est une cicatrice déjà connue du
   dépôt sur une autre lane. À poser dans le bloc composition, mais il faut
   trancher : la langue du COACH ou celle de l'ÉLÈVE ? Ce ne sont pas les mêmes
   dans une cohorte internationale.
2. ⚠️ **La portée par objectif existe et personne ne s'en sert.** Mesuré sur une
   doctrine réelle : bloc **identique** pour `fat_loss`, `muscle_gain` et
   `health` (5 660 caractères à chaque fois), parce qu'aucune conviction ne
   porte de `goalScope`. Le filtre marche, il n'a rien à filtrer.

   C'est probablement un plus gros levier de pertinence que tout ce que cette
   fiche décrit — et c'est un problème d'écran côté coach, pas de compilation.
   À instruire séparément.
3. ~~**Le volet élève reste à écrire.**~~ Écrit le 2026-08-10, ci-dessous.

---

# Volet élève — ce que le PRODUIT met dans la consigne

| | |
|---|---|
| **Statut** | 🟢 Livrée en local, **non déployée** — `supabase functions deploy` demande une validation humaine |
| **Date** | 2026-08-10 |
| **Dépend de** | `meal_generation.ts` (`buildMealPrompt`) · `safety_constraints.ts` (`safetyConstraintsPromptBlock`) · `student_body_io.ts` (`loadStudentBody`) · `student_age.ts` (`ageBandOf`) · `restriction_runtime.ts` (`evaluateRestrictionForStudent`) |
| **Effort estimé** | 1 jour — câblage, aucun appel modèle de plus |

## 1. Le problème

Le générateur de repas écrit de vrais plats, avec de vrais ingrédients et une
liste de courses. **Cinq entrées que le produit collecte ne l'atteignent
jamais.** Vérifié le 2026-08-08, zéro occurrence dans
`supabase/functions/generate-meal-v1/index.ts` :

| entrée | où elle est collectée | état mesuré |
|---|---|---|
| contraintes dures (allergies, maladies) | `student_safety_constraints` | chargées, mais passées **seulement** à `parseGeneratedMeal` — le verrou de SORTIE |
| `height_cm` | `/app/plan` → Basic info | colonne, écran, et un commentaire de migration qui dit « sert aux PORTIONS ». **Zéro lecteur.** |
| `birth_date`, `gender` | `/app/plan` → Basic info | ajoutés le 2026-08-08. Zéro lecteur. |
| poids, tour de taille | `student_body_measures` (FF-031), miroir `weekly_reviews.biofeedback` | le générateur de repas ne lit ni l'une ni l'autre |
| `focus_axis` | `/app/plan` → Your goal | pas même dans le `select` de `student_goals` |

Conséquence directe : **pour dimensionner une portion, le moteur a le nombre de
personnes à table et la taille déclarée du repas. Rien sur le corps.** Le prompt
système lui demande pourtant explicitement de dimensionner (« one adult portion
is roughly a palm of protein, a fist of starch ») — il le fait sur une personne
moyenne qui n'existe pas.

### Le cas le plus grave : les allergies

`generate-meal-v1` appelle bien `loadStudentSafetyConstraints` (index.ts:361),
et ne passe le résultat qu'à `parseGeneratedMeal` (index.ts:568) — c'est-à-dire
au **verrou de sortie**. Le modèle compose sans savoir.

Et le verrou est binaire. `meal_generation.ts:1807` :

```ts
dishes:           clean ? dishes : [],
preparations:     clean ? preparations : [],
cooking_sessions: clean ? cookingSessions : [],
shopping_list:    clean ? finalShopping : [],
```

`clean` est calculé sur **la concaténation de tous les plats** (ligne 1654).
Un seul plat qui touche l'allergène rend `meal.dishes.length === 0`, et
l'appelant répond `empty_meal` en 422 (index.ts:596). **Pour un plat, l'élève
allergique perd la semaine entière**, sans qu'aucun écran ne sache lui dire
pourquoi.

Les deux autres lanes injectent déjà les contraintes dans leur prompt :
`week_plan_generation.ts:467` et `sophia-brain/router/run.ts:2239`, toutes deux
via `safetyConstraintsPromptBlock`. Le générateur de repas est le seul à ne pas
l'avoir — et son propre appelant frère, `generate-household-meal-v1`, porte la
même absence au même endroit.

**Ce que ça coûte de ne rien faire.** Un élève anaphylactique paie sa sécurité
en semaines vides, aléatoirement, sans explication. Tous les autres reçoivent
des quantités posées sur une personne moyenne. Et cinq champs collectés à
l'écran mentent à celui qui les remplit : le produit lui a demandé sa taille et
n'en fait rien.

## 2. Job stories

> **Quand** j'ai déclaré une allergie, **je veux** que le moteur compose en la
> sachant, **pour que** ma semaine ne soit pas vide un jeudi sur trois sans que
> personne ne me dise pourquoi.

> **Quand** je mesure 1,58 m et que ma coloc en mesure 1,88, **je veux** que
> l'assiette ne soit pas la même, **pour que** la quantité écrite soit celle que
> je vais vraiment manger.

> **Quand** j'ai dit que ce que je veux voir monter c'est mon énergie,
> **je veux** que ça change les plats, **pour que** remplir ce champ ait servi à
> quelque chose.

## 3. Périmètre

### Dans le périmètre

- Les **contraintes dures dans la consigne**, en tête, via
  `safetyConstraintsPromptBlock` — la fonction et le placement qui existent
  déjà sur la lane hebdo. Le verrou de sortie reste intact.
- Le **corps** : taille, poids actuel, tour de taille actuel, bande d'âge, sexe.
- **`focus_axis`**, sans lequel `performance` et `health` n'ont aucun indicateur
  de direction (le jeton `goal` ne dit rien de plus que « santé »).
- La **restructuration de `== THIS STUDENT ==`** en sous-sections datées /
  durables (§4).
- Le **plancher TCA sur la consigne** : sous `restriction_flag`, ni taille ni
  poids ne partent au modèle.
- Le même câblage sur **`generate-household-meal-v1`**, qui partage
  `buildMealPrompt` — pour les contraintes dures. Pas pour le corps : voir R7.

### Hors périmètre — engageant

- ❌ **La cible chiffrée.** `target_weight_kg` et `target_waist_cm` n'entrent
  pas. Le nombre ne change pas ce qu'on met dans l'assiette, et un modèle qui
  lit « vise 72, en pèse 98 » raisonne en écart, en déficit et en délai : le
  terrain d'énergie que [CONTRACT.md](../../keel/CONTRACT.md) clôture. **La
  direction passe déjà** par le jeton `goal` (`fat_loss` = ça descend), et
  désormais par `focus_axis`.
- ❌ **La projection « en combien de temps ».** Décidée, mais c'est une
  fonctionnalité à part avec son propre plancher : la copie affichée sous le
  champ de cible dit déjà « *nobody is scored against it* »
  (`plan.goal.target_hint`), et une date de rendez-vous la contredirait.
  ⟳ **2026-09-01 : la citation a maigri, et c'est voulu.** La clé disait aussi
  « *Nothing counts down* » — retiré, parce que c'était faux : la cible donne la
  direction sur laquelle les grammages sont calibrés (lot L8). C'est la moitié
  restante qui porte l'argument ici, et elle le porte seule. Elle se calcule côté
  produit (arithmétique, aucun appel modèle), s'affiche en **allure** et non en
  date, jamais sous `restriction_flag`, et sur `/app/progress` — pas dans le
  plan. À écrire comme fiche.
- ❌ **Toucher au stockage du poids.** Un chantier séparé le fait
  (FF-031, `student_body_measures`). Ici on LIT ce qui existe, par le chemin qui
  existe: `loadStudentBody`, qui interroge la table datée d'abord et retombe sur
  le miroir `weekly_reviews.biofeedback`. Ce chargeur est passé à la table datée
  pendant l'écriture de ce volet, et ça n'a rien changé ici — c'est exactement
  ce qu'un lecteur qui n'invente pas son propre accès à la donnée doit coûter.
- ❌ **Aucun appel modèle supplémentaire.** Tout ce volet est du câblage.
- ❌ **Aucun IMC, aucun besoin énergétique, aucune catégorie.** Même frontière
  que `student_body_io.ts` : on rend ce que l'élève a déclaré, on ne le
  recatégorise pas en verdict.

## 4. Le circuit

```
  student_safety_constraints    profiles                 weekly_reviews
   (allergies, maladies)         height_cm                 biofeedback
        │                        birth_date                weight_kg
        │                        gender                    waist_cm
        │                          │                          │
        │                          └──────────┬───────────────┘
        │                                     ↓
        │                            loadStudentBody()        student_goals
        │                          (+ height_cm, gender)       goal
        │                                     │                focus_axis
        │                                     ↓                situation
        │                            mealBodyContext()            │
        │                                     │                   │
        │              evaluateRestrictionForStudent()            │
        │                          │          │                   │
        │                          ↓ TCA      ↓                   │
        ↓                    ┌─────────────────────┐              │
  safetyConstraints          │ taille/poids RETIRÉS│              │
  PromptBlock()              │ âge/sexe CONSERVÉS  │              │
        │                    └─────────┬───────────┘              │
        │                              │                          │
        └──────────────┬───────────────┴──────────────────────────┘
                       ↓
                buildMealPrompt()
                       │
   == HARD CONSTRAINTS — THESE WIN OVER EVERYTHING ==   ← NOUVEAU, en tête
   == <COACH>'S METHOD ==                                inchangé
   == <COACH>'S FOOD MAPPING ==                          inchangé
   == THE CONVICTION KEYS YOU MAY NAME ==                inchangé
   <note 1:1 du coach>                                   inchangé
   == THIS STUDENT ==
     -- WHO THEY ARE --            taille, bande d'âge, sexe      ← NOUVEAU
     -- WHAT THEY ARE AFTER --     goal + focus_axis + situation  ← axe NOUVEAU
     -- WHERE THEY ARE NOW --      dernier poids, tour de taille  ← NOUVEAU
     -- HOW THEIR DAY RUNS --      rythme + tailles               existant
     -- WHEN THEY ARE NOT HERE --  away_days                      existant
     -- WHAT THEY CAN COOK --      capacité (5 champs)            existant
     -- WHAT THEY HAVE TOLD ME --  food_preferences (≤20)         existant
     -- THIS TIME --               context + envie + parts + placards
   == WHAT IS IN SEASON WHERE THEY ARE ==                inchangé
   == WHAT TO COOK ==              la DEMANDE, en dernier
                       │
                       ↓
                parseGeneratedMeal()  ──→  applyKeelOutputLocks()
                                            LE VERROU RESTE INTACT
```

**Durable et daté sont séparés, et c'est le point de la restructuration.**
Aujourd'hui tout est mélangé sous `== THIS STUDENT ==` : le mariage de mardi et
« je mange à la cantine » se lisent au même rang, et une contrainte d'une
semaine devient une propriété permanente. Le dépôt a déjà tranché exactement ça
une fois, pour `situation` vs `context` (`meal_generation.ts:1038`) ; les
sous-sections généralisent cet arbitrage au reste.

## 5. Modèle de données

**Néant de neuf. Aucune colonne, aucune table, aucune migration.** Tout ce que
ce volet injecte est déjà écrit quelque part, et c'est précisément le problème
qu'il traite.

| champ | source | saisi / dérivé | lecteur AVANT | lecteur APRÈS |
|---|---|---|---|---|
| contraintes dures | `student_safety_constraints` | saisi (élève ou coach) | `parseGeneratedMeal` seul | + `buildMealPrompt` |
| `height_cm` | `profiles` | saisi | **aucun** | `loadStudentBody` |
| `gender` | `profiles` | saisi, liste fermée | **aucun** | `loadStudentBody` |
| bande d'âge | dérivée de `profiles.birth_date` | **dérivée à chaque lecture** | `generate-week-plan-v1` | + `generate-meal-v1` |
| dernier poids | `student_body_measures`, repli `weekly_reviews.biofeedback.weight_kg` | saisi (3 gestes) | `generate-week-plan-v1` (en TENDANCE) | + `generate-meal-v1` (en VALEUR) |
| dernier tour de taille | idem, clé `waist_cm` | saisi | idem | idem |
| `focus_axis` | `student_goals` | saisi, liste fermée, `health`/`performance` seulement | `generate-week-plan-v1` | + `generate-meal-v1` |
| `restriction_flag` | dérivé à la lecture par `evaluateRestrictionForStudent` | **jamais stocké** | 5 lanes | + `generate-meal-v1` |

Un seul champ nouveau, et il n'est pas persisté : `MealBodyContext`, la forme
que le corps prend pour entrer dans une consigne. Il vit dans un module pur.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Les contraintes dures entrent **en tête** du `userMessage`, avant la doctrine, par `safetyConstraintsPromptBlock` — la fonction existante, pas une seconde | Si le budget de prompt tronque quoi que ce soit, ce n'est pas la ligne qui dit « pas d'arachide » qui doit sauter. C'est le commentaire écrit sur `week_plan_generation.ts:467` ; on copie le placement au lieu d'en inventer un. Une deuxième fonction de rendu divergerait de la première, et c'est la moitié MÉDICALE du double verrou. |
| R2 | Le verrou de sortie ne change pas d'un octet | Le prompt est une consigne, le verrou est une garde. Ce volet informe le modèle ; il ne déplace aucune garantie dans le prompt. Confondre les deux est la façon dont on désarme une ceinture en croyant l'améliorer. |
| R3 | `safetyConstraints`, `body` et `focusAxis` sont **REQUIS** sur `buildMealPrompt` — `T` ou `T \| null` explicite, jamais `T?` | `meal_generation.ts` écrit cette règle trois fois et l'a payée trois fois (`eatingRhythm`, `awayDays`, `cookingTimeMin`). Sa formulation exacte : « Optionnel, il serait ré-oublié par le prochain appelant, en silence, et la seule preuve serait une journée trouée. » Ici la preuve serait une assiette. Le typage force le compilateur à **lister les appelants** — et il y en a deux, dont un qu'on aurait oublié. |
| R4 | Sous `restriction_flag`, **ni taille ni poids ni tour de taille** n'entrent dans la consigne. Âge et sexe restent | Le plancher TCA vaut pour ce que le MODÈLE lit, pas seulement pour ce que l'écran affiche : un modèle à qui on donne un poids et une direction `fat_loss` compose en écart. Âge et sexe restent parce qu'ils **ne se visent pas** — on ne peut pas restreindre pour changer son âge. |
| R5 | La garde de R4 vit **dans la fonction pure**, pas chez l'appelant | Une garde appliquée par l'appelant est une garde que le prochain appelant oublie. `MealBodyContext.restrictionFlag` est un champ requis du type : composer un contexte de corps sans avoir répondu à la question ne compile pas. |
| R6 | Une lecture du plancher **en échec vaut `true`** | Fail-closed, contrairement au fail-open nommé de `meal-photo-upload-v1`, et pour une raison asymétrique : ici, se fermer rend exactement le produit d'hier (une portion dimensionnée sans le corps), pendant que s'ouvrir met un poids sous les yeux du modèle pour un élève qu'on n'a pas su évaluer. Le coût du faux positif est nul ; celui du faux négatif ne l'est pas. |
| R7 | Le corps est **`null` sur la lane foyer** | `generate-household-meal-v1` compose pour plusieurs personnes. Il n'y a pas UN corps à passer, et en choisir un — celui du titulaire — dimensionnerait l'assiette de tout le foyer sur lui. Les contraintes dures, elles, y entrent : elles sont l'UNION des membres, et c'est déjà ce que la lane charge. |
| R8 | L'âge part en **bande**, jamais en nombre | Arbitrage déjà écrit sur `ageBandOf` : « le modèle n'a aucun usage légitime de *34* qu'il n'ait de *adulte* », et une bande ne peut pas ressortir telle quelle dans une prose (« à 34 ans, vous… »), ce qu'un nombre exact finit toujours par faire. On l'applique ici plutôt que d'en réinventer un autre. |
| R9 | La consigne **interdit explicitement de citer les mesures** à l'élève | `findNumericTarget` ne mord que sur l'énergie et les macros : « à 178 cm, ton dîner… » traverserait le filtre sans une alerte. La même clause existe déjà sur la lane hebdo (`trendClause`, `student_body.ts:218`) et y est accrochée **aux deux branches** exprès. On copie la phrase. |
| R10 | Un élève dont on ne sait **rien** reçoit la même consigne qu'un élève **sans corps du tout** — et le plancher n'y change rien | Condition de désarmement, et c'est le cas de tous les élèves existants. Testée par **égalité de chaînes**, pas par inspection: un test qui vérifie « il n'y a pas de ligne de taille » laisserait passer un en-tête vide, un saut de ligne de plus, ou un « not stated » ajouté six mois plus tard. La seconde moitié compte autant: si le plancher rendait une consigne DIFFÉRENTE pour quelqu'un dont on ne sait rien, il deviendrait observable dans le prompt — et un modèle qui remarque une absence la commente. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| `loadStudentSafetyConstraints` échoue | **Inchangé** : l'appelant journalise et continue avec `constraints = null`. Le bloc de prompt rend `null`, le verrou de sortie reçoit `null`. C'est le fail-open existant, et ce volet le rend **moins** grave, pas plus : avant, l'échec laissait le modèle aveugle ET le verrou vide ; il n'en laisse maintenant qu'un des deux — ce qui est exactement l'argument écrit dans l'en-tête de `safetyConstraintsPromptBlock`. |
| `loadStudentBody` échoue | La génération continue **sans corps** (`body: null`). Une portion moins bien dimensionnée est le produit d'hier ; refuser le dîner de quelqu'un parce qu'on n'a pas su lire sa balance serait la mauvaise moitié de l'arbitrage. Journalisé nommément. |
| `evaluateRestrictionForStudent` échoue | `restrictionFlag = true` (R6). Taille et poids ne partent pas. Journalisé nommément — sinon un plancher qui échoue en boucle ressemblerait à un élève sans mesures. |
| L'élève n'a jamais saisi sa taille | La ligne n'existe pas. **Pas de « taille : non renseignée »** : une ligne qui annonce une absence occupe le même rang qu'une contrainte et invite le modèle à la commenter. |
| L'élève n'a jamais été pesé | Idem — pas de sous-section `-- WHERE THEY ARE NOW --` du tout. |
| Le poids en base date de six semaines | Il part **avec sa date**. « 78 kg » ne dit rien, « 78 kg, semaine du 30 juin » dit quelque chose — et c'est la règle déjà posée sur `DatedMeasure`. Sans la date, le modèle traite une mesure de février comme celle d'aujourd'hui. |
| `focus_axis` est posé sur un objectif qui ne l'accepte pas | Impossible en base (`student_goals_focus_axis_goal_check`). Le lecteur ne s'en protège pas : une garde qui duplique un CHECK est une garde qui divergera du CHECK. |
| **Le silencieux, et le plus probable** : quelqu'un ajoute une sixième entrée au corps et oublie une lane | Le compilateur le dit, parce que le paramètre est requis (R3). C'est la seule parade qui ait tenu dans ce fichier. |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève portant une contrainte `allergen_ref='peanut'`, severity medical
Quand une consigne de composition est construite
Alors elle contient "peanut" AVANT le bloc de doctrine du coach
Et le verrou de sortie reconnaît toujours le terme dans la prose générée
```

```gherkin
Étant donné un élève de 1,72 m, pesé à 74 kg la semaine dernière
Et que son plancher TCA est levé (`restriction_flag` vrai)
Quand une consigne de composition est construite
Alors elle ne contient ni "172" ni "74"
Et elle contient toujours sa bande d'âge et son sexe
```

```gherkin
Étant donné un élève dont l'objectif est `health` et l'axe `energy`
Et qui a saisi une cible de poids de 72 kg
Quand une consigne de composition est construite
Alors elle nomme l'axe "Day-to-day energy"
Et elle ne contient nulle part le nombre 72
```

```gherkin
Étant donné un élève né le 1er mars 1990, un jour où l'on est le 10 août 2026
Quand une consigne de composition est construite
Alors elle porte une BANDE d'âge, pas le nombre 36
Et cette bande est dérivée de `birth_date`, jamais lue dans une colonne d'âge
```

```gherkin
Étant donné un élève sans taille, sans mesure, sans axe et sans contrainte dure
Quand une consigne de composition est construite
Alors elle est identique, caractère pour caractère, à celle d'avant ce volet
```

## 9. Rabbit holes

- **Croire que le verrou de sortie suffisait.** C'est ce que le code raconte
  aujourd'hui, et c'est faux dans les deux sens : il ne suffit pas (le modèle
  compose à l'aveugle) et il coûte trop cher quand il mord (la semaine entière
  saute pour un plat). Le tenter de « réparer » en rendant le verrou partiel —
  ne jeter que le plat fautif — est la mauvaise réparation : un repas amputé en
  silence de son ingrédient dangereux reste un repas qu'on a servi. La bonne
  réparation est en amont, et c'est ce volet.
- **Passer la cible chiffrée « puisqu'on y est ».** Elle est à deux colonnes de
  celles qu'on lit, dans la même ligne `student_goals`. C'est exactement pour ça
  que le no-go est écrit en §3 plutôt que sous-entendu.
- **Dériver quoi que ce soit.** Taille + poids + âge + sexe est la signature
  d'entrée d'une formule de métabolisme de base, et un modèle sait la calculer
  sans qu'on la lui demande. La consigne doit donc dire ce qu'on attend de ces
  chiffres (dimensionner une assiette) ET ce qu'on n'en attend pas — sinon on a
  livré un compteur de calories par la porte de derrière.
- **La récence de la consigne.** Ce dépôt a mesuré qu'un modèle lit la
  contrainte la plus proche de la fin comme la plus contraignante
  (`household_meal_generation.ts`, et le déplacement du bloc satiété le
  2026-08-08 après un run rouge). La restructuration déplace des blocs : le
  garde-manger cesse d'être le dernier, la DEMANDE le devient. C'est le bon
  ordre — mais c'est un changement de comportement qui ne se voit dans aucun
  test unitaire, et la contre-mesure du §10 est là pour ça.
- **Le jumeau côté écran.** `frontend/src/keel/api/mealGeneration.ts` duplique
  le PARSEUR, pas le constructeur de consigne, et ce volet ne change aucun champ
  du payload rendu. **Vérifié fichier en main le 2026-08-10 : il n'a rien à
  suivre ici.** Ce n'est pas une dispense générale — c'est le résultat d'une
  vérification, et elle doit être refaite au prochain lot qui touche la sortie.

## 10. Ce qu'on mesure

- **La mesure principale :** part de générations qui rendent `empty_meal` avec
  un `lock.reason` médical, sur les élèves qui portent au moins une contrainte
  dure. C'est le chiffre que ce volet doit faire tomber, et c'est celui qui
  décrit la douleur réelle (une semaine vide, pas un prompt mal formé).
- **La mesure secondaire :** part de plats dont la quantité écrite est
  plausible pour la personne — jugée à la main sur un échantillon, avant/après.
  Aucun code ne juge une recette, ce fichier le dit déjà ; on ne va pas
  prétendre le contraire pour se donner un tableau de bord.
- **La contre-mesure, et c'est celle qui compte :** si le nombre de plats
  rejetés par le filtre numérique (`rejected_numeric`) MONTE après ce lot, c'est
  que donner un corps au modèle l'a fait dériver vers la cible chiffrée. Dans ce
  cas la faute est dans la formulation de la consigne, pas dans les données —
  et R9 est la ligne à durcir.
- **La seconde contre-mesure :** si la part de plans qui couvrent tous les jours
  de la fenêtre BAISSE, la restructuration a déplacé une consigne hors du rang
  où elle était lue (voir §9, la récence).

## 11. Questions ouvertes

1. ~~**Le poids lu est celui du miroir.**~~ Réglé pendant l'écriture de ce
   volet: `loadStudentBody` interroge `student_body_measures` d'abord et ne
   retombe sur `weekly_reviews.biofeedback` qu'en repli. Ce lecteur-ci ne verra
   donc rien passer le jour où la double écriture s'arrête.

   Ce qui reste ouvert est plus étroit, et c'est **la granularité**: la table
   datée porte une mesure par PESÉE, `loadStudentBody` en dérive un point par
   SEMAINE, et ce volet n'affiche que le dernier de ces points. Un élève pesé
   mardi et vendredi voit donc partir la moyenne de sa semaine, pas sa pesée de
   vendredi. Pour dimensionner une assiette c'est sans conséquence — la
   moyenne est même la plus juste des deux — mais ce n'est pas ce que la ligne
   de consigne dit (« measured week of… », et c'est écrit exprès). Le jour où
   quelqu'un voudra la dernière pesée à la journée près, il faudra un second
   accesseur, pas un ajustement de celui-ci.
2. **La lane foyer n'a pas de corps, et ce n'est peut-être pas définitif.**
   R7 tranche « aucun corps » parce qu'il n'y en a pas un seul. Une portion de
   foyer pourrait légitimement se dimensionner sur la composition du foyer
   (adultes, enfants, tailles) — ce que `household_turn_context.ts` connaît
   déjà en partie. C'est une fiche à part, et elle a son propre plancher :
   passer le corps d'un enfant à un générateur de repas n'est pas le même
   arbitrage que celui d'un adulte qui l'a saisi lui-même.
3. **`focus_axis` n'existe que pour `health` et `performance`.** Le CHECK SQL
   l'impose. Un élève en `fat_loss` n'a donc aucun moyen de dire « ce que je
   veux voir monter, c'est mon sommeil », alors que les six axes sont collectés
   pour lui chaque dimanche. Le CHECK est probablement le vestige d'un moment où
   l'axe servait à autre chose. À instruire — mais c'est un arbitrage produit
   sur `student_goals`, pas une question de composition.
