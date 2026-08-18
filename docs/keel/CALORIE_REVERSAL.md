# Chantier — le chiffre porte sa base

**Décision produit du 2026-08-06.** KEEL cesse de refuser le chiffre d'énergie. Il refuse le
chiffre **nu**. Contrat : [CONTRACT.md](CONTRACT.md) amendement non-input #4. Marketing :
[LEGAL.md](LEGAL.md) §6.4. Mesure : [PHOTO_QUANTIFICATION.md](PHOTO_QUANTIFICATION.md).

Ce document liste ce qu'il reste à écrire, dans l'ordre où il faut l'écrire. **Rien de ce qui suit
n'est fait.** Le code applique encore l'interdiction totale, et c'est volontaire : ouvrir la vanne
avant que le marqueur existe, c'est livrer exactement le chiffre nu que la décision interdit.

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

## Ce qui ne change pas

- **Personne n'est noté.** Un chiffre n'est pas une cible, pas un budget, pas un score.
  `landing.doctrine.rule1_*` tient, et c'est la règle qui empêche ce chiffre de devenir un tracker.
- **La bande de portion survit.** `small | moderate | large | unclear` reste le socle : c'est ce
  que l'élève peut vérifier d'un coup d'œil, et le chiffre ne le remplace pas.
- **La copy publique reste au conditionnel** tant que la §0 n'est pas tranchée. `landing.` et
  `gyms.doctrine.no_calories_*` disent « where a number **does** appear, it is an estimate and it
  is labelled as one » — vrai que le produit en affiche un ou non, et aucune promesse de source.
