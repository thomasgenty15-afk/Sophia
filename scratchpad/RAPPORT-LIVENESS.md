# RAPPORT — les mécanismes livrés sont-ils UTILISÉS ?

**Date :** 2026-08-11 · **Branche :** `ff-001-quotidien-du-coach`
**Outils :** `scratchpad/liveness/` — audit statique, armement, désarmement

---

## Comment j'ai procédé, et pourquoi dans cet ordre

La question « est-ce utilisé ? » a deux réponses possibles, et elles ne coûtent
pas le même prix :

1. **Y a-t-il un appelant ?** Statique, exhaustif, gratuit. Un mécanisme sans
   appelant se déclare mort **sans payer une seule génération**.
2. **Est-ce que ça mord sur des données réelles, et l'effet atterrit-il ?**
   Dynamique, cher, et seul capable d'attraper le mécanisme qui s'exécute mais
   ne produit rien.

J'ai donc fait le statique d'abord, puis les runs réels sur ce qui restait.

⚠️ **Un audit d'appelants doit retirer les commentaires.** Ce code est
massivement commenté et les commentaires **citent** les symboles qu'ils
expliquent : un `grep -l verdictFor` rend « vivant » un module dont le seul lien
avec `verdictFor` est un paragraphe expliquant pourquoi il ne l'appelle pas.
`audit_statique.py` retire commentaires **et** littéraux de chaîne avant de
chercher, et il cherche l'**appel** (`symbole(`), pas le nom.

**653 fichiers de production analysés** (ni tests, ni fixtures, ni harnais).

---

## 1 · Le verdict, mécanisme par mécanisme

| Lot | Mécanisme | Appelant de production | Exercé sur données réelles | Verdict |
|---|---|---|---|---|
| FF-037 | `detectProteinAnchor` | `meal_generation.ts` | oui (180 gén. du banc) | ✅ **utilisé** |
| FF-037 | `proteinAnchorRetryInstruction` | les 2 lanes edge | relance jamais observée en run réel | 🟡 **armé, jamais déclenché** |
| FF-037 | `PROTEIN_ANCHOR_PROMPT_LINE` | `meal_generation.ts` | oui, dans chaque prompt | ✅ **utilisé** |
| FF-038 | `loadCompositionIndex` | les 2 lanes edge | oui | ✅ **utilisé** |
| FF-038 | `resolveIngredients` | verdict, couverture, `generate-meal-v1` | oui | ✅ **utilisé** |
| FF-038 | `nutrientsOf` / `gramsRawOf` / `isFriedMethod` | verdict, couverture, parseur | oui | ✅ **utilisé** |
| FF-039 | `envelopeFor` | les 2 lanes edge | oui — **mais jamais la branche `per_kg`** | 🟡 **à moitié utilisé** |
| FF-039 | `verdictFor` | `generate-meal-v1` | oui, **1 seule ligne en base** | 🟡 **utilisé, presque muet** |
| FF-039 | `sentinelCarriersOf` | helper interne de `verdictFor` | oui | ✅ **utilisé** |
| FF-039 | **`envelopeFingerprint`** | **aucun** | — | ❌ **MORT** |
| FF-040 | `correctionPlanFor` | `generate-meal-v1` | oui — **0 jeton servi** | 🟡 **appelé, sans effet** |
| FF-040 | `correctionRetryInstruction` | `generate-meal-v1` | jamais atteint | 🟡 **armé, jamais déclenché** |
| FF-040 | `assessCoverage` | `generate-meal-v1` | oui — toujours `unverified` | 🟡 **appelé, sans effet** |
| FF-040 | `coverageFlagAfterCorrection` | `generate-meal-v1` | idem | 🟡 **appelé, sans effet** |
| FF-040 | `contradictsDeclaration` | helper interne de `correctionPlanFor` | jamais atteint | 🟡 **inatteignable en aval** |
| FF-040 | **`nextRecalibration`** | **aucun** | — | ❌ **MORT** |
| FF-041 | `parseCompositionSteering` | `doctrine.ts` | oui | ✅ **utilisé** |
| FF-041 | `steeringFor` / `offAxesFor` | `generate-meal-v1` | non vérifié (lane bloquée, §3) | 🟡 **joignable, non prouvé** |
| FF-041 | `applyPiloting` | `meal_envelope.ts` | idem | 🟡 **joignable, non prouvé** |
| FF-041 | `deriveSteeringFromPositions` | `coach-doctrine-v1` | oui (vérifié à l'écran, session précédente) | ✅ **utilisé** |
| FF-041 | `COMPOSITION_FORKS` | front coach | oui | ✅ **utilisé** |
| A4 | **`aggregateMayShip`** | seulement `aggregatePairMayShip` | — | ❌ **MORT** (par transitivité) |
| A4 | **`aggregatePairMayShip`** | **aucun** | — | ❌ **MORT** |
| FF-043 | `resolveHousehold` | `generate-household-meal-v1` | **oui, run réel 200** | ✅ **utilisé** |
| FF-043 | `trunkSizing` / `householdLaneMode` | helpers de `resolveHousehold` | oui | ✅ **utilisé** |
| FF-043 | `memberDeltasPayload` | `generate-household-meal-v1` | oui — **rend `[]` même armé** | 🟡 **appelé, structurellement vide** |
| FF-042 R6 | `uncoverableSentinelsFor` | `generate-meal-v1` | non vérifié (lane bloquée) | 🟡 **joignable, non prouvé** |
| FF-042 R6 | `parseDietaryRegime` | `generate-meal-v1` | idem | 🟡 **joignable, non prouvé** |
| FF-042 | **`dietaryRegimePromptLine`** | **aucun** | — | ❌ **MORT** |
| FF-042 | **`excludedSurfaceFormsFor`** | **aucun** | — | ❌ **MORT** |
| FF-051 | `parseFixedIntakes` | `generate-meal-v1` | **oui, run réel + log** | ✅ **utilisé** |
| FF-051 | `slotIsTaken` | `meal_generation.ts` | **oui** (5 petits-déj. supprimés) | ✅ **utilisé** |
| FF-051 | `fixedIntakeInputsFor` | `generate-meal-v1` | oui | ✅ **utilisé** |
| FF-051 | `fixedIntakePromptLines` | `meal_generation.ts` | oui | ✅ **utilisé** |
| FF-052 | `parseDayProperties` | `generate-meal-v1` | **oui, run réel** | ✅ **utilisé** |
| FF-052 | `dayHasProperty` / `daysWithProperty` | `meal_generation.ts` | **oui** (batch dim., restes lun.) | ✅ **utilisé** |
| FF-052 | `dayPropertyPromptLines` | `meal_generation.ts` | oui | ✅ **utilisé** |

**Compte : 30 mécanismes ont un appelant de production, 5 n'en ont aucun.**

---

## 2 · Les cinq morts, et ce que chacun coûte

### `envelopeFingerprint` — FF-039

Écrit pour être l'empreinte d'enveloppe posée en base, afin de savoir *sur quelle
enveloppe* un verdict a été rendu. La colonne n'existe pas, la fonction n'est
appelée nulle part. **Conséquence :** deux verdicts rendus sous deux enveloppes
différentes sont indiscernables à la relecture — précisément ce que l'empreinte
devait empêcher.

### `nextRecalibration` — FF-040, étape 8

Le **ré-ancrage** de l'enveloppe sur la tendance observée. Aucun appelant :
l'enveloppe d'un élève ne se recalibre donc **jamais**, quoi qu'il se passe sur
la balance. C'est l'étape 8 du chantier, livrée et jamais branchée.

### `aggregateMayShip` + `aggregatePairMayShip` — arbitrage A4

Le plancher d'anonymat k=5. `aggregatePairMayShip` n'a aucun appelant, et
`aggregateMayShip` n'est appelé **que par lui** : le duo est mort en entier.

C'est **attendu et documenté** — il n'y a pas encore de canal coach qui agrège
les verdicts (RAPPORT-SUITE §1.1). Mais ça veut dire que la garde ne sera
exercée pour la première fois que le jour où quelqu'un écrira l'agrégat, et
qu'elle n'a jamais tourné sur une vraie cohorte.

### `dietaryRegimePromptLine` + `excludedSurfaceFormsFor` — FF-042

**Le trou le plus cher de la liste, et il était déjà nommé.** Ce sont les points
2 et 3 du câblage de FF-042 : la ligne de régime en tête de consigne, et le rejet
dur au parseur. Aucun appelant.

**Un végan reçoit toujours un plan avec de la viande dedans.** L'audit le
confirme indépendamment de la fiche : rien, dans tout le code de production,
n'appelle ces deux fonctions.

---

## 3 · Ce que je n'ai pas pu tester, et pourquoi

### La lane individuelle est INJOIGNABLE en local — et ce n'est pas mon lot

| Couche | Ce qu'elle exige | Ce qu'elle reçoit |
|---|---|---|
| Worker principal du runtime edge | JWT **HS256** (secret de démo) | — |
| GoTrue local | signe désormais en **ES256** (`GOTRUE_JWT_KEYS`) | — |
| Résultat | **aucun jeton ne satisfait les deux** | `{"msg":"Invalid JWT"}` |

Vérifié dans les deux sens : un jeton `grant_type=password` réel (ES256) est
rejeté par le runtime ; un jeton HS256 forgé passe le runtime et est rejeté par
GoTrue (`signing method HS256 is invalid`) au premier `getUser()`.

**Ce n'est pas un défaut de ce qui a été livré, et ça dépasse cet audit :**
tous les scripts QA du dépôt qui passent par `grant_type=password`
(`scripts/qa_*.mjs`, `run_memory_v2_*.mjs`, `qa-create-run-connection.sh`) sont
cassés en local pour la même raison.

Deux constats à porter :

- **`--no-verify-jwt` est ignoré** par le CLI 2.67 au profit de `config.toml`.
- **Une autre session a déjà posé le contournement** dans `config.toml`
  (`verify_jwt = false` sur `chat-inbound-v1`, `generate-household-meal-v1` et
  `sophia-brain`, avec le même diagnostic en commentaire). Ces lignes ne sont pas
  commitées. **Je n'y ai pas touché** : c'est le lot d'une autre lane.

J'ai tenté d'ajouter `generate-meal-v1` à cette liste ; **l'action a été bloquée
comme changement de réglage de sécurité, et c'est le bon comportement.** Je n'ai
pas cherché à la contourner. `supabase/config.toml` est intact de mon fait.

**Ce qu'il faudrait, et c'est votre décision** — l'une de :

```bash
# a) ajouter la fonction à la liste déjà existante dans config.toml, puis
supabase stop && supabase start
```
ou bien réaligner GoTrue sur HS256 en local (retirer `GOTRUE_JWT_KEYS`), ce qui
répare **aussi** tous les scripts QA du dépôt.

Restent donc **non prouvés en run réel** : le pilotage coach (FF-041), la
branche `per_kg` de l'enveloppe, et le signalement B12 (FF-042 R6). Les trois ont
un appelant de production vérifié ; ce qui manque est la preuve qu'ils mordent.

---

## 4 · Ce que les runs réels ont montré

### 4.1 — La lane foyer : FF-043 est vivante et produit du réel

Foyer créé pour la sonde (3 membres, 1 avec compte), **deux générations réelles
`200`** en 17 s et 25 s.

```json
"household":        { "id": "7c6cc836-…", "member_count": 3 },
"member_portions":  [ { "member_id": "96d40b26-…", "display_name": "Alex",
                        "portion_note": "Serve a larger scoop of chicken and rice…",
                        "preparation_shares": [ … ] }, … ],
"member_deltas":    [],
"issues":           ["household_adults_without_envelope:1", "structured_quantity_missing: 12/35"]
```

`resolveHousehold`, `trunkSizing`, `householdLaneMode` : **utilisés, avec effet
visible**. L'issue `household_adults_without_envelope` est une garde FF-043 qui
mord pour de vrai.

### 4.2 — `member_deltas` est structurellement vide, et ce n'est pas un réglage

Deuxième run avec une **allergie de membre armée** (`arachide` sur l'enfant) :
`member_deltas` reste `[]`, et le mot n'apparaît nulle part dans la sortie.

Les deux moitiés de ce résultat sont correctes et il faut les séparer :

- **la sécurité a marché** — l'allergène est absent du tronc commun ;
- **le canal de deltas n'a rien produit** — et il ne le pouvait pas.
  `DELTA_CHANNELS` vaut `more_of_the_same` / `usual_side` : ce sont des **add-ons
  d'énergie** pour un membre dont l'enveloppe dépasse la portion du tronc. Une
  allergie n'en produit aucun, par construction.

**Le vrai constat est plus profond :** un delta exige au moins **deux membres
avec un corps mesuré**. Or `household_members` ne porte que `first_name`,
`birth_date` et `goal` — le corps vient de `profiles` + `student_body_measures`,
donc d'un `user_id`. Un membre sans compte n'a **jamais** de corps.

`memberDeltasPayload` ne peut donc rendre autre chose que `[]` tant que le foyer
n'a pas **deux membres titulaires d'un compte avec des mesures**. C'est la forme
la moins fréquente d'un foyer.

### 4.3 — Le moteur de composition n'a écrit qu'**une seule** ligne de verdict

`meal_composition_verdicts` : **1 ligne, 1 élève** — celle du run d'hier soir.
Pour **71 repas générés** au total dans cette base.

```json
{ "verdict": { "energy": "not_computable", "protein": "not_computable",
               "density": "not_computable",
               "sentinels": { "missing": [], "uncoverable": [] },
               "resolution": { "total": 66, "resolved": 55 } },
  "envelope_mode": "per_portion",  "coverage_flag": "unverified",
  "tokens_served": [],             "resolution_coverage": 0.889,
  "prompt_version": "meal.en.v7_fixed_intakes_and_days" }
```

Quatre choses s'y lisent :

- **`prompt_version` est bien la v7** : le bump de FF-051/FF-052 est en
  production locale.
- **`envelope_mode` vaut `per_portion`** — parce que l'élève n'a pas de corps.
  Sur cette base, la branche `per_kg` de `envelopeFor` **n'a jamais tourné en run
  réel**. Le seul profil avec une taille sur 143 élèves était… celui que j'ai
  armé pour la sonde.
- **`tokens_served: []`** — la boucle de correction FF-040 a été appelée et n'a
  **rien servi**. Elle n'a rien à servir : le verdict est `not_computable`.
- **`coverage_flag: unverified`** — le plancher de couverture s'abstient, pour la
  même raison.

Cela recoupe exactement le résultat du banc : **le moteur s'abstient sur 67 % des
générations**. Ici, sur la seule ligne existante, il s'abstient à 100 %.

### 4.4 — Le verrou de sortie médical mord en production

Capturé **incidemment** dans les logs, sur le trafic d'une autre lane pendant les
sondes :

```
[Error] keel.output_lock.medical { violation_count: 1, tokens: "peanut",
                                   detail: "Visible text replaced before delivery." }
```

Ce n'est pas un de mes lots, mais c'est la preuve la plus directe de la journée
qu'une garde de sécurité **s'exécute et remplace un texte** sur du trafic réel.

---

## 5 · Un défaut trouvé, et il est de mon lot (FF-051)

**La liste de courses d'alias ne reçoit pas les apports fixes.**

Dans la ligne de verdict ci-dessus, deux chiffres se contredisent :

- `resolution: 66 total, 55 résolus` → **11 termes non résolus** ;
- `unresolved_terms` → **6 termes listés**.

Les 5 manquants sont les cinq occurrences de `whey_protein_powder`, l'apport
fixe. La cause est en clair dans `generate-meal-v1/index.ts:941` :

```ts
const resolution = resolveIngredients(
  composition,
  m.dishes.flatMap((d) => d.ingredients.map(…)),   // ← les PLATS seulement
);
```

C'est un **second** appel à `resolveIngredients`, distinct de celui que fait
`verdictFor`, et il ignore `fixedIntakeInputs`. Résultat : `verdictFor` compte
l'apport irrésolu (correct, R2), mais **le terme n'atteint jamais la worklist de
curation d'alias** — alors que FF-051 §10 annonçait précisément que les apports
fixes seraient des produits de marque absents du référentiel Ciqual. C'est le
cas le plus prévisible, et c'est celui qui ne remonte pas.

Le correctif tient en un argument :

```ts
const resolution = resolveIngredients(composition, [
  ...m.dishes.flatMap((d) => d.ingredients.map(…)),
  ...fixedIntakeInputsFor(fixedIntakes, daysToFill),
]);
```

**Je ne l'ai pas appliqué** : vous avez demandé des tests et un rapport, pas des
correctifs. Cause racine à noter au passage : la résolution est calculée **deux
fois** sur deux entrées différentes ; la divergence était inévitable.

---

## 6 · Ce que je recommande, dans l'ordre

1. **Réparer la lane locale** (§3). Tant qu'elle est coupée, ni cet audit ni les
   scripts QA du dépôt ne peuvent finir leur travail. Réaligner GoTrue sur HS256
   répare tout d'un coup.
2. **Câbler FF-042 points 2 et 3.** Deux fonctions écrites, testées, sans
   appelant — et un végan qui reçoit de la viande.
3. **La curation d'alias**, avec le correctif de §5 d'abord : sans lui, la
   worklist ignore justement les termes les plus exotiques.
4. **Décider du sort de `envelopeFingerprint` et `nextRecalibration`** : les
   brancher, ou les retirer. Du code mort qui a l'air vivant est ce qui fait
   croire à une garantie qu'on n'a pas.
5. **Ne rien faire pour A4** (k=5) : mort *à dessein*, jusqu'au canal coach. À
   condition que la règle renforcée de FF-042 §6 R6 soit lue ce jour-là.

---

## 7 · Ce que j'ai touché, et remis en état

| Geste | État final |
|---|---|
| Corps posés sur 2 profils QA (taille, genre, naissance) | **retirés** |
| 2 mesures de poids | **retirées** |
| Régime végan sur S2 | **retiré** |
| `fixed_intakes` + `day_properties` sur S1 | **retirés** |
| `composition_steering` sur la doctrine du coach de S1 | **remis à `[]`** |
| Foyer « Foyer sonde liveness » + 3 membres + 1 allergie | **supprimé** |
| 2 plans générés par les sondes (10:49, 10:51) | **supprimés** (vérifiés un par un avant) |
| `supabase/config.toml` | **intact** — ma modification a été bloquée, je ne l'ai pas contournée |
| `supabase functions serve` lancé puis arrêté | runtime de la stack **redémarré** |
| Timeout Kong étendu à 600 s | **laissé** — réglage local requis par tout run de composition |

Désarmement vérifié : `0 foyer, 0 régime, 0 apport fixe, 0 profil armé`.

Les scripts sont dans `scratchpad/liveness/` : `audit_statique.py` +
`mecanismes.json` (rejouables à volonté, sans coût), `armer.sql`,
`desarmer.sql`, `jeton.mjs`.
