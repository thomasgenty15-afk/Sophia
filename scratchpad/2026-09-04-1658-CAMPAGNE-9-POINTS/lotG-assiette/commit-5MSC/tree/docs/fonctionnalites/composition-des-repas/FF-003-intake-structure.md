# FF-003 · Lire ce que l'élève écrit avant de composer

| | |
|---|---|
| **Identifiant** | `FF-003-intake-structure` |
| **Statut** | 🔵 Idée — périmètre arbitré, coût non mesuré |
| **Date** | 2026-08-07 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) (planchers de sécurité) |
| **Dépend de** | `generate-meal-v1` · `meal_generation.ts` (`buildMealPrompt`, `parseGeneratedMeal`) |
| **Effort estimé** | 3 à 4 jours |

---

## 1. Le problème

Le champ « *Anything going on this week (optional)* » reçoit de la prose libre,
et cette prose part **telle quelle** dans la consigne du modèle. Elle n'est
jamais lue par le produit.

Conséquence directe : tout ce qu'un élève y écrit est une suggestion, pas une
contrainte. « Je ne suis pas là ce week-end » se retrouve noyé au milieu de la
doctrine du coach, du mapping alimentaire, des contraintes de sécurité, de
l'objectif, du rythme, de la capacité de cuisine, des préférences, du pays, de
la saison et de la fenêtre — **un seul appel** doit tout concilier d'un coup.
Quand il arbitre mal, rien ne le rattrape, parce que rien ne sait ce qu'il
aurait dû faire.

**Ce que ça coûte.** Le champ le plus expressif de l'écran est le seul qui
n'engage à rien. L'élève y écrit une contrainte réelle, la voit ignorée, et
apprend à ne plus rien y écrire — après quoi le produit n'a plus aucun moyen
d'apprendre ce qui change dans sa vie.

## 2. Job stories

> **Quand** j'écris « cette semaine je bosse tard tous les soirs », **je veux**
> que ça change vraiment mes dîners, **pour que** je n'aie pas à traduire moi-
> même ma vie en cases à cocher.

> **Quand** ce que j'ai écrit n'a pas été compris, **je veux** le voir avant de
> recevoir mon plan, **pour que** je puisse le reformuler au lieu de découvrir
> une semaine à côté de la plaque.

## 3. Périmètre

### Dans le périmètre
- **Un premier appel modèle qui ne compose rien.** Il lit les entrées, dont la
  prose libre, et rend un **JSON de contraintes fermé**.
- Ce JSON devient une entrée de `buildMealPrompt`, **à côté** de la prose — qui
  continue de partir telle quelle.
- Un **schéma fermé** validé côté TypeScript, sur le modèle de
  `parseGeneratedMeal` : ce qui n'est pas reconnu est écarté, jamais deviné.
- **Un retour visible à l'élève** de ce qui a été retenu, avant génération.
- Un comportement d'échec **nommé**, jamais une dégradation silencieuse.

### Hors périmètre — engageant
- ❌ **L'intake ne décide rien de nutritionnel.** Ni objectif, ni portion, ni
  aliment, ni substitution. Il extrait des **contraintes de circonstance** :
  absence, temps disponible, événement, matériel. Tout ce qui touche à la
  composition reste au générateur, qui est le seul à voir la doctrine du coach.
- ❌ **Il ne touche pas aux planchers de sécurité.** L'intake ne peut ni lever,
  ni poser, ni moduler une contrainte de [CONTRACT.md](../../keel/CONTRACT.md).
  Un texte d'élève qui parle de restriction ne passe pas par cette porte : il a
  déjà la sienne.
- ❌ **Il n'écrit rien en base.** L'intake produit une valeur qui vit le temps
  d'une génération. Ce qui est durable passe par une carte que l'élève remplit
  lui-même — sinon on reconstruit un memorizer en double.
- ❌ **On ne mute pas `generate-meal-v1`.** Le générateur qui marche reste ; on
  lui ajoute une entrée facultative. Même règle que `generate-plan-v2`.

## 4. Le circuit

```
  MealBuilder
      │  prose libre + contexte déjà structuré
      ↓
  generate-meal-v1
      │
      ├─→ APPEL 1 · INTAKE ─────────────────────────┐
      │     entrée : prose, rythme, capacité,        │
      │              fenêtre, date du jour           │
      │     sortie : JSON fermé                      │
      │     ne voit NI la doctrine, NI le mapping    │
      │     alimentaire, NI les contraintes santé    │
      │                                              │
      │   ┌──────────── échec ? ────────────────┐   │
      │   │ schéma invalide, timeout, refus      │   │
      │   │        ↓                             │   │
      │   │  ON NE DÉGRADE PAS EN SILENCE :      │   │
      │   │  génération refusée, nommée          │   │
      │   │  `intake_failed`, prose rendue à     │   │
      │   │  l'élève telle qu'il l'a écrite      │   │
      │   └──────────────────────────────────────┘   │
      │                                              │
      ├─→ RETOUR À L'ÉLÈVE : « voilà ce qu'on a     │
      │   retenu » — corrigeable avant de composer   │
      │                                              │
      └─→ APPEL 2 · COMPOSITION (l'existant) ────────┘
            buildMealPrompt reçoit le JSON **et** la
            prose. La prose reste : le JSON est une
            lecture, pas un remplacement.
            ↓
          parseGeneratedMeal — les contraintes du JSON
          sont revérifiées ICI, pas seulement demandées
```

**Le JSON ne remplace pas la prose.** Le modèle de composition voit les deux. Un
intake qui rate une nuance ne doit pas la faire disparaître : il l'aura
seulement pas mise en avant.

## 5. Modèle de données

**Néant en base.** L'intake ne persiste rien.

Le JSON produit, en mémoire le temps de la génération, schéma **fermé** :

| Champ | Type | Sens |
|---|---|---|
| `away` | `[{date, slots[]}]` | Les moments où l'élève ne mange pas ici — voir [FF-002](FF-002-dire-son-absence.md). Dates absolues. |
| `time_pressure` | `[{date, minutes_max}]` | « Je bosse tard mardi et jeudi ». Borné à 240, comme `cooking_time_min`. |
| `events` | `[{date, kind}]` | `kind` ∈ liste fermée : `guests`, `eating_out`, `travel`, `celebration`. Rien d'autre. |
| `equipment_out` | `string[]` | Liste fermée : `oven`, `freezer`, `hob`, `microwave`. « Mon four est en panne » est une contrainte de composition réelle. |
| `notes_unparsed` | `string` | **Ce que l'intake n'a pas su classer**, recopié mot pour mot. |

`notes_unparsed` est la pièce la plus importante du schéma : c'est ce qui rend
l'échec partiel **visible** au lieu de silencieux. Un intake qui rend un JSON
vide et un `notes_unparsed` plein dit exactement ce qu'il n'a pas compris.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Le schéma est **fermé** : tout champ, toute valeur d'énumération non reconnue est écartée | Un jeton inventé est une contrainte que le rendu ne sait pas montrer — donc invisible à l'élève, et appliquée quand même. |
| R2 | Un intake en échec **refuse la génération**, il ne la laisse pas passer sans lui | La dégradation silencieuse est le mode d'échec que ce dépôt paie le plus cher. Un plan composé sans les contraintes qu'on a promis de lire est pire qu'un plan refusé. |
| R3 | La prose brute part **toujours** dans la consigne de composition, intake réussi ou non | Le JSON est une lecture de la prose, pas sa traduction officielle. |
| R4 | L'intake ne voit **ni** la doctrine du coach, **ni** les contraintes de santé | Deux raisons : il n'a rien à en faire, et le lui donner ouvrirait un chemin par lequel du texte d'élève influence l'application d'une règle de sécurité. |
| R5 | Toute contrainte du JSON est **revérifiée au parseur**, pas seulement demandée au modèle | Une contrainte qui n'existe que dans la consigne n'est pas une garantie. Même posture que le plafond de plats. |
| R6 | Ce que l'intake a retenu est **montré à l'élève avant** composition | C'est la seule façon qu'une mauvaise lecture soit corrigée par la personne qui sait. |
| R7 | `notes_unparsed` non vide ⇒ l'écran le dit | Sans ça, « on a tout compris » et « on a compris un tiers » se ressemblent. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| L'appel d'intake échoue (réseau, quota, timeout) | Refus nommé `intake_failed`. L'élève voit sa prose intacte et un bouton « composer sans lire ma note », qui est un choix **explicite**, jamais un repli automatique. |
| Le JSON ne valide pas contre le schéma | Identique à ci-dessus. Aucune tentative de réparation partielle : un schéma à moitié valide est un schéma dont on ne sait pas quelle moitié croire. |
| L'intake invente une contrainte absente de la prose | Rattrapé par R6 : l'élève la voit et la retire. C'est le mode de défaillance **acceptable**, et c'est pour ça que le retour visible n'est pas optionnel. |
| L'intake classe une contrainte de sécurité | Impossible par construction (R4) — aucun champ du schéma ne l'exprime. À tester comme tel : un texte de détresse dans ce champ ne doit produire aucun effet ici, et déclencher la voie de sécurité existante ailleurs. |
| L'intake réussit mais ne comprend rien | `notes_unparsed` porte tout, l'écran le dit (R7), la composition part avec la prose seule — c'est-à-dire exactement le comportement d'aujourd'hui. |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève qui écrit « je ne suis pas là samedi et dimanche »
Quand il lance une génération sur une fenêtre qui couvre ce week-end
Alors l'écran lui montre « absent : samedi, dimanche » avant de composer
Et le plan produit ne contient aucun repas ces deux jours-là
```

```gherkin
Étant donné un élève dont l'appel d'intake échoue
Quand il lance une génération
Alors aucun plan n'est écrit
Et il lit un refus nommé, avec sa note intacte
Et il peut choisir explicitement de composer sans elle
```

```gherkin
Étant donné un élève qui écrit une phrase que l'intake ne sait pas classer
Quand il lance une génération
Alors sa phrase apparaît dans « non retenu »
Et la composition reçoit quand même sa prose entière
```

```gherkin
Étant donné un intake qui renvoie un champ absent du schéma
Quand la validation tourne
Alors la génération est refusée
Et aucun champ du JSON n'est utilisé, même les valides
```

## 9. Rabbit holes

- **Le coût.** Un appel de plus par génération, sur un chemin qui en avait un.
  Il faut le mesurer avant de le livrer : latence perçue et coût par plan.
  L'intake est petit (pas de doctrine, pas de mapping) donc devrait être rapide
  et bon marché — mais « devrait » n'est pas une mesure.
- **La tentation de tout classer.** Le schéma fermé va sembler trop pauvre dès
  la première semaine d'usage réel. Chaque champ ajouté est un champ à rendre, à
  vérifier au parseur et à montrer à l'élève. Un champ qu'on ajoute sans les
  trois est un champ mort — le dépôt en a déjà (`no_cook_days`, `cooks`).
- **Le JSON d'intake est du texte de modèle.** Il a exactement le même statut
  que la sortie de composition : non fiable jusqu'à validation. Le traiter comme
  une entrée de confiance parce qu'il « vient de nous » est le piège central de
  ce chantier.
- **Le retour à l'élève ajoute un tour.** Composer devient : écrire → voir ce
  qui est retenu → confirmer → attendre. C'est une friction réelle sur l'écran
  que l'élève vient voir pour composer. La sortie possible est de ne montrer
  l'étape que lorsque l'intake a retenu quelque chose, et de passer outre quand
  la note est vide — ce qui est le cas le plus fréquent.

## 10. Ce qu'on mesure

- **La mesure :** part des notes en prose dont au moins une contrainte est
  retenue, et part des plans dont l'élève corrige la lecture avant composition.
  Le second chiffre est le plus intéressant : il dit que l'étape sert.
- **La contre-mesure :** latence médiane de génération avant / après, et taux de
  `intake_failed`. Si la latence perçue augmente sensiblement, ou si le refus
  dépasse quelques pour cent, on a rendu la génération moins fiable pour lire un
  champ facultatif — et il faut alors reculer, pas ajuster.

## 11. Questions ouvertes

1. **Un seul appel d'intake, ou un par famille de contraintes ?** Le §4.2 de la
   passation ouvre le découpage (composition / séquencement / courses). Cette
   fiche n'en tranche qu'un morceau : l'intake. Le reste attend d'avoir mesuré
   ce que celui-ci coûte.
2. **L'étape de confirmation est-elle obligatoire, ou seulement quand quelque
   chose a été retenu ?** Voir §9.
3. **Que fait l'intake d'une prose qui contredit une carte ?** « Je bosse tard »
   contre `cooking_time_min = 45`. Le ponctuel doit sans doute l'emporter, comme
   en [FF-002](FF-002-dire-son-absence.md) R2 — mais ici il l'emporterait sur une
   saisie explicite de l'élève, ce qui n'est pas la même chose.
4. **Le champ que cette fiche veut lire a changé de métier.** Décision produit
   du 2026-08-08, en deux temps : « Anything going on this week » (`context`) a
   été retiré du constructeur, puis remis le jour même — mais recentré.

   Il servait à tout dire, y compris « je mange dehors vendredi ». Cette
   moitié-là appartient maintenant à la grille de
   [FF-002](FF-002-dire-son-absence.md), qui l'exprime au jour et au repas près
   et que le parseur fait respecter. Ce qui reste au champ est ce que la grille
   **ne peut pas** dire : l'**événement**. Le placeholder le montre plutôt que
   de le décrire — « guests on Saturday · the oven is broken · back from
   holiday, empty fridge ».

   Conséquence pour l'intake : la matière à classer est plus étroite et plus
   homogène qu'à l'écriture de cette fiche. `away` (§5) est désormais couvert
   en amont par la grille et n'a plus à être déduit de la prose ; `events` et
   `equipment_out` deviennent le cœur du travail.

   Reste en suspens : `situation` — la prose DURABLE — est partie et n'est pas
   revenue. Sa colonne est toujours lue par les deux générateurs, donc les
   élèves qui l'avaient remplie en profitent encore, mais aucun nouveau ne peut
   l'écrire. La piste la plus prometteuse, et jamais instruite : la récupérer
   dans **la conversation**, où l'élève dit déjà ces choses au memorizer,
   plutôt que de redemander un champ.
