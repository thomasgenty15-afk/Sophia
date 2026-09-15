# FF-041 · La méthode du coach, rendue exécutable

| | |
|---|---|
| **Identifiant** | `FF-041-la-methode-du-coach-executable` |
| **Statut** | 🟢 **Livrée** — vérifié le 2026-09-01 : la colonne `composition_steering` est lue par `doctrine.ts`, `coach-doctrine-v1` et `generate-meal-v1` ; `applyPiloting`, `steeredFocus` et `SteeringEntry` existent, et `envelopeFor` porte bien `steering` en **paramètre requis** (`meal_envelope.ts:969`) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) (le coach écrit une doctrine, jamais un plan) · [CONTRACT.md](../../keel/CONTRACT.md) · design d'origine : `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§3 EN ENTIER, dont §3.0, arbitrages A1 et A2) |
| **Dépend de** | [FF-040](FF-040-la-boucle-de-correction.md) · [FF-039](FF-039-enveloppes-et-verdicts-en-observation.md) · `doctrine.ts` (`CoachDoctrine`, `compileDoctrineBlock`, patron `dailyPractices`) · `doctrine_starter.ts` (`STARTER_FORKS`) · `doctrine_delegation.ts` (le coach maison) · `food_items.ts` (`FrequencyRule`) · `week_plan_generation.ts` (`focusFor`) |
| **Effort estimé** | 3 jours |

> **§3.0 du design gouverne cette fiche, et c'est la ligne la plus facile à
> franchir sans s'en apercevoir : le coach ne voit JAMAIS un axe du moteur.**
> Sa surface est sa doctrine. Ce que le moteur exécute en est **dérivé à la
> publication**, exactement comme `compileDoctrineBlock` dérive le bloc chat de
> ses convictions. Le coach écrit sa méthode ; le compilateur en tire les
> jetons — jamais l'inverse.

---

## 1. Le problème

Après [FF-040](FF-040-la-boucle-de-correction.md), le moteur corrige. **Il
corrige selon la philosophie de Sophia, pour tout le monde.**

Un coach dont la méthode est « les calories c'est du vent, on pilote aux
nutriments » a une cohorte dont les plans se font recorriger sur l'énergie. Sa
doctrine est injectée dans le prompt, elle est citable dans le chat, elle est
verrouillée en sortie — et elle n'a **aucune prise** sur la grandeur que le
moteur arbitre. Le produit lui dit « ta méthode gouverne » et exécute la sienne.

Le symétrique est aussi vrai et moins visible : **la philosophie de Sophia n'est
écrite nulle part comme une doctrine.** Elle est en dur dans le code — une
hiérarchie de grandeurs, une table de cadences — donc elle n'est ni versionnée,
ni citable, ni mesurable par version. Le coach maison existe pourtant déjà
(`doctrine_delegation.ts`, `DOCTRINE_SOURCES = ["own","house"]`), et l'inscrit
libre est déjà l'élève ordinaire d'un coach ordinaire à doctrine publiée.

**Ce que ça coûte de ne rien faire.** Deux chemins de code pour une seule
question (« selon quoi compose-t-on ? »), dont un seul est versionné. Et un
coach à qui on a vendu que sa méthode gouverne découvre qu'elle ne gouverne que
ce que le moteur ne décide pas.

## 2. Job stories

> **Quand** j'écris que je ne compte pas les calories, **je veux** que le moteur
> cesse de corriger mes élèves dessus, **pour que** ma méthode soit ce qu'ils
> reçoivent et pas une décoration.

> **Quand** je réponds à une question sur ma méthode, **je ne veux pas** qu'on
> me montre les cadrans d'un moteur, **pour que** je continue d'écrire ce que je
> pense plutôt que de configurer un logiciel.

> **Quand** je choisis une position, **je veux** savoir ce qu'elle produit dans
> les assiettes de mes élèves, **pour que** je puisse changer d'avis en
> connaissance de cause.

## 3. Périmètre

### Dans le périmètre

- **Colonne `coach_doctrines.composition_steering jsonb NOT NULL DEFAULT '[]'`**,
  parsée strictement dans `parseCoachDoctrine`, **exclue de
  `compileDoctrineBlock`** (patron `dailyPractices`).
- **`SteeringEntry`** — le schéma du design §3.1, **exactement**, décisions
  encodées dans le TYPE : pas de `deficit_style: "aggressive"` (A1),
  `"protein" ∈ off` illégal, `carb_timing` hors `performance` rejeté et compté.
- **`applyPiloting(steering, envelope, restrictionFlag)`** — fonction PURE,
  paramètres requis. Sous flag : **écrêtage, jamais reroutage**.
- **`steeredFocus(goal, steering)`** — **enveloppe** `focusFor`, qui reste
  intouchée et testée là où elle est.
- **`envelopeFor` gagne `steering` en paramètre REQUIS** — la casse de
  compilation recense les appelants.
- **La question de doctrine côté coach**, posée comme un débat du point de
  départ (`STARTER_FORKS`), avec **l'effet de chaque position en langage
  plan/aliment**.
- **La publication écrit DEUX choses** : une `DoctrineBelief` ordinaire
  (citable, elle entre dans le bloc chat) et l'entrée de steering qui pointe
  vers elle par `belief_key`.
- **`micro_coverage` consomme les `FrequencyRule` existantes** de
  `coach_food_items` — zéro schéma coach nouveau.
- **Le pilotage maison** publié comme entrée de steering sur la ligne du coach
  maison existant : même format, un seul chemin de code.

### Hors périmètre — engageant

- ❌ **Aucun axe du moteur montré au coach.** §3.0. L'écran pose des
  **positions** en langage coach ; les jetons sont dérivés. Un écran qui
  montrerait `satiety_density` aurait franchi la ligne.
- ❌ **Aucun parseur de prose, nulle part.** Le moteur ne lit que le jeton ; le
  chat ne lit que la conviction. `belief_key: null` ⇒ le moteur exécute, le chat
  n'invente rien (« SILENCE IS NOT A POSITION »).
- ❌ **`deficit_style: "aggressive"` n'existe pas dans le type** (A1). Pas un
  `if` qui le rejette : un token absent. L'asymétrie avec `surplus_style`, qui a
  son `"aggressive"`, **est** la forme que prend la décision.
- ❌ **`"protein" ∈ off` est illégal.** La grandeur à la preuve la plus forte du
  corpus ne peut pas être éteinte pendant que `plant_diversity` reste exposée.
- ❌ **Aucun changement du hash de cache du bloc chat.** Le steering est exclu
  de `compileDoctrineBlock` : `doctrineCacheFootprint` inchangé pour toute la
  base.
- ❌ **La table de cadences MAISON ne gouverne pas une cohorte coachée** (A2).
  Seule la **détection sentinelle** s'applique partout, parce que c'est un
  mécanisme produit. Deux structures distinctes, jamais un drapeau sur la même.
- ❌ **Aucun cadran de distribution protéique par repas.** Écarté par le design
  (§8) : construit sur une variable que Schoenfeld 2013 classe comme bruit hors
  seniors.
- ❌ **Aucune fusion de doctrines.** Quand un coach existe, sa doctrine
  **remplace** intégralement celle de la maison.

## 4. Le circuit

```
  ÉCRAN /coach/doctrine — un DÉBAT, pas un cadran
  ┌──────────────────────────────────────────────────────────────┐
  │ « Sur quoi pilotes-tu une assiette ? »                        │
  │   ○ Les calories, c'est du vent                               │
  │     → ce que ça produit: « tes élèves ne verront jamais un    │
  │       chiffre; leurs plans ne seront plus repris sur          │
  │       l'énergie »                                             │
  │   ○ On pilote aux proportions   ○ Nutriments d'abord          │
  │   ○ Je ne fais pas de règle là-dessus                         │
  └──────────────────────────┬───────────────────────────────────┘
                             ↓ PUBLICATION (atomique, versionnée)
        ┌────────────────────┴────────────────────┐
        ↓                                         ↓
  DoctrineBelief                          SteeringEntry
  claim + rationale + key                 priorities / off / …
  → entre dans compileDoctrineBlock       + belief_key ──┐
  → le CHAT la cite                       → EXCLUE du bloc chat
        ↑                                         │      │
        └──────────── belief_key ─────────────────┘      │
             (appariement, JAMAIS un parseur de prose)   │
                                                          ↓
                            applyPiloting(steering, envelope, restrictionFlag)
                                              │
                     ┌────────────────────────┴──────────────────────┐
                     │ SOUS FLAG: ÉCRÊTAGE, JAMAIS REROUTAGE          │
                     │ `energy` et `proportions` n'ont                │
                     │ STRUCTURELLEMENT rien à piloter                │
                     │ (le type per_portion ne porte pas les champs)  │
                     │ `satiety_density` désarmée · le reste survit   │
                     └────────────────────────┬──────────────────────┘
                                              ↓
                    steeredFocus(goal, steering) ── enveloppe ──→ focusFor()
                                              ↓
                          correctionTokensFor()  (FF-040)
                          les axes `off` n'arbitrent plus
```

**La hiérarchie de préséance (design §3.6), encodée dans l'ORDRE d'application :**

1. Contraintes médicales structurées — verrou binaire, intact
2. Plancher TCA — `restrictionFlag` requis, fail-closed
3. Ceintures produit — plancher de couverture, plafond de déficit (A1), règles
   mineur, filtres numériques. **Hors de la liste des grandeurs, donc
   structurellement non désactivables**
4. Interdits de la doctrine gouvernante — globaux, jamais bornés par objectif
5. Déclarations de l'élève — préséance adhérence (FF-040 R6)
6. Steering — réordonne et éteint (sauf protéine) **à l'intérieur de tout ce qui
   précède**

## 5. Modèle de données

**Une colonne, pas une table.** `coach_doctrines.composition_steering`.

Le choix contre des tables SQL de politique coach est assumé : la méthode de
composition doit vivre **sur l'objet doctrine** versionné, publié, rollbackable.
Un rollback la ramène avec le reste, la version part dans `generated_from`, et
la publication est atomique. C'est exactement le précédent `dailyPractices`.

```ts
const STEERING_AXES = ["protein", "energy", "proportions", "satiety_density",
                       "micro_coverage", "carb_timing", "plant_diversity"] as const;

interface SteeringEntry {
  goal_scope: GoalToken | null;          // parseGoalScope existant
  priorities: SteeringAxis[];            // ordre imposé, dédupliqué
  off: SteeringAxis[];                   // "protein" y est ILLÉGAL
  belief_key: string | null;             // la posture citable
  proportions: { protein_share: "standard"|"high";
                 carb_share: "low"|"standard"|"high";
                 fat_share: "low"|"standard"|"high"; } | null;
  protein_range: "standard" | "high" | "very_high";
  surplus_style: "lean" | "standard" | "aggressive";   // muscle_gain seulement
  deficit_style: "gentle" | "standard";                // PAS d'aggressive — A1
  maintenance_weeks: "auto" | "off";
  recalibration: "observed_trend" | "static";
  carb_timing: "off" | "around_sessions";
}
```

Les CHECKs SQL sont remplacés par une **validation de publication à erreur
bruyante** : une contrainte qui vit dans la base ne peut pas expliquer au coach
ce qu'il a écrit de faux.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Le coach ne voit **jamais** un axe du moteur | §3.0. Sa surface est sa doctrine. Un écran de cadrans transformerait l'auteur d'une méthode en administrateur d'un moteur — et le produit du coach cesserait d'être sa méthode. |
| R2 | `composition_steering` est **exclu de `compileDoctrineBlock`** | Le hash du bloc chat doit être inchangé pour toute la base : zéro refragmentation de cache. Patron `dailyPractices`, et le test d'empreinte existant doit rester vert **octet pour octet**. |
| R3 | `deficit_style: "aggressive"` **n'existe pas dans le type** | A1. Pas un `if` qui rejette : un token absent. Un `if` se retire ; un type se casse. Et une validation de publication bruyante mord sur toute doctrine qui tenterait de le poser. |
| R4 | `"protein" ∈ off` ⇒ **erreur de publication bruyante** | La grandeur au fondement le plus solide du corpus était extinguible pendant que `plant_diversity` restait exposée. `off` retire l'arbitre, jamais l'instrument, jamais un plancher. |
| R5 | Sous flag, le steering est **écrêté, jamais rerouté** | Le flag n'a pas à choisir la grandeur de remplacement d'un coach qui ne l'a pas demandée. Les axes `energy` et `proportions` n'ont structurellement rien à piloter (le type `per_portion` ne porte pas les champs) ; le reste survit tel quel. |
| R6 | La dégradation vit **dans la fonction pure**, jamais chez l'appelant | Une garde qu'un appelant applique est une garde que le prochain appelant oublie. Cicatrice écrite trois fois dans ce dépôt. |
| R7 | `steeredFocus` **enveloppe** `focusFor` ; `focusFor` reste intouchée | Patron `weekEmphasis`. Modifier `focusFor` ferait porter à la lane hebdo le risque d'une régression de composition, et ses tests vivent là-bas. |
| R8 | Condition de désarmement, par **égalité de chaînes** : coach sans steering ⇒ consigne identique au caractère près à la baseline sans-steering **de la même `MEAL_PROMPT_VERSION`** | Le référentiel du désarmement est la version COURANTE du produit, pas les octets d'avant le chantier. L'ancre protéique de FF-037 s'applique à tous : c'est le produit qui avance. |
| R9 | Une entrée malformée est **écartée ET comptée**, jamais repliée en silence | Et elle est **montrée à l'écran coach**. Un repli silencieux fait croire à un coach que sa méthode gouverne alors qu'elle n'a pas été lue. |
| R10 | Une seule grandeur **primaire** par objectif, validée à la publication | Deux primaires, c'est aucune primaire : le moteur trancherait à sa place. |
| R11 | **A2** : la table de cadences maison ne gouverne que les élèves **sans coach**. Seule la détection sentinelle s'applique partout | La sentinelle est un **mécanisme produit** (zéro occurrence = trou) ; la cadence est du **contenu doctrinal**. La frontière doit être lisible **dans le code** — deux structures distinctes, jamais un drapeau sur une même table. |
| R12 | Le pilotage maison est publié **dans la doctrine maison**, au même format | Un seul chemin de code, une philosophie versionnée, mesurable par version dans `generated_from`. Un chemin parallèle divergerait, et c'est celui qu'on regarde le moins qui garderait l'ancien comportement. |
| R13 | `belief_key: null` ⇒ le moteur exécute, **le chat n'invente rien** | « SILENCE IS NOT A POSITION ». Un moteur qui pilote sans conviction citable est acceptable ; un chat qui cite une conviction que le coach n'a pas écrite ne l'est pas. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| `composition_steering` illisible | `[]`, compté, **montré à l'écran coach**. Le moteur applique l'ordre mécanique de Sophia. |
| Une entrée avec `"protein"` dans `off` | **Publication refusée**, bruyamment, avec le motif. Pas de nettoyage silencieux. |
| `carb_timing` posé hors `performance` | Rejeté, **compté**, dit à l'écran. Le coach doit savoir que sa position n'a pas pris. |
| Deux entrées primaires sur le même objectif | Publication refusée. |
| `belief_key` pointe vers une conviction supprimée | Le jeton **survit**, le chat ne cite rien. L'exécution ne dépend pas de la citation. |
| Un coach sans aucune entrée | Ordre mécanique de Sophia, **aucune conviction maison citée** (A2). Consigne identique au caractère près à la baseline. |
| Élève sous flag, coach qui pilote à l'énergie | Écrêtage : l'axe `energy` n'a rien à piloter. Le coach n'est **pas** prévenu par élève — ce serait nominatif. |
| **Le silencieux, et le plus grave** : quelqu'un ajoute un axe et oublie une branche du mapping | Ne compile pas — le mapping de FF-040 est exhaustif par `switch` sans `default`. |

## 8. Critères d'acceptation

```gherkin
Étant donné une doctrine avec et sans composition_steering
Quand le bloc de conversation est compilé
Alors les deux blocs sont identiques, octet pour octet
Et l'empreinte de cache est inchangée
```

```gherkin
Étant donné une tentative de publication avec "protein" dans off
Quand la doctrine est publiée
Alors la publication échoue avec un motif nommé
```

```gherkin
Étant donné le type SteeringEntry
Quand on tente d'écrire deficit_style: "aggressive"
Alors le code ne compile pas
```

```gherkin
Étant donné un élève sous plancher TCA dont le coach pilote à l'énergie
Quand le pilotage est appliqué
Alors le résultat est indiscernable, caractère pour caractère, de celui d'un
  élève au corps inconnu chez le même coach
```

```gherkin
Étant donné un coach sans aucune entrée de steering
Quand une consigne de composition est construite
Alors elle est identique, caractère pour caractère, à la baseline sans-steering
  de la même version de prompt
Et aucune conviction de la maison n'y est citée
```

```gherkin
Étant donné un coach qui a écrit "saumon au moins 2 fois par semaine"
Quand un plan de sept jours est vérifié
Alors la fréquence est comptée sur les occurrences du plan
Et aucun schéma coach nouveau n'a été créé pour ça
```

```gherkin
Étant donné une position choisie sur l'écran doctrine
Quand le coach la survole
Alors il lit son effet en langage plan/aliment
Et il ne lit aucun nom d'axe du moteur
```

## 9. Rabbit holes

- **Montrer les axes « puisque c'est plus clair ».** C'est plus clair pour nous.
  Pour le coach, c'est le moment où son produit cesse d'être sa méthode. §3.0
  n'est pas une préférence esthétique : c'est ce qui distingue KEEL d'un
  configurateur.
- **Parser la prose du coach.** La tentation revient à chaque champ : « il a
  écrit *je ne compte pas les calories*, on peut en déduire `off: [energy]` ».
  Non. La position est **choisie**, le jeton en est dérivé, et la phrase du
  coach reste une conviction citable. Un parseur de prose est un endroit où le
  produit se met à deviner ce qu'un coach pense.
- **Fusionner la doctrine maison et celle du coach.** « Le coach n'a rien dit
  sur les nutriments, prenons la table maison » — c'est exactement A2, et c'est
  non. Le contenu maison ne gouverne pas une cohorte coachée ; seul le mécanisme
  s'applique.
- **Faire porter le steering au bloc chat.** Il y entrerait « naturellement »
  avec le reste de la doctrine, et refragmenterait le cache de toute la base
  pour une donnée qu'aucun tour de conversation ne lit.
- **Croire que `off` désactive le calcul.** `off` retire l'ARBITRE, pas
  l'instrument : le moteur continue de mesurer, et les planchers restent armés.
  Un coach qui éteint l'énergie n'éteint pas le plancher de couverture.

## 10. Ce qu'on mesure

- **La mesure principale :** part de coachs qui posent au moins une entrée de
  steering après avoir vu la question. Une question que personne ne remplit est
  une question mal posée — et le remède est la formulation, pas un rappel.
- **La mesure secondaire :** part d'entrées **rejetées au parse**, par motif. Si
  `carb_timing` hors performance domine, c'est l'écran qui laisse choisir ce
  qu'il ne devrait pas offrir.
- **La contre-mesure :** `doctrineCacheFootprint`. S'il bouge, le steering a fui
  dans le bloc chat et toute la base se refragmente.
- **La seconde contre-mesure :** part de plans dont la consigne diffère de la
  baseline **pour un coach sans steering**. Attendue : zéro. Toute valeur non
  nulle est une fuite du pilotage vers des cohortes qui ne l'ont pas demandé.

## 11. Questions ouvertes

1. **Le coach voit-il l'effet de sa position sur SA cohorte ?** La fiche dit
   qu'il voit ce que la position produit *en général* (« la protéine porte au
   moins un quart de l'énergie du plan »). Lui montrer l'effet **mesuré** sur ses
   élèves demanderait des agrégats — donc le plancher k=5 (A4), donc le silence
   pour la majorité des coachs au début. À instruire avec l'étape 8.
2. **`plant_diversity` reste un axe exposé alors que sa preuve est faible**
   (Farshchi ; American Gut n=41 vs 44). Le design le classe « signal ». Le
   garder pilotable est cohérent avec « le coach décide », et incohérent avec
   « on n'expose pas ce qu'on ne sait pas mesurer ». Non tranché.
3. **La position « je ne fais pas de règle » ne produit aucune entrée**, comme
   `NO_RULE` dans les débats existants. Ce qui n'est pas tranché : faut-il
   distinguer « pas de règle » de « pas encore répondu » ? Les deux rendent
   aujourd'hui le même ordre mécanique, et le coach ne peut pas savoir laquelle
   des deux il est.
