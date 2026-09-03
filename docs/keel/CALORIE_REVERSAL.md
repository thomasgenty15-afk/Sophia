# Chantier — le chiffre porte sa base

**Décision produit du 2026-08-06.** KEEL cesse de refuser le chiffre d'énergie. Il refuse le
chiffre **nu**. Contrat : [CONTRACT.md](CONTRACT.md) amendement non-input #4. Marketing :
[LEGAL.md](LEGAL.md) §6.4. Mesure : [PHOTO_QUANTIFICATION.md](PHOTO_QUANTIFICATION.md).

> ✅ **EXÉCUTÉ LE 2026-09-01.** Les six étapes sont écrites et éprouvées ; l'encadré au-dessus de
> l'étape 1 dit où vit chaque fait. Ce qui suit reste le document de référence — il porte les
> mesures, les arbitrages et l'ordre — mais il ne décrit plus du travail à faire.

Ce document liste les étapes dans l'ordre où il fallait les écrire, et **cet ordre n'était pas
décoratif** : ouvrir la vanne avant que le marqueur existe, c'était livrer exactement le chiffre nu
que la décision interdit.

---

## La règle, en une phrase

Un chiffre d'énergie vit dans **un champ typé qui porte sa base**, ou il n'existe pas.

```
declared_quantities  — l'élève a donné les quantités. C'est un CALCUL.      (mesuré : 2,3 % MAPE)
photo_estimate       — le modèle les a devinées. C'est une ESTIMATION.      (mesuré : −26,6 % de biais)
```

La forme est déjà dans le module : `AssumptionBasis` (`visible_cue` / `standard_default`) fait
exactement cette distinction preuve-contre-supposition, elle est typée et elle est testée. On la
copie, on n'en invente pas une autre.

**Le chiffre en prose libre reste interdit et reste supprimé.** C'est la seule forme sous laquelle
un nombre peut voyager sans sa base, donc c'est la seule forme qui ne doit jamais survivre.

---

## L'ordre, et il n'est pas négociable

### 0. LA GARDE TCA — avant tout le reste

> ✅ **TRANCHÉE LE 2026-08-18.** Les trois réponses sont écrites, le code est posé et éprouvé.
> Rapport : [`scratchpad/2026-08-18-1100-L4A-garde-tca.md`](../../scratchpad/2026-08-18-1100-L4A-garde-tca.md).
> Code : `_shared/keel/energy_gate.ts` (`energySafetyGates`, `canSizeFromTarget`,
> `canEmitMouthEnergy`) et `energy_gate_mouth_test.ts`.
>
> 1. **La garde ne PRODUIT jamais le chiffre** — elle ne le supprime pas après coup (décision de
>    l'utilisateur). Rien à filtrer, donc rien qui puisse fuir par un chemin d'affichage oublié.
>    **L'état se lit AVANT le calcul, jamais entre le calcul et l'écran.**
> 2. **L'état est celui qui existe déjà, et il devient REQUIS.** Aucune colonne neuve : les cinq
>    états (plancher dérivé, `profiles.birth_date`, jeton `count_calories`,
>    `energy_display_enabled`, `energy_target_enabled`) sont **tous clés sur `auth.users`, aucun
>    sur `member_id`** — un foyer de quatre bouches n'a qu'UNE ceinture. Un appelant qui oublie
>    une porte échoue à la compilation ET à l'exécution.
> 3. **Oui, et là où on rencontre le chiffre.** Les deux interrupteurs couvraient l'EFFET partout
>    et la PORTÉE nulle part : l'unique bascule vivait sur `/app/plan`, alors que `/app/today`
>    affichait les chiffres sans aucun contrôle. Réparé. Et **aucun chiffre attribué à une autre
>    bouche ne sort** (`other_mouth`) — ce qu'on ne peut pas faire taire n'existe pas.
>
> ⚠️ Ce que L8 doit respecter pour ne pas contourner cette garde : §8 du rapport (C1 à C8), dont
> le retournement de la propriété R6 de `no_calorie_to_student_property_test.ts`.

**L'élève est le destinataire de ce chiffre** (décision du 2026-08-06). C'est ce qui rend cette
étape bloquante plutôt que consultative.

L'en-tête de `no_calorie_to_student_property_test.ts` porte la raison pour laquelle
l'interdiction était totale, et elle n'est pas technique : **Levinson 2017 — 73 % des patients TCA
déclarent qu'un tracker de calories a contribué à leur trouble.** (Le « 83 % » de la revue 2025 est
une erreur de citation. Ne pas la propager.)

À trancher et à écrire AVANT la première ligne de code :

- `sophia-brain/skills/disordered_eating_guard` doit-il **supprimer** le chiffre, ou le produit
  doit-il ne jamais le produire pour cet élève ?
- Quel état porte cette décision, et où s'écrit-il ? (Même question ouverte que `safetyBand: null`
  dans `keel-reengage-v1` — voir le mémo `optional-gate-params-are-disarmed-gates` : un paramètre
  de garde optionnel est une garde désarmée.)
- L'élève peut-il éteindre l'affichage ? Un chiffre qu'on ne peut pas faire taire est un tracker.

~~Tant que ces trois réponses ne sont pas écrites, les étapes 1 à 6 restent fermées.~~
**Écrites le 2026-08-18** (encadré ci-dessus). Les étapes 1 à 6 sont ouvertes.

### ✅ ÉTAPES 1 À 6 — EXÉCUTÉES LE 2026-09-01

> Ce qui suit décrit ce qui a été **fait**, pas ce qui reste à faire. La chaîne complète tient
> maintenant en quatre faits, et chacun a son épreuve :
>
> | # | Le fait | Où |
> |---|---|---|
> | ① | la **porte** se lit AVANT le modèle ; fermée, elle retire le champ du prompt | `energy_gate_io.ts::loadEnergyGate` → `analyze-meal-photo-v1` → `energyGateBlock` |
> | ② | la **ceinture** efface le chiffre à l'ingestion, et l'effacement est COMPTÉ | `parseMealAnalysis(…, energyAllowed)` → `dropped_measurement_fields` |
> | ③ | la **base** est une propriété de l'ENTRÉE, pas une déclaration du modèle | `parseEnergyEstimate` (dégrade en `photo_estimate` + `issues`) |
> | ④ | le **rendu** met le chiffre et sa base dans la MÊME phrase | `renderEnergyLine` (serveur) · `photoEnergyLine` + `photo.energy.<basis>` (écran) |
>
> **Le déplacement qui n'était pas un rangement.** `canShowEnergy` n'avait qu'un appelant, et la
> propriété du harnais l'assertait avec ce message : *« every extra caller is another place the
> four gates can be assembled wrongly »*. Le chemin photo en avait besoin d'un second. La réponse
> n'a pas été d'élargir la liste à deux fonctions edge : l'**assemblage** est descendu dans
> `_shared/keel/energy_gate_io.ts`, d'où `canShowEnergy` garde son appelant unique et où les deux
> lanes lisent la même chose. Une épreuve neuve lit le **corps** de l'assemblage — pas le fichier —
> et vérifie que les quatre entrées viennent bien de leur source (cicatrice `mouthTargetFactor`).
>
> **Ce qui reste interdit, et n'a pas bougé d'un mot :** les MACROS (LEGAL §6.4), le chiffre en
> PROSE (un `rationale` qui dit « environ 600 kcal » est toujours rédigé), le POURCENTAGE, et
> l'**agrégation** — le biais de −26,6 % n'est divisé que par 1,04 en cumul hebdomadaire et les
> deltas sont 2,5× pires que les niveaux, donc `energy_estimate` est persisté pour être **relu**,
> jamais sommé.
>
> `MEAL_ANALYSIS_PROMPT_VERSION` est passée à `meal_analysis.v5`.
>
> ⟳ **2026-09-02 — LA BASE `declared_quantities` A SON PREMIER PRODUCTEUR**, et
> il n'est pas celui que §1 imaginait. Ce n'est pas un chemin qui donne des
> grammes: c'est FF-062 R11, où la personne CORRIGE le chiffre affiché sous sa
> photo. La phrase rendue a donc été corrigée avec — « le chiffre que tu m'as
> donné », plus « d'après les quantités que tu m'as données ».
>
> ⚠️ **Et les 2,3 % de MAPE ne se transportent PAS sur ce geste.** Ils ont été
> mesurés sur des grammes recalculés par une table. Ce que la correction
> établit avec certitude est que le chiffre ne vient plus d'une photo — donc que
> le biais de −26,6 % disparaît. C'est suffisant, et c'est tout ce que le code
> affirme: aucun chiffre de fiabilité n'y est écrit.

### 1. Le type

`MealAnalysis` (`_shared/keel/meal_analysis.ts`) gagne **un** champ, pas trois :

```ts
energy_estimate: { kcal: number; basis: EnergyBasis; confidence_band: ConfidenceBand } | null
```

`null` reste la réponse normale et légitime — une photo d'une pomme entière n'a pas besoin d'un
chiffre. Pas de champ macro : la décision porte sur l'énergie, et
[LEGAL.md](LEGAL.md) §6.4 continue d'interdire le « suivi des macros par photo ».

### 2. Le filtre

`stripMeasurementFacts` passe d'« efface toute énergie » à « l'énergie ne survit que dans
`energy_estimate` ». Concrètement :

- `MEASUREMENT_KEY_PATTERNS` — inchangé pour tout le reste. Un `total_kcal` inventé par le modèle
  à la racine reste supprimé et reste compté dans `dropped_measurement_fields`.
- `MEASUREMENT_PROSE_PATTERNS` — **inchangé, et c'est le cœur de la garde**. Un `rationale` qui dit
  « environ 600 kcal » reste rédigé : c'est un chiffre sans base.
- Une seule exception de chemin, sur `energy_estimate.kcal`. Une exception de CHEMIN, pas de nom :
  un champ `kcal` ailleurs dans l'arbre n'est pas couvert.

### 3. Le parseur

`parseMealAnalysis` force la base au lieu de la croire :

> si le contexte ne contenait **aucune quantité déclarée**, `basis` ne peut pas valoir
> `declared_quantities` — on dégrade en `photo_estimate` et on l'écrit dans `issues`.

C'est le même arbitrage déterministe que la question de clarification, qui ne survit que si le
frame porte réellement une incertitude. La base n'est pas une déclaration du modèle sur lui-même,
c'est une propriété de l'entrée.

### 4. Le prompt

`meal_analysis.ts` §« THE HARD RULE: YOU ARE NOT A CALORIE COUNTER » (~l. 583-609, plus la l. 643
« never ask a question whose only purpose is to sharpen a quantity ») est réécrit. Attention aux
deux endroits qui en dépendent en cascade : le commentaire de tête du module (l. 8-20) cite le
contrat mot pour mot, et l'exemple de sortie (~l. 732) se termine par « no calorie or gram figure
appears anywhere ».

`MEAL_ANALYSIS_PROMPT_VERSION` se bumpe. C'est ce qui rend les événements d'avant et d'après
distinguables dans la trace.

### 5. Le test de propriété

`sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts` ne se supprime
pas — il se **retourne**. L'invariant passe de :

> aucun chiffre d'énergie n'atteint l'élève

à :

> aucun chiffre d'énergie **sans base** n'atteint l'élève.

Les trois couches restent (ingestion / rendu / type) : c'est ce qui fait que le test prouve quelque
chose. On en ajoute une quatrième — **tout rendu qui affiche `kcal` affiche aussi sa base** — parce
que c'est très exactement la propriété que la décision produit achète.

### 6. La surface

Le rendu de l'accusé de réception photo, et l'écran élève. Un chiffre affiché sans son marqueur est
la seule façon de rater ce chantier en ayant écrit tout le reste correctement.

---

## 7. LE RENVERSEMENT DU 2026-08-18 — la cible entre dans le générateur

> **Autorité : décision produit de l'utilisateur, 2026-08-18.** Conception :
> [`scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md`](../../scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md) §3.
> Lot qui l'exécute : **L8**, `_shared/keel/household_portions.ts`, section « LA CIBLE
> DIMENSIONNE LES GRAMMAGES ».
>
> ### La cible contraint les **GRAMMAGES**, pas le choix des plats.

**Ce qui est renversé, mot pour mot.** `energy_target.ts` disait :

> « Elle n'entre pas dans le générateur. Un plan qui vise un chiffre est un régime chiffré, et
> ce n'est pas ce produit. »

Cette phrase a porté une vraie protection pendant douze jours. Elle est **barrée, pas
supprimée**, à l'endroit exact où elle vivait — un lecteur qui ne la trouve plus croirait
qu'elle n'a jamais existé, et la réécrirait.

**Ce qui change, exactement.** Les plats restent choisis librement : aucun aliment n'est retenu
ni écarté pour atteindre un nombre. Ce qui s'ajuste par personne est la **quantité pesée** — les
boîtes du protocole de pesée livré le 2026-08-17 (« Boîte Theo 560 g · Zoe 520 g · Lou 280 g »,
mesuré sur un run réel).

**Le raisonnement, et il a déjà été corrigé une fois.** Ce n'est *pas* « parce qu'il n'y a qu'une
cuisson » — c'est faux, `COOKING_SHAPES` a trois valeurs et le champ est à l'écran depuis le
2026-08-15. C'est parce que **le gramme est le bon niveau de précision** : « une poignée » ne veut
rien dire, peser à chaque repas est intenable, donc on pèse **une fois** à la session dans des
boîtes nommées et le jour J on **cite la boîte**. Le mode de cuisson et le grammage sont deux
leviers qui se composent ; ils ne se remplacent pas.

### Ce que le renversement n'ouvre pas

| Reste vrai | Où c'est tenu |
|---|---|
| `maintenanceRange` ne connaît **aucun objectif**, ne soustrait rien, rend une fourchette | `energy_target_test.ts` — trois gardes de source, inchangées |
| **Aucun kcal** dans le texte du plan, ni par bouche en base, ni dans le prompt (C5) | ce qui entre est un **facteur sans unité**, ce qui sort est un **gramme d'aliment** |
| La porte du dimensionnement ne lit **ni ④ ni ⑤** | `energy_gate_mouth_test.ts`, test de source sur le corps de `canSizeFromTarget` |
| Le « pourquoi » reste **les trois dernières lignes** de `buildPortionBrief` | le bloc L8 est déterministe et **n'écrit pas une ligne de prompt** |
| **Aucun reste, aucun solde** | le conseil du midi est une *consigne* ; il ne lit aucun consommé, et ne peut pas en lire |

### Ce qui est **renforcé** par ce lot, et pas seulement préservé

La porte ② (mineur) est désormais évaluée **par bouche**, depuis
`keel_household_member_age(member_id)` — jumelée côté TypeScript par `ageStateFromVerdict`, et
déjà lue par `mouthEnvelope`. **Avant L8, la chaîne se fermait au niveau du foyer sur le verdict
du compte maître : une cible aurait dimensionné les grammages d'un enfant de douze ans parce que
son parent est adulte.** C'est le trou mesuré par L4-B (§4 et §7, clause C8 réécrite), et il est
fermé ici.

### La règle C9, et pourquoi elle est neuve

C1–C8 gardent qui a le droit de **voir** ou de **calculer**. Aucune ne disait qu'un **état
d'entrée** doit être valide avant de *déclencher* un nombre. « Dehors » est le premier de ces
états : `keel_household_set_member_away` ne consulte **aucun âge**, et le vocabulaire de présence
est fermé côté maître mais **ouvert côté personne**. Le conseil chiffré du midi passe donc devant
la porte **avec le verdict d'âge de la bouche concernée**, et un vocabulaire hors liste fermée
vaut « on ne sait pas » ⇒ **pas de chiffre, jamais de repli**.

---

## Ce qui ne change pas

- **Personne n'est noté.** Un chiffre n'est pas une cible, pas un budget, pas un score.
  ⚠️ **La preuve citée ici est morte** : `landing.doctrine.rule1_*` n'existe plus — tout le
  namespace `landing.*` est parti de `i18n/en.ts` (vérifié le 2026-09-01, 0 clé). Ce qui tient
  la règle aujourd'hui n'est pas de la copy, c'est du code : `energy_gate.ts` (quatre portes
  dans un ordre contractuel), l'absence de tout reste ou solde, et une **fourchette** au lieu
  d'un point.
- **La bande de portion survit.** `small | moderate | large | unclear` reste le socle : c'est ce
  que l'élève peut vérifier d'un coup d'œil, et le chiffre ne le remplace pas.
- ~~**La copy publique reste au conditionnel** tant que la §0 n'est pas tranchée. `landing.` et
  `gyms.doctrine.no_calories_*` disent « where a number **does** appear, it is an estimate and it
  is labelled as one » — vrai que le produit en affiche un ou non, et aucune promesse de source.~~
  **RENVERSÉ le 2026-09-01** par [LEGAL.md](LEGAL.md) §6.4 bis : `/meal-prep` affiche une
  fourchette **calculée**, sans condition d'accès, qui suit l'objectif choisi. Et les deux clés
  citées n'existent plus — ni `landing.*` (namespace supprimé), ni `gyms.doctrine.no_calories_*`
  (le bloc « no calories » a été retiré des pages de vente, et `CommunitiesPage.tsx` porte
  l'interdit de le faire revenir). **Ce qui reste vrai de la ligne, et qui est le seul morceau
  à garder : tout chiffre porte sa base** — calculé ou estimé, l'interface le dit.
