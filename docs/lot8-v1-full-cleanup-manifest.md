# LOT 8.3 — Manifeste de suppression totale V1

> **Contexte:** aucun utilisateur en base. ZERO coexistence V1/V2 necessaire.
> **Objectif:** supprimer TOUT le code V1 restant. Lazy migration supprimee. Investigator V1 supprime.
> **Invariant:** `npm run build` et `deno check` doivent passer apres chaque batch.
> **Regle:** NE JAMAIS toucher aux fichiers de migration SQL (`supabase/migrations/`). Ce sont des historiques immuables.

---

## BATCH 1 — Frontend : fichiers a SUPPRIMER entierement

### Pages

| Fichier | Raison |
|---|---|
| `frontend/src/pages/Grimoire.tsx` | Lit `user_plans`, `user_actions`, `user_framework_tracking` via `grimoire.ts` |
| `frontend/src/pages/FrameworkExecution.tsx` | Lit `user_framework_entries` uniquement |

### Composants

| Fichier | Raison |
|---|---|
| `frontend/src/components/FrameworkHistoryModal.tsx` | Lit `user_framework_entries`, importe uniquement par Grimoire |

### Libs et types

| Fichier | Raison |
|---|---|
| `frontend/src/lib/grimoire.ts` | Lit `user_plans`, `user_actions`, `user_framework_tracking`, `user_goals`, `phases` |
| `frontend/src/types/grimoire.ts` | Types du Grimoire, importe uniquement par grimoire.ts et Grimoire.tsx |

### Tests E2E (tout V1)

| Fichier | Raison |
|---|---|
| `frontend/e2e/dashboard.e2e.spec.ts` | Seeds `user_goals`, `user_plans`, `user_actions`, `user_vital_signs` |
| `frontend/e2e/chat.e2e.spec.ts` | Seeds `user_goals`, `user_plans`, `user_actions` |
| `frontend/e2e/concurrency.e2e.spec.ts` | Seeds `user_goals`, `user_plans`, `user_actions` |
| `frontend/e2e/framework.e2e.spec.ts` | Seeds `user_goals`, `user_plans`, `user_framework_tracking` |
| `frontend/e2e/plan-settings.e2e.spec.ts` | Seeds `user_goals`, `user_plans`, `user_actions` |
| `frontend/e2e/reset-recraft-next.e2e.spec.ts` | Seeds `user_goals`, `user_plans`, `user_actions` |
| `frontend/e2e/onboarding-full.e2e.spec.ts` | Flow V1 complet: `/global-plan` → `/plan-priorities` → dashboard |

---

## BATCH 2 — Frontend : fichiers a NETTOYER (enlever le V1, garder le V2)

### `frontend/src/App.tsx`

Supprimer :
- L'import `Grimoire` de `./pages/Grimoire`
- L'import `FrameworkExecution` de `./pages/FrameworkExecution`
- La route `/grimoire` et `/grimoire/:id`
- La route `/framework-execution`
- La route `/dashboard-legacy` et l'import `DashboardLegacy`
- Tout import/route qui pointe vers un fichier supprime dans le batch 1

### `frontend/src/pages/PlanPriorities.tsx`

Ce fichier est mixte V1/V2. Supprimer :
- Toutes les branches qui lisent `user_goals` (`.from("user_goals")`)
- L'appel a `sort-priorities` (`.functions.invoke('sort-priorities', ...)`)
- Toute reference a `cleanupSubmissionData` / `planActions`
- Les imports de ces modules
- Ne garder que le mode V2 (`user_transformations`, `/onboarding-v2`)

### `frontend/src/edge/edge-functions.int.test.ts`

Supprimer les tests qui invoquent :
- `generate-plan` (V1)
- `summarize-context`
- `sort-priorities`
- `break-down-action`
Supprimer le teardown `user_plans` (V1).
Garder les tests `generate-feedback`, `sophia-brain`, etc.

### `frontend/src/edge/coverage-guard.int.test.ts`

Retirer de la liste des edge functions attendues :
- `break-down-action`
- `generate-plan`
- `recommend-transformations`
- `sort-priorities`
- `suggest-north-star`
- `summarize-context`
- `archive-plan`
- `process-plan-topic-memory`
- `schedule-recurring-checkins`

Retirer de la liste des triggers attendus :
- `trg_refresh_morning_active_action_checkins_user_actions`
- `trg_refresh_morning_active_action_checkins_user_framework_tracking`
- `trg_refresh_morning_active_action_checkins_user_personal_actions`
- `trg_refresh_morning_active_action_checkins_user_plans`

### `frontend/src/edge/ultimate.int.test.ts`

Supprimer tous les blocs de test qui :
- Seendent des `user_plans` (V1), `user_actions`, `user_vital_signs`, `user_vital_sign_entries`, `user_framework_tracking`
- Testent des flows base sur `content.phases`
- Testent `on_plan_completed_archive`
Garder les tests non-V1 (profiles, chat_messages, modules, etc.)

### `frontend/src/security/rls-negative.int.test.ts`

Supprimer les tests qui :
- Seendent `user_goals`, `user_plans` (V1), `user_actions`
- Testent les policies RLS sur ces tables
Garder le test `chat_messages` cross-user.

### `frontend/e2e/network-chaos.e2e.spec.ts`

Supprimer le test qui mock `generate-plan` et navigue vers `/plan-generator`.
Garder le test sophia-brain timeout.

### `frontend/scripts/provision_fixture_user.mjs`

Supprimer la fonction `seedGoalPlanAndActions` et tout le code qui seede :
- `user_goals`
- `user_plans` (V1)
- `user_actions`
- `user_action_entries`
Remplacer par un seeding V2 minimal si necessaire (ou laisser vide pour l'instant).

---

## BATCH 3 — Edge functions backend a SUPPRIMER entierement

| Dossier | Raison |
|---|---|
| `supabase/functions/archive-plan/` | Pure V1 — lifecycle plan V1 |
| `supabase/functions/process-plan-topic-memory/` | Pure V1 — lit `user_plans` |
| `supabase/functions/schedule-recurring-checkins/` | Pure V1 — lit `user_goals`, `user_plans`, `user_north_stars` |

---

## BATCH 4 — Brain : fichiers a SUPPRIMER entierement

### Investigator V1 (daily) — 20 fichiers

Supprimer le dossier entier `supabase/functions/sophia-brain/agents/investigator/` :
- `db.ts`, `streaks.ts`, `turn.ts`, `run.ts`, `prompt.ts`, `copy.ts`, `types.ts`, `utils.ts`, `tools.ts`
- `item_progress.ts`, `item_progress_test.ts`
- `opening_decider.ts`, `opening_response_classifier.ts`
- `global_state.ts`, `global_state_test.ts`
- `checkup_stats.ts`, `checkup_stats_test.ts`
- `db_day_scope_test.ts`, `utils_test.ts`
- `missed_reason.ts`

### Investigator weekly — 9 fichiers

Supprimer le dossier entier `supabase/functions/sophia-brain/agents/investigator-weekly/` :
- `run.ts`, `turn.ts`, `db.ts`, `copy.ts`, `types.ts`, `suggestions.ts`
- `consent_classifier.ts`, `suggestions_test.ts`, `turn_test.ts`

### Tests et modules morts

| Fichier | Raison |
|---|---|
| `supabase/functions/sophia-brain/investigator_rules_db_test.ts` | Tests V1 investigator |
| `supabase/functions/sophia-brain/state-manager_action_match_test.ts` | Teste `scoreActionHintMatch` (V1) |
| `supabase/functions/sophia-brain/lib/north_star_tools.ts` | Lit `user_north_stars` uniquement |
| `supabase/functions/trigger-weekly-bilan/payload.ts` | Payload builder V1 complet |
| `supabase/functions/trigger-weekly-bilan/payload_test.ts` | Tests du payload V1 |

---

## BATCH 5 — Brain : fichiers a NETTOYER (V1 a enlever, V2 a garder)

### `supabase/functions/sophia-brain/momentum_state.ts`

**Suppression massive.** Le fichier a 2 sections :
- Lignes 1 jusqu'au banner "V2 MOMENTUM STATE" (~ligne 2204) : c'est le V1. **TOUT SUPPRIMER.**
- De la ligne ~2204 a la fin : c'est le V2. **GARDER.**

Concretement :
- Supprimer `MOMENTUM_STATE_KEY` (`__momentum_state_v1`)
- Supprimer tous les types V1 (`MomentumStateLabel`, `MomentumDimensionState`, `MomentumState`, etc.)
- Supprimer `readMomentumState`, `writeMomentumState`, `consolidateMomentumState`, `fetchMomentumSnapshot`, `applyRouterMomentumSignals`, `deriveMomentumInputsFromDispatcherSignals`, `getTopMomentumBlocker`, `summarizeMomentumStateForLog`, et toute autre fonction V1
- Supprimer la lazy migration V1→V2 dans `readMomentumStateV2` (la branche qui lit `MOMENTUM_STATE_KEY` et migre vers V2)
- Garder `MOMENTUM_STATE_V2_KEY`, `readMomentumStateV2`, `writeMomentumStateV2`, `consolidateMomentumStateV2`, et toutes les fonctions V2
- Adapter les exports : ne plus exporter les symboles V1 supprimes

### `supabase/functions/sophia-brain/momentum_state_test.ts`

Supprimer TOUS les tests V1 (ceux qui testent `readMomentumState`, `consolidateMomentumState`, signaux V1).
Garder uniquement les tests qui testent des fonctions V2.
**Si tous les tests sont V1, supprimer le fichier.**

### `supabase/functions/sophia-brain/momentum_state_v2_test.ts`

Supprimer les tests de lazy migration V1→V2 (puisqu'on supprime la migration).
Garder les tests V2 purs.

### `supabase/functions/sophia-brain/state-manager.ts`

Supprimer :
- Tout le bloc "CONTEXT MODULAIRE" et les fonctions qui lisent `user_plans`, `user_actions`, `user_framework_tracking`, `user_vital_signs`, `user_north_stars` :
  - `PlanMetadataResult` type et `getPlanMetadata`, `formatPlanMetadata`
  - `getPlanFullJson`, `formatPlanJson`
  - `getActionsSummary`, `formatActionsSummary`
  - `getActionDetailsByHint`, `getActionsDetails`
  - `getVitalSignsContext`
  - `scoreActionHintMatch` et ses helpers
  - `getDispatcherActionSnapshot` et `DispatcherActionSnapshotItem`
- Toutes les interfaces/types uniquement utilises par ces fonctions
Garder :
- `AgentMode`, `UserChatState`, `normalizeScope`
- `getUserState`, `updateUserState`
- `logMessage`
- `getCoreIdentity`

### `supabase/functions/sophia-brain/context/loader.ts`

Supprimer :
- Tout import V1 depuis `state-manager.ts` (`formatActionsSummary`, `formatPlanJson`, `formatPlanMetadata`, `getActionDetailsByHint`, `getActionsDetails`, `getActionsSummary`, `getPlanFullJson`, `getPlanMetadata`, `getVitalSignsContext`, `PlanMetadataResult`)
- La fonction `loadPersonalActionsSurfaceSummary` (lit `user_personal_actions`)
- Toutes les branches qui construisent les blocs de contexte V1 (`plan_metadata`, `plan_json`, `actions_summary`, `actions_details`, `vitals`)
- Les appels a `readMomentumState` (V1) — remplacer par `readMomentumStateV2`
Garder :
- L'import de `AgentMode` depuis `state-manager.ts`
- Tous les blocs de contexte V2 (`planItemIndicators`, North Star depuis `user_metrics`, recap hebdo depuis `system_runtime_snapshots`)

### `supabase/functions/sophia-brain/context/types.ts`

Supprimer :
- `PlanMetadata` et son champ `current_phase`
- Les flags V1 dans `ContextProfile` : `plan_metadata`, `plan_json`, `actions_summary`, `actions_details`, `vitals`
- Le type slice pour `personal_actions_surface`
Garder :
- `AgentMode` import
- Les flags V2/partages
- `OnDemandTriggers`

### `supabase/functions/sophia-brain/router/dispatcher.ts`

Supprimer :
- Sur `DispatcherSignals` : les champs `create_action`, `update_action`, `breakdown_action`, `track_progress_action`, `track_progress_vital_sign`, `action_discussion`, `activate_action`, `delete_action`, `deactivate_action` (et leurs types)
- Sur `DEFAULT_SIGNALS` : les defaults correspondants
- Dans le parsing : les lignes qui lisent `signalsObj?.create_action`, `update_action`, `breakdown_action`, `activate_action`, `delete_action`, `deactivate_action`
- Dans l'output : les champs correspondants dans le `return`
- Le champ `actionSnapshot` sur `DispatcherInputV2`
- La fonction `buildPlanItemSnapshotSection` : la branche fallback "SNAPSHOT PLAN (LEGACY)"
- `SignalHistoryEntry` : le commentaire mentionnant `create_action_intent`
Garder :
- Les signaux V2 : `plan_item_discussion`, `plan_feedback`, `track_progress_plan_item`, `track_progress_north_star`
- `plan_item_snapshot` (champ V2)

### `supabase/functions/sophia-brain/router/dispatcher_flow.ts`

Supprimer :
- Le champ optionnel `actionSnapshot` et son passthrough

### `supabase/functions/sophia-brain/surface_state.ts`

Supprimer :
- Les references aux signaux V1 dans `shouldSuppressSurface` / `hasCompetingDashboardOrActionIntent` : `create_action`, `update_action`, `breakdown_action`, `activate_action`, `deactivate_action`, `delete_action`, `action_discussion`
Garder :
- Les signaux V2 : `plan_item_discussion`, `plan_feedback`

### `supabase/functions/sophia-brain/surface_state_test.ts`

Supprimer les fixtures de test qui utilisent les signaux V1 (`create_action`, `update_action`).
Adapter les tests pour ne garder que les signaux V2.

### `supabase/functions/sophia-brain/router/run.ts`

Supprimer :
- Les imports V1 de `momentum_state.ts` : `readMomentumState`, `writeMomentumState`, `consolidateMomentumState`, `applyRouterMomentumSignals`, `deriveMomentumInputsFromDispatcherSignals`, `getTopMomentumBlocker`
- **Tous les appels** a `readMomentumState(...)` — les remplacer par `readMomentumStateV2(...)` avec adaptation des champs (`.current_state` → `.state`, etc.)
- **Tous les appels** a `writeMomentumState(...)` — remplacer par `writeMomentumStateV2(...)`
- **Tous les appels** a `consolidateMomentumState(...)` — remplacer par `consolidateMomentumStateV2(...)`
- La logique de routing vers `investigator` mode — remplacer par `companion` (ou un fallback adapte). Si le router selecte `investigator`, il doit fallback sur `companion` car l'agent n'existe plus.
- Idem pour `investigator-weekly` routing
Garder :
- Tout le reste du run (dispatching V2, tracking V2, coaching V2, outreach V2)

### `supabase/functions/sophia-brain/router/run_test.ts`

Supprimer les assertions negatives sur `create_action:` / `breakdown_action` (elles n'ont plus de sens si les signaux sont retires du type).
Garder tous les tests V2.

### `supabase/functions/sophia-brain/router/magic_reset_test.ts`

Supprimer ou adapter le fixture qui contient `machine_type: "create_action"`.

### `supabase/functions/sophia-brain/agents/watcher.ts`

Supprimer :
- L'import et l'utilisation de `checkin_scope.ts` pour l'exclusion V1
- Les appels a `readMomentumState` (V1), `consolidateMomentumState`, `writeMomentumState`
Remplacer par les equivalents V2.

### `supabase/functions/sophia-brain/momentum_morning_nudge.ts`

Supprimer :
- L'appel a `readMomentumState` (V1)
Remplacer par `readMomentumStateV2`.

### `supabase/functions/sophia-brain/momentum_proactive_selector.ts`

Supprimer :
- L'appel a `readMomentumState` (V1)
Remplacer par `readMomentumStateV2`.

### `supabase/functions/sophia-brain/momentum_morning_nudge_test.ts`

Supprimer les tests qui construisent des fixtures `__momentum_state_v1`.
Garder les tests V2.

### `supabase/functions/_shared/momentum-observability_test.ts`

Supprimer ou adapter l'appel a `readMomentumState`.

### `supabase/functions/sophia-brain/coaching_intervention_observability.ts`

Supprimer :
- L'import `WeeklyCoachingInterventionState` depuis `trigger-weekly-bilan/payload.ts` (fichier supprime)
Remplacer par un type inline ou un type V2 equivalent.

### `supabase/functions/sophia-brain/topic_memory.ts`

Supprimer :
- La fonction `processTopicsFromPlan` (son seul appelant `process-plan-topic-memory` est supprime)

### `supabase/functions/_shared/checkin_scope.ts`

Supprimer :
- La fonction `fetchCheckinExclusionSnapshot` et tout le code qui lit `user_actions`, `user_personal_actions`, `user_framework_tracking`, `user_vital_signs`
Remplacer par un equivalent V2 qui lit `user_plan_items` si le watcher en a besoin, sinon laisser vide.

### `supabase/functions/_shared/checkin_scope_test.ts`

Adapter les tests en coherence avec le nettoyage de `checkin_scope.ts`.

### `supabase/functions/trigger-memory-echo/index.ts`

Supprimer :
- Le bloc "Strategy 1" qui lit `user_plans` (V1)
Remplacer par une lecture de `user_plans_v2` si la fonctionnalite est encore necessaire, sinon retirer la strategie.

### `supabase/functions/whatsapp-webhook/index.ts`

Supprimer :
- La requete `.from("user_plans")` — remplacer par `.from("user_plans_v2")` via le runtime V2
- Toute logique conditionnelle basee sur l'ancien modele de plan

### `supabase/functions/whatsapp-webhook/handlers_onboarding.ts`

Supprimer :
- Les requetes `.from("user_plans")` — remplacer par V2
- Les heuristiques `signals?.create_action` / `update_action`

### `supabase/functions/whatsapp-webhook/handlers_optin_bilan.ts`

Supprimer :
- La requete `.from("user_plans")` — remplacer par V2

### `supabase/functions/whatsapp-webhook/handlers_unlinked.ts`

Supprimer :
- La requete `.from("user_plans").select("content")` — remplacer par V2

### `supabase/functions/whatsapp-webhook/handlers_pending.ts`

Supprimer :
- L'import de `buildWeeklyReviewPayload` depuis `trigger-weekly-bilan/payload.ts`
- L'import de `createWeeklyInvestigationState` depuis `investigator-weekly/types.ts`
- Toute logique qui utilise ces imports
Remplacer par la logique V2 du weekly bilan si necessaire.

### `supabase/functions/_shared/llm-usage.ts`

Supprimer :
- Les mappings pour `sort-priorities`, `summarize-context` (fonctions supprimees)
Garder :
- Le mapping `generate-plan` (V2 existe encore sous ce pattern matching)

### `supabase/functions/_shared/llm-usage_test.ts`

Adapter les assertions pour les sources supprimees.

---

## BATCH 6 — Verification finale

Apres tous les batches :

1. `npm run build` doit passer (frontend)
2. `deno check supabase/functions/sophia-brain/router/run.ts` doit passer
3. `deno check supabase/functions/sophia-brain/momentum_state.ts` doit passer
4. `deno check supabase/functions/sophia-brain/state-manager.ts` doit passer
5. `deno check supabase/functions/sophia-brain/context/loader.ts` doit passer
6. `deno check supabase/functions/sophia-brain/router/dispatcher.ts` doit passer
7. `deno check supabase/functions/whatsapp-webhook/index.ts` doit passer
8. Verifier qu'il n'y a plus AUCUNE reference a :
   - `user_goals` (hors migrations SQL et AdminUsageDashboard)
   - `user_actions` (idem)
   - `user_framework_tracking` (idem)
   - `user_vital_signs` (idem)
   - `user_north_stars` (idem)
   - `user_action_entries` (idem)
   - `current_phase` (idem)
   - `__momentum_state_v1` (nulle part)
   - `MOMENTUM_STATE_KEY` (nulle part)
   - `readMomentumState` sans V2 suffix (nulle part)
   - `getDispatcherActionSnapshot` (nulle part)
   - `create_action` / `update_action` / `breakdown_action` comme signal dispatcher (nulle part dans le code actif)

---

## Ce qui RESTE et est OK

- `weekly_bilan_recaps` — utilise par le V2 comme persistence complementaire
- `user_personal_actions` — table utilisee par le dashboard pour des actions personnelles (hors scope V2)
- `user_round_table_entries` — systeme modules (orthogonal)
- `user_framework_entries` — sera supprime avec Grimoire
- `AdminUsageDashboard.tsx` — mapping historique des familles LLM (mentions textuelles, pas de `.from()`)
- Tables V1 en base de donnees — on ne les drop PAS. Elles restent en base mais plus aucun code ne les lit.
- Fichiers de migration SQL — JAMAIS TOUCHES
