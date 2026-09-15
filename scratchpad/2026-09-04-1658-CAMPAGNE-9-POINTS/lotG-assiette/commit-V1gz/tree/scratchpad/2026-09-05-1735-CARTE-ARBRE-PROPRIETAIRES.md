# Carte de l'arbre de travail — fichier → propriétaire → décision

Écrite par la session sophia-2-0f le 2026-09-05 à 17:35, pour sophia-2-8a et sophia-2-74.
Tout ce qui suit est mesuré (commande + heure), pas déduit. Les mtimes viennent de `stat -f %Sm`.

## 1. Faits de base

| fait | mesure |
|---|---|
| HEAD | `4575f94d` (74) ← `a0f6af7d` (8a) ← `a58af9f6` (74) ← `fc1642f0` (74) ← `f81ce212` (8a) ← `f673945f` (8a) ← `a347255f` |
| index partagé | vide (== HEAD) à 17:29 |
| `tsc -p frontend/tsconfig.app.json` sur l'ARBRE | 0 erreur, exit 0, 17:31 |
| vitest sur les 6 tests des lots orphelins (arbre) | 6 fichiers, **127/127 verts**, 17:31 |
| scan « retour à un blob périmé » sur les 90 derniers commits | **un seul cas** : `567585ae` (`cooking_plan.ts`, `cooking_plan_test.ts` → blob de `fdf29f25`), réparé par `f673945f`. Aucun autre fichier n'est revenu en arrière. |
| `keel_properties/` (6 fichiers, hors gate) | ne typecheck pas sur l'arbre (fait de 74 : `no_food_solicitation_property_test.ts:351` vs `daily_pulse.ts:485`) — à vérifier, R1 s'en charge |

## 2. Les lots présents dans l'arbre, non commités

### Lot α — la réécriture du composeur `/app/plan` (2026-09-03, 21:33 → 22:14)
Auteur : la lignée « Huit chantiers du 3 septembre » (chantiers A2 « dérive les champs de cuisine d'un style » / A5) et « Alignement interface paramétrage » (qui a ajouté les 4 gardes de `mealBuilderWindow.int.test.ts` et déclaré « agent-gate passe »). Sessions mortes.

| fichier | diff | mtime |
|---|---|---|
| `frontend/src/keel/components/MealBuilder.tsx` | +413/−408, 23 hunks — **dont 2 hunks de 74** (`boxEnergy` sur `<PlanResult>` et `<CookingSessions>`, 09-05 16:45) | 09-05 16:45 |
| `frontend/src/keel/api/householdEnvyWiring.int.test.ts` | +42/−5 | 09-03 21:33 |
| `frontend/src/keel/components/mealBuilderWindow.int.test.ts` | +68 | 09-03 22:14 |
| `deno.lock` | +12/−1 (`@std/path@1.1.6`, `@std/internal@1.0.14`) | 09-03 21:57 |

Ce qu'il fait (commentaires datés dans le diff) : le formulaire de `/app/plan` devient celui de l'entonnoir ; retirés « on part d'où », « temps par session de cuisine », « pour combien de personnes », « ce qui se passe cette semaine », le garde-manger ; `cooking_time_min` dérivé du style. **C'est pour ça que l'audit de 8a voyait `householdEnvyWiring` rougir avec « seulement » les six fichiers de β : le test de l'arbre (+42) fait partie de α.**

### Lot β — l'offre de cadence de courses + la case « tout cuisiner en une seule fois » (2026-09-04, 03:27 → 21:22)
Auteur : session « Onboarding sessions de cuisine » (morte depuis le 09-04 13:16). Son dernier état, dans son transcript : « offre de cadence de courses et case « une seule fois » livrées, 28/28 côté Deno dont trois tests de mutation, front 0 rouge / 0 toléré / 0 hors liste, tsc propre, rien de commité, rien de stagé ». **Ce n'est pas un lot en travaux : c'est un lot fini, vérifié par son auteur, qui attendait un « commite » que personne n'a dit.**

| fichier | diff | mtime |
|---|---|---|
| `frontend/src/keel/components/ui/CheckboxField.tsx` | +48/−11 | 09-04 03:27 |
| `frontend/src/keel/components/OneCookingSessionField.tsx` | +28/−11 | 09-04 03:28 |
| `frontend/src/keel/components/oneCookingSessionField.int.test.ts` | +186/−55 | 09-04 03:31 |
| `frontend/src/keel/api/cookingPlan.ts` | +16/−7 | 09-04 03:42 |
| `frontend/src/keel/components/GroceryRunsField.tsx` | +166/−15 | 09-04 03:55 |
| `frontend/src/keel/components/groceryRunsOffer.int.test.ts` | NON SUIVI (14 tests) | — |
| `frontend/src/keel/api/household.int.test.ts` | +54/−3 (réparation `awayFrom`, P3 de l'audit de 8a) | 09-04 14:43 |
| `scripts/.vitest-red-baseline` | vidée, +53/−11 de commentaires (P4 de l'audit) | 09-04 15:05 |
| `supabase/functions/_shared/keel/cooking_plan_test.ts` | +389 | 09-04 21:20 |
| `supabase/functions/_shared/keel/cooking_plan.ts` | +181/−1 | 09-04 21:22 |
| `frontend/src/keel/pages/SetupPage.tsx` | l'arbre repasse les 3 props (`style`, `oneCookingSession`, `daysToEat`) que `a0f6af7d` a retirées de HEAD | 09-04 17:26 |

### Lot γ — vivant (2026-09-05, 17:23 → 17:26)
- `meal-energy-v1/index.ts`, `box_energy_decision*.ts`, `energy_gate_mouth_test.ts`, `no_calorie_to_student_property_test.ts`, `plan_rationale*.ts` (« LOT C — les courses que le plan organise »), `generate-*-v1/index.ts` (+2) → **74**, commité depuis dans `4575f94d`.
- `memoryView.ts` (+64), `memoryView.int.test.ts` (+73), `KnownAboutYouCard.tsx`, `chat.ts`, `ChatPage.tsx`, `StudentKnownPage.tsx` → « ⟳ 2026-09-05 — LA LIGNE, PAS LE JOUR » : le surlignage « Voir » passe de la date à l'identité de ligne (le texte). **Propriétaire à confirmer** (8a ? 74 ?). Personne ne me l'a déclaré.

### Lot δ — résidus sans propriétaire
- `feat/Git` (+1/−1 : deux espaces devant `supabase functions serve`, 09-05 15:57) — bruit, à ne jamais commiter.
- `scratchpad/2026-09-03-1237-…`, `-1308-…`, `-1331-…` (09-03 22:44) — amendements des trois prompts maîtres, +36 lignes en tout.
- `scratchpad/2026-08-23-EVAL-QUALITE/*.json` (≈70 fichiers non suivis) — sorties de tirs.

## 3. Ce que ça change pour P0.1

`a0f6af7d` a rendu HEAD compilable en retirant trois props. C'est juste comme **bouchon**. Mais la vraie question de production n'est pas « HEAD compile », c'est **« HEAD == ce que le gate a validé »** : aujourd'hui le gate valide α+β+γ, et HEAD ne les a pas. Tant que α et β vivent seulement sur le disque :
- un `git checkout`/`stash` d'une session les efface (déjà arrivé le 09-01, 150 fichiers) ;
- FF-060 lot 3 côté écran est **désarmé** sur HEAD (les trois props sont mortes) alors qu'il est vivant sur l'arbre ;
- chaque commit par pathspec d'un fichier partagé (`MealBuilder.tsx`, `cooking_plan.ts`, `SetupPage.tsx`) risque d'emporter des hunks de α/β sans le dire.

**Proposition** : adopter α puis β dans HEAD, **après relecture** (agent R3 en cours, lecture seule, sur une copie de l'arbre : dérivations des questions retirées, parité i18n, cas limites de l'offre, écrasement d'une réponse durable). Deux commits, par index privé (`read-tree HEAD` immédiatement avant `write-tree`), HEAD nu matérialisé et testé avant de poser. β réintroduit les trois props de `SetupPage.tsx` **avec** leur destinataire : `a0f6af7d` est renversé par construction, pas à la main.

Si R3 dit REJETER pour l'un des deux, on le dit à l'utilisateur avec les faits, et le lot reste sur le disque, **daté et nommé dans ce fichier**.

Sur « nos trois utilisateurs » : les 21 sessions de ce dépôt sont **le même compte, la même personne**. La décision est celle d'une personne, qui a dit « carte blanche, production ready ». Ce qu'on lui doit, c'est des faits et un chemin de retour (`git revert`), pas trois avis séparés.

## 4. Ce que je n'ai pas vérifié
- Le gate complet sur l'arbre (je n'ai joué que tsc + 6 fichiers vitest) — les auteurs de α et β disent l'avoir passé ; R3 rejoue les commandes du gate ciblées sur une copie.
- Qui a écrit le lot « Voir → ligne » (§2 γ).

## 5. ⟳ 18:05 — Verdict de la relecture R3 (agent adversarial, copie de l'arbre, rapport dans le scratchpad de session)

**α : ADOPTER avec réserves. β : ADOPTER seulement après correction. Jamais l'un sans l'autre.**
Ni l'un ni l'autre n'est posé dans HEAD ce soir, et ce n'est pas une question de commit : β
porte deux défauts de produit qu'il faut réparer d'abord.

- **La règle d'offre de β n'est pas le miroir du moteur.** `deriveCookingPlan` ignore
  `maxFridgeDays` ; énumération jouée (test ajouté sur la copie) : **12 cadences que le moteur
  honore sans note** (ex. `balanced/3j/runs=3`, `keen/4j/runs=3`) que l'offre RETIRE, contre la
  promesse écrite dans `GroceryRunsField.tsx:130-134`. Le test « MIROIR » de β ne teste qu'un sens.
- **Cas silencieux** : fenêtre 2 jours sans congélateur → l'amorce grave `grocery_runs=1`
  (durable), l'écran dit « une seule course », le moteur en fait deux, et `plan_rationale.ts`
  n'a pas de phrase pour ce cas. À 1 jour, la rationale imprime « Tu avais prévu 1 courses ; le
  plan n'en organise que 1 ».
- α **retire trois entrées dont `MealBuilder` était le dernier écrivain** : `context` (lu par
  `generate-meal-v1:788` et le prompt `meal_generation.ts:4552`), `servings>1` sur la lane
  individuelle (aucune dérivation de présence dans cette lane), `from_pantry`. Lecteurs sans
  écrivain — décision produit affirmée par le lot, invérifiable.
- Mutation sans aucun rouge : `MealBuilder.tsx:1177` `MAX_WINDOW_DAYS - 1` → `MAX_WINDOW_DAYS`
  (borne de fin à 8 jours) → 750/750 verts. Borne préexistante, jamais testée.
- Mesures sur la copie : tsc app 0, tsc tests = baseline (70/70), eslint 0, vitest 37 fichiers /
  747 verts, deno `cooking_plan_test` 31/31. 18 clés i18n orphelines (tolérées par précédent).
- `deno.lock` n'appartient ni à α ni à β (entrée de `tracking_window_io_test.ts`, déjà dans HEAD).

**Ce qui vaut le coup** : réparer la règle d'offre (miroir réel de `deriveCookingPlan`, y compris
`maxFridgeDays`) et l'amorce du cas 2 jours, puis poser α+β ensemble. Le lot reste sur le disque,
daté ici, jusque-là.
