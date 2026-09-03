# FF-018 · La photo de repas

| | |
|---|---|
| **Identifiant** | `FF-018-la-photo-de-repas` |
| **Statut** | 🟠 En cours — **le code applique volontairement une règle que le contrat a amendée** (voir §11) |
| **Date** | 2026-08-07 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) non-input #4 · [PHOTO_QUANTIFICATION.md](../../keel/PHOTO_QUANTIFICATION.md) · [CALORIE_REVERSAL.md](../../keel/CALORIE_REVERSAL.md) |
| **Code** | `_shared/keel/meal_analysis.ts` (prompt `meal_analysis.v4`, packs `en`/`fr`) · `meal-photo-upload-v1` · `analyze-meal-photo-v1` |
| **Langue** | 🟢 depuis le 2026-09-01 — l'accusé a son pack **français**, et le prompt porte un bloc de langue de sortie (`label_localized`, `assumption`, `clarifying_question`). Avant : un élève francophone recevait l'accusé en anglais, journalisé et ignoré. `DetectedFood.label` reste **anglais par contrat** — `planned_dish_match.ts` le lit contre le catalogue anglais `food_items`, et le traduire ferait taire la coche automatique |
| **Effort estimé** | livrée ; le renversement calories est un chantier à part |

---

## 1. Le problème

Écrire son repas demande de l'attention. Le photographier n'en demande aucune.
C'est le geste le plus naturel qu'on puisse faire d'une assiette, et il porte
une information réelle — **à condition de savoir ce qu'une photo peut dire et ce
qu'elle ne peut pas.**

Le fait mesuré qui dicte toute l'architecture : sur une photo de repas,
**l'identification des aliments est fiable (~87–97 %) ; la quantification ne
l'est pas** (biais mesuré à −26,6 %, dans le sens flatteur).

**Ce que ça coûte de mal le faire.** Un chiffre de calories tiré d'une photo est
faux d'un quart, **toujours vers le bas**, et il est présenté à quelqu'un qui
essaie de manger correctement. Ce n'est pas une approximation : c'est un mensonge
systématique dans la direction qui fait le plus de dégâts.

## 2. Job stories

> **Quand** je suis au restaurant, **je veux** photographier mon assiette
> plutôt que la décrire, **pour que** ça prenne trois secondes.

> **Quand** l'app lit ma photo, **je veux** qu'elle dise ce qu'elle voit et
> qu'elle avoue ce qu'elle ne sait pas, **pour que** je puisse lui faire
> confiance.

> **Quand** je photographie un repas, **je ne veux pas** qu'on me rende un
> chiffre de calories qui a l'air précis et qui ne l'est pas.

## 3. Périmètre

### Dans le périmètre

- L'envoi et l'analyse d'une photo de repas depuis la conversation.
- L'**identification** des aliments → des faits, au même endroit que les repas
  déclarés (`protocol_events`, `source='photo'`).
- La **portion** rendue comme un **jeton de bande** — `small` / `moderate` /
  `large` / `unclear` — jamais un nombre.
- Le marquage de l'incertitude : une photo compte, et elle est marquée comme
  moins certaine (`evidence_weight`).
- Les deux filtres qui séparent le modèle de vision de la couche de faits.

### Hors périmètre — engageant

- ❌ **Aucune énergie, aucun macro, aucun micronutriment depuis une photo.**
  C'est le contrat, verbatim, et le filtre l'applique.
- ❌ **Aucune quantité chiffrée.** La bande est un jeton, pas un nombre déguisé.
- ❌ **On ne « corrige » pas les filtres isolément.** Le contrat a été amendé le
  2026-08-06 (« aucune énergie **nue** ») mais le marqueur de base
  (`declared_quantities` vs `photo_estimate`) **n'existe pas encore**. Retirer le
  filtre avant lui ne livre pas le chiffre décidé : ça livre le chiffre nu que la
  décision interdit, biaisé de −26,6 % dans le sens flatteur, à un élève. La
  marche à suivre a une **étape 0 bloquante — la garde TCA** : `CALORIE_REVERSAL.md`.

## 4. Le circuit

```
   photo envoyée dans le fil
            │
            ▼
   meal-photo-upload-v1   (stockage, intégrité)
            │
            ▼
   analyze-meal-photo-v1  ──►  modèle de vision
            │
            ▼
   ┌───────────────────────────────────────────────┐
   │ FILTRE 1  stripMeasurementFacts               │
   │  énergie / macro / micro  ─►  RETIRÉS         │
   ├───────────────────────────────────────────────┤
   │ FILTRE 2  la portion devient une BANDE        │
   │  small | moderate | large | unclear           │
   ├───────────────────────────────────────────────┤
   │ FILTRE 3  la question de précision ne survit  │
   │  que si la lecture porte une VRAIE incertitude│
   └───────────────────────────────────────────────┘
            │
            ▼
   protocol_events  source='photo', evidence_weight=1.0
            │
            ▼
   éventuellement UNE question d'approfondissement (FF-017 §3)
```

## 5. Modèle de données

Même table que le repas déclaré — c'est ce qui garantit qu'une photo compte
comme un repas, pas comme autre chose :

| Champ | Valeur pour une photo |
|---|---|
| `source` | `'photo'` |
| `media_path` | le fichier stocké |
| `recognized` | ce que le modèle a lu, **après** filtres |
| `recognition_confidence` | la confiance de lecture |
| `food_group_ref` | l'identification |
| `evidence_weight` | `1.0` |
| `quantity` / `unit` | **uniquement** ce qui a été explicitement rapporté — jamais estimé |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Identification oui, quantification non | ~87–97 % contre un biais de −26,6 %. Toute l'architecture découle de cette asymétrie |
| **R2** | La portion est une **bande**, jamais un nombre | un nombre a l'air vrai ; une bande dit ce qu'elle sait |
| **R3** | Aucune énergie, aucun macro, aucun micro | contrat non-input #4, appliqué par le filtre et non par le prompt |
| **R4** | `unclear` est une réponse **valide** | forcer une bande sur une photo illisible fabrique de la certitude |
| **R5** | Une question de précision ne survit que sur une **vraie** incertitude | sinon la question devient un tic, et l'élève se lasse |
| **R6** | Le chemin photo écrit **au même endroit** que le texte | une photo est un repas, pas une catégorie à part |
| **R7** | Le renversement calories a une **étape 0 bloquante** (garde TCA) | c'est une décision de sécurité, pas un refactor |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Photo illisible | `unclear`, et on le dit. Aucun aliment inventé |
| Le modèle rend des calories | le filtre les retire **avant** la couche de faits |
| Le modèle rend une quantité | retirée, sauf si l'élève l'a explicitement donnée |
| L'analyse échoue | l'échec est visible ; la photo reste, le fait n'est pas inventé |
| Photo qui n'est pas un repas | aucun fait |
| Plusieurs plats sur la photo | chaque groupe identifié devient un fait ; les portions restent des bandes |

## 8. Critères d'acceptation

```gherkin
Étant donné une photo de repas
Quand l'analyse se termine
Alors des groupes alimentaires sont enregistrés
Et AUCUNE valeur d'énergie, de macro ou de micronutriment n'apparaît

Étant donné une photo dont la portion est ambiguë
Quand la lecture se termine
Alors la bande vaut `unclear`
Et aucune bande n'est forcée

Étant donné une photo lisible
Quand le fait est écrit
Alors il l'est dans la même table qu'un repas déclaré par écrit

Étant donné une lecture sans incertitude réelle
Quand le tour se termine
Alors aucune question de précision n'est posée

Étant donné une photo qui ne montre pas de nourriture
Quand l'analyse se termine
Alors aucun fait n'est enregistré
```

## 9. Rabbit holes

- **Le chiffre qui revient par la fenêtre.** Chaque itération sur le prompt de
  vision produira un modèle plus bavard en grammes. C'est le **filtre** qui
  tient, pas le prompt.
- **Ouvrir les calories « juste un peu ».** Le contrat a changé, le code non, et
  c'est **délibéré**. L'ordre est écrit dans `CALORIE_REVERSAL.md` et commence
  par une garde TCA.
- **La bande qui devient un nombre en aval.** Un lecteur qui mappe
  `small→0.5, moderate→1, large→1.5` a réintroduit la quantification sans le
  dire.

## 10. Ce qu'on mesure

- Part des photos qui produisent au moins un fait
- Part de `unclear` (attendu : non nulle — zéro signifierait qu'on force)
- Valeurs d'énergie ayant franchi le filtre : **zéro**

**Contre-mesure.** La confiance de l'élève dans ce qu'on lui rend. Une lecture
qui se trompe d'aliment coûte plus cher qu'une lecture qui dit `unclear`.

## 11. Questions ouvertes

- **Le code est en retard sur son contrat, exprès.** `meal_analysis.ts` applique
  encore « aucune énergie » alors que l'amendement du 2026-08-06 dit « aucune
  énergie **nue** ». Ce n'est pas un bug : le marqueur de base n'existe pas, et
  l'ouvrir avant lui livrerait le chiffre nu interdit. Le chantier a sa
  procédure — `CALORIE_REVERSAL.md`, étape 0 = garde TCA.
- ~~Une photo envoyée **après coup** doit dire à quel repas elle se rattache.~~
  **Décidé le 2026-09-01** — et ce n'est donc plus une question ouverte.

  Une photo dont l'appelant ne déclare **aucun** créneau (c'est le cas de
  **toutes** les photos du chat : `ChatPage` envoie `slotKey: null`) est rangée
  au **dernier créneau écoulé** du jour local, et l'accusé le **dit**, avec la
  porte de correction dans la même phrase :

  > « Je l'ai rangée au dîner, d'après l'heure — dis-moi si c'était un autre repas. »

  Ce que ça renverse, et pourquoi c'est légitime : `TodayPage` porte la règle
  « un créneau ne se devine jamais à l'horloge », et elle avait raison quand
  elle a été écrite. Ce que cette règle interdit est la déduction **silencieuse**
  — §3.3bis (« hypothèse annoncée + porte de correction ») a depuis autorisé la
  coche automatique par photo, qui est une déduction bien plus lourde.

  Les garde-fous, tous vérifiés plutôt que promis
  (`_shared/keel/photo_slot_inference.ts` + son test) :
  - l'heure **déclarée** par l'élève (`eating_rhythm[].at`) bat toujours le
    repli `SLOT_PASSED_HOUR` — qui dîne à 22 h n'a pas dîné à 21 h ;
  - un `slot_key` **fourni** n'est jamais remplacé : la déduction ne comble
    qu'un silence ;
  - avant le premier créneau de la journée, on ne range **rien** (`null` est une
    réponse) ;
  - `snack_am` / `snack_pm` / `before_bed` ne sont **jamais** produits : ce dépôt
    n'a pas d'heure de référence pour eux ;
  - la marque `recognized.slot_inferred` voyage sur la ligne et **survit à la
    ré-analyse** — sans elle, un `force: true` transformerait un créneau déduit
    en créneau déclaré, en silence.
