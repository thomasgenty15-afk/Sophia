# Brief du lot E (rédigé pendant que A–D tournent ; lancé après eux)

## Les deux défauts mesurés, déjà localisés

### ① `spliceReworkableUnits` recolle un titre sur les mauvaises casseroles

`retry_merge.ts:604`. Le code apparie le plat de la relance **par case** (`day/slot` + porteur),
puis copie `ingredients`, `title` et `method` — et **ne touche jamais à `base.uses`** :

```ts
base.ingredients = structuredClone(back.ingredients);
if (String(back.title ?? "").trim()) base.title = back.title;
if (String(back.method ?? "").trim()) base.method = back.method;
```

Quand le modèle **intervertit** midi et soir (mesuré sur GAIN au 1er appel), la case reçoit le
titre du saumon pendant que ses `uses` pointent toujours `prep_lentil_ratatouille` +
`prep_couscous`. Résultat enregistré : « Saumon avec couscous, légumes rôtis et amandes »
**sans aucun saumon**.

**Le correctif** : la fusion vérifie l'identité **avant** de coller. Si le plat rendu pour cette
case cite un ensemble de `uses` différent de celui de la base, la case est **refusée** et le
motif **nommé** (`uses_mismatch`). Un titre ne voyage jamais sans ses casseroles.

### ② Le contrôle final s'abstient pour une bouche

`generate-household-meal-v1/index.ts:7680` :

```ts
if (platedMembers.length < 2) return off("single_mouth");
```

C'est cette abstention qui a laissé passer les 727 g. Le chantier (lot B.5) demande
explicitement de l'activer pour **N = 1**.

⚠️ `lot8_integration_handler_test.ts:669` épingle `final?.reason === "single_mouth"` sur un
foyer d'une bouche. Ce test devra changer d'attente — **en disant pourquoi dans le test**.

### ③ La fusion ne met pas à jour `density_check`

Une déclaration du premier jet reste attachée à une recette remaniée. Comparer ce champ final à
la mesure finale n'évalue donc pas la dernière réponse du modèle.

### ④ Une réparation doit être jugée sur TOUS les consommateurs des unités modifiées

Mesuré : au 2ᵉ appel GAIN, une modification de casserole partagée **améliore** un dîner dont la
réécriture directe avait été rejetée.

## Les points d'ancrage

- `plan_repair_loop.ts` — **pur, éprouvé, partiellement branché**. `orderDefects`,
  `compareSafety`, `violationKey`, `planRepairPass`, `judgeCandidate`, `repairKindOf`,
  `fallbackTimeoutMs`, `REPAIR_MIN_CALL_MS`.
- `plan_budget.ts:166` `planRepairReservedAfter(label, pending)` — la réserve est déjà mesurée
  quand `pendingDefectKinds` est renseigné.
- `index.ts:1245` `planRepairGranted(label, capMs)` — le point d'étranglement, appelé derrière
  un `&&` pour ne consommer que si l'appel part vraiment.
- Les sept sites de relance : `protein_anchor_retry` (8372), `exclusion_retry` (8545),
  `swap_retry` (8839), `preference_split_retry` (9049), `unfed_retry` (9270),
  `density_repair` (10285), `dedicated_repair` (11128).
- `index.ts:7650` — la pesée (`shadowSizing`) a **déjà** été remontée au-dessus des rattrapages
  le 2026-09-11. Le blocage décrit en tête de `plan_repair_loop.ts` est donc levé.

---

# Ce que les lots A, B et D ont posé et qui attend un appelant

## Du lot A — la langue du référentiel

`index.ts:5659` fait aujourd'hui `composition = await loadCompositionIndex(admin);`. Le
chargeur accepte désormais `{ lang: "fr" | "en" }`, **défaut `fr`**. La langue du plan est dans
`content_locale`. Sans elle, un plan **anglais** lit `raisins` comme du raisin frais.

⚠️ Trois autres appelants existent et ne sont à personne : `meal-energy-v1/index.ts:790`,
`tracking_window_io.ts:536`, `tracking_v2_io.ts:241`.

## Du lot B — le contrôle final, qui ne s'abstient plus

⚠️ **Correction à ce brief** : NE PAS retirer `return off("single_mouth")` (`index.ts:7680`).
À une bouche, `shadowSizing` ferait de l'ombre à un chemin `portion_v1` qui pose réellement.
**C'est le contrôle FINAL qui devait cesser de s'abstenir.**

1. importer `finalPortionCheck` depuis `portion_sizing.ts` ;
2. mémoriser les `PlateBounds` par `(memberId, day, slot)` pendant la passe de dimensionnement
   (déjà calculées, ~7914 et ~11568) ;
3. remplacer le corps de l'IIFE `finalSizing` (~13525, aujourd'hui `const m = shadowSizing();`)
   par `finalPortionCheck({ index, dishes, preparations, plateFor })` ;
4. journaliser `measured`, `reason`, `boxes`, `judged`, `verdicts`, `water`, `tubsNotJudged`,
   `outOfBounds` — **jamais `m.rows`**, il porte les `memberIds`.

Restent aussi sans appelant : `potProteinPerGram`, `BoxNutrition.proteinG`.

## Du lot D — l'ajusteur déterministe

`adjustProportions({ units, consumers, measure })`, **après** le parseur et la mesure, **avant**
`sizeDishForMouth`/`applySizing`, et **avant** toute décision de rattrapage.
`outcome === "closed"` ⇒ **zéro appel modèle**.

- **unités** : une par préparation, une par plat pour son frais. **Identifiants préfixés par
  leur unité** (`"prep_x#huile d'olive"`) — la même huile vit dans trois unités du même plan.
- **consommateurs** : prélèvements RÉELS (`uses.servings / servingsMade`), plus le couloir de
  `densityCorridorFor`.
- **mesure** : fermeture sur l'index + `measurePreparation` / `measureFresh`.
- ⚠️ `adjustable: false` sur toute unité dont la MÉTHODE écrit des grammes en toutes lettres.

Après l'appel, **dans cet ordre** : réécrire les quantités structurées → recalculer portions et
boîtes → recalculer les courses → régénérer les quantités citées dans les instructions →
remesurer les portions écrites et rejouer les gardes → **invalider `densityCheck`**.

Compteurs à journaliser : `moves_paired`, `moves_one_sided`, `consumers_closed`,
`consumers_degraded` (**doit rester 0**), `rejected_would_degrade`, `measure_calls`, `stopped`,
`reverted_after_measure`.

**Preuve à rapporter** : sur les cas réels de l'enquête, l'ajusteur ferme 3 des 4 défauts de
densité en **4,2 ms médians** là où un rattrapage modèle coûte 65 à 114 s et ne fermait pas le
premier (105,4 → 118,4 pour un minimum de 123).
