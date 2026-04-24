# Rapport d'audit legacy — Lot 8.1

> **Date:** 2026-03-24
> **Scope:** audit complet du codebase apres les lots 0-7 de la V2
> **Objectif:** identifier tout code qui depend encore de constructions V1 avant nettoyage
> **Action:** NE RIEN SUPPRIMER — ce rapport sert de base pour le lot 8.2

---

## Table des matieres

1. [Synthese executive](#1-synthese-executive)
2. [current_phase (colonne user_plans)](#2-current_phase)
3. [user_goals comme verite de transformation](#3-user_goals)
4. [user_actions / user_framework_tracking comme grille d'execution](#4-user_actions--user_framework_tracking)
5. [Notion de "phases" dans le dashboard](#5-phases-dans-le-dashboard)
6. [recommend-transformations edge function](#6-recommend-transformations)
7. [sort-priorities edge function](#7-sort-priorities)
8. [summarize-context ancienne forme](#8-summarize-context)
9. [suggest-north-star edge function](#9-suggest-north-star)
10. [__momentum_state_v1](#10-momentum_state_v1)
11. [Routes legacy (/dashboard-legacy, /onboarding-legacy)](#11-routes-legacy)
12. [Code mort (dead code)](#12-code-mort)
13. [Edge functions V1 a supprimer](#13-edge-functions-v1)
14. [Frontend — pages V1 a supprimer](#14-frontend-pages-v1)
15. [Frontend — composants V1 a supprimer](#15-frontend-composants-v1)
16. [Frontend — hooks et libs V1 a supprimer](#16-frontend-hooks-et-libs-v1)
17. [Frontend — fichiers mixtes V1/V2 (a nettoyer)](#17-frontend-mixtes-v1v2)
18. [Frontend — fichiers hors-scope V2 (Grimoire, modules, etc.)](#18-frontend-hors-scope)
19. [Backend — brain modules V1 qui coexistent](#19-brain-v1-coexistence)
20. [Backend — state-manager.ts](#20-state-manager)
21. [Backend — signaux CRUD V1 dans le dispatcher](#21-signaux-crud-v1)
22. [SQL — fonctions stockees et triggers actifs sur tables V1](#22-sql-fonctions-triggers)
23. [Tests et fixtures V1](#23-tests-fixtures)
24. [Scripts V1](#24-scripts)
25. [Tables V1 encore lues par du code actif](#25-tables-v1-actives)
26. [Plan de suppression par batch](#26-plan-batch)

---

## 1. Synthese executive

### Chiffres cles

| Categorie | Fichiers concernes |
|---|---|
| Frontend — pages V1 pures (suppressibles) | ~12 fichiers |
| Frontend — composants dashboard V1 (suppressibles) | ~20 fichiers |
| Frontend — hooks/libs V1 (suppressibles) | ~8 fichiers |
| Frontend — types V1 (suppressibles) | ~3 fichiers |
| Frontend — fichiers mixtes V1/V2 (a nettoyer) | 4 fichiers |
| Edge functions V1 (suppressibles) | 7 dossiers |
| Backend brain — dead code | 3 exports/fichiers |
| Backend brain — coexistence V1/V2 necessaire | ~10 fichiers |
| E2E / tests V1 (a adapter ou supprimer) | ~12 fichiers |
| SQL fonctions/triggers actifs sur V1 | ~8 fonctions + 6 triggers |

### Decision architecturale

Le code V1 ne peut pas etre supprime d'un bloc. Il y a **3 categories de risque** :

1. **Safe now** — fichiers purement V1, plus appeles par aucun chemin V2
2. **Coexistence** — code V1 encore actif pour les users pas encore migres (brain agents, momentum V1, investigator, checkins recurrents)
3. **Adaptation requise** — fichiers mixtes qui melangent V1 et V2 (App.tsx, PlanPriorities.tsx, etc.)

---

## 2. current_phase

Colonne `user_plans.current_phase` — remplacee par le modele sans phases (3 dimensions : support/missions/habits).

| Fichier | Lignes | Usage | Safe a supprimer ? |
|---|---|---|---|
| `supabase/functions/sophia-brain/context/types.ts` | 112 | Type `current_phase: number \| null` dans `PlanRow` | OUI — type V1 du loader |
| `supabase/functions/sophia-brain/state-manager.ts` | 172, 185, 206 | Lecture et affichage `Phase: ${plan.current_phase}` | OUI — state-manager V1, les V2 ne l'utilisent plus |
| `supabase/functions/trigger-weekly-bilan/payload.ts` | 34, 131-132, 774, 867, 879-880, 1084, 1151-1152 | `is_current_phase`, `current_phase_index`, `current_phase_title`, `current_phase_actions` | COEXISTE — weekly bilan V1 encore actif pour users V1 |
| `supabase/functions/trigger-weekly-bilan/payload_test.ts` | 40, 75, 207, 228 | Fixtures tests du payload V1 | SUIT payload.ts |
| `frontend/e2e/*.spec.ts` (6 fichiers) | multiples | Fixtures de test inserant `current_phase: 1` | OUI si on supprime les tests legacy |
| `frontend/scripts/provision_fixture_user.mjs` | 136 | Fixture provisioning | A ADAPTER pour V2 |
| `frontend/src/security/rls-negative.int.test.ts` | 67 | Fixture de test | OUI |
| `supabase/functions/sophia-brain/investigator_rules_db_test.ts` | 81 | Fixture de test | OUI |
| `supabase/migrations/*.sql` | DDL | Definition de la colonne | JAMAIS TOUCHER (historique migrations) |

---

## 3. user_goals

Table `user_goals` — remplacee par `user_transformations`.

| Fichier | Usage | Safe ? |
|---|---|---|
| `frontend/src/pages/GlobalPlan.tsx` | Page entiere — invoque `recommend-transformations`, ecrit `user_goals` | OUI — supprimable |
| `frontend/src/pages/GlobalPlanFollow.tsx` | Idem | OUI |
| `frontend/src/pages/PlanPriorities.tsx` | Lit/ecrit `user_goals` (l.250, 381, 648-651, 966, 1009) + mode V2 | MIXTE — garder, nettoyer le code V1 |
| `frontend/src/pages/PlanPrioritiesFollow.tsx` | Entierement V1 | OUI |
| `frontend/src/pages/ActionPlanGeneratorNext.tsx` | Lit `user_goals` (l.148, 280, 347, 379, 482, 566, 579, 587, 658) | OUI |
| `frontend/src/pages/NextPlan.tsx` | Lit `user_goals` (l.75) | OUI |
| `frontend/src/lib/grimoire.ts` | Join `user_goals` (l.20, 112) | ATTENTION — Grimoire actif, a adapter |
| `frontend/src/components/dashboard/NorthStarSection.tsx` | Lit `user_goals` pour north_star_id | OUI — composant V1 |
| `frontend/scripts/provision_fixture_user.mjs` | Seed fixture | A ADAPTER |
| `supabase/functions/suggest-north-star/index.ts` | Lit `user_goals` (l.134, 147, 154) | OUI — V2 utilise `user_metrics` |
| `supabase/functions/schedule-recurring-checkins/index.ts` | Lit `user_goals` (l.173) | COEXISTE — cron V1 encore actif |
| `supabase/functions/sophia-brain/investigator_rules_db_test.ts` | Seed fixture | OUI |
| `frontend/e2e/*.spec.ts` (3+ fichiers) | Fixtures de test | OUI |
| `frontend/src/security/rls-negative.int.test.ts` | Fixture | OUI |
| `supabase/migrations/*.sql` | DDL + RLS policies | JAMAIS TOUCHER |

---

## 4. user_actions / user_framework_tracking

Tables d'execution V1 — remplacees par `user_plan_items` / `user_plan_item_entries`.

### Frontend (tout suppressible sauf mentions)

| Fichier | V1 deps | Safe ? |
|---|---|---|
| `frontend/src/hooks/useDashboardData.ts` | `user_actions`, `user_framework_tracking`, `user_vital_signs` | OUI |
| `frontend/src/hooks/useDashboardLogic.ts` | Tous les V1 + `user_framework_entries`, `user_answers` | OUI |
| `frontend/src/pages/Dashboard.tsx` | Dashboard V1 entier | OUI |
| `frontend/src/components/dashboard/PlanPhaseBlock.tsx` | V1 | OUI |
| `frontend/src/components/dashboard/PlanActionCard.tsx` | V1 | OUI |
| `frontend/src/components/dashboard/PersonalActionsSection.tsx` | `user_personal_actions` V1 | OUI |
| `frontend/src/components/dashboard/NorthStarSection.tsx` | `user_north_stars` V1 | OUI |
| `frontend/src/lib/planActions.ts` | Distribution V1 (`user_actions`, `user_framework_tracking`, `user_vital_signs`) | OUI |
| `frontend/src/lib/planActions.int.test.ts` | Tests V1 | OUI |
| `frontend/src/lib/grimoire.ts` | Lit `user_actions`, `user_framework_tracking` | ATTENTION — Grimoire actif |
| `frontend/src/types/dashboard.ts` | Types V1 (`PlanPhase`, `Action`, etc.) | OUI |
| `frontend/src/pages/FrameworkExecution.tsx` | `user_framework_entries` | A DECIDER — framework execution hors scope V2 ? |
| `frontend/src/components/FrameworkHistoryModal.tsx` | `user_framework_entries` | SUIT FrameworkExecution |

### Backend

| Fichier | V1 deps | Safe ? |
|---|---|---|
| `supabase/functions/sophia-brain/state-manager.ts` | `getDispatcherActionSnapshot` : `user_actions`, `user_framework_tracking`, `user_vital_signs`, `user_north_stars` | OUI — `getDispatcherActionSnapshot` n'est plus appelee nulle part |
| `supabase/functions/sophia-brain/lib/tracking.ts` | Ecrit `user_action_entries`, `user_actions`, `user_vital_signs` | COEXISTE — le tracking V1 est encore appele par les agents investigator |
| `supabase/functions/sophia-brain/agents/investigator/streaks.ts` | `user_action_entries` | COEXISTE — investigator V1 actif |
| `supabase/functions/sophia-brain/agents/investigator/db.ts` | `user_actions`, `user_action_entries`, `user_vital_signs`, `user_framework_tracking` | COEXISTE |
| `supabase/functions/_shared/checkin_scope.ts` | `user_actions`, `user_framework_tracking` | COEXISTE — utilise par `schedule-recurring-checkins` V1 |
| `supabase/functions/sophia-brain/momentum_state.ts` | V1 lit `user_action_entries` pour les streaks | COEXISTE — lazy migration V1→V2 |
| `supabase/functions/archive-plan/index.ts` | `user_actions`, `user_framework_entries`, `user_vital_signs`, `user_goals` | OUI quand l'archivage V1 est retire |

---

## 5. Phases dans le dashboard

Le concept V1 de "phases" (phases[].actions dans le JSON du plan) — remplace par les 3 dimensions (support/missions/habits).

| Fichier | Safe ? |
|---|---|
| `frontend/src/pages/Dashboard.tsx` | OUI |
| `frontend/src/hooks/useDashboardLogic.ts` | OUI |
| `frontend/src/hooks/useDashboardData.ts` | OUI |
| `frontend/src/components/dashboard/PlanPhaseBlock.tsx` | OUI |
| `frontend/src/types/dashboard.ts` | OUI |
| `frontend/src/lib/planActions.ts` | OUI |
| `frontend/src/lib/grimoire.ts` | ATTENTION — Grimoire lit `content.phases` |
| `frontend/src/pages/ActionPlanGeneratorRecraft.tsx` | OUI |
| `frontend/src/pages/ActionPlanGeneratorNext.tsx` | OUI |
| `frontend/src/edge/ultimate.int.test.ts` | OUI |

---

## 6. recommend-transformations

Edge function V1 — remplacee par `analyze-intake-v2`.

| Fichier | Safe ? |
|---|---|
| `supabase/functions/recommend-transformations/` (3 fichiers) | OUI |
| `frontend/src/pages/GlobalPlan.tsx` (l.678) | OUI — page entiere a supprimer |
| `frontend/src/pages/GlobalPlanFollow.tsx` (l.673) | OUI — page entiere a supprimer |
| `frontend/src/edge/coverage-guard.int.test.ts` (l.77) | A ADAPTER — retirer de la liste |

---

## 7. sort-priorities

Edge function V1 — remplacee par `crystallize-v2`.

| Fichier | Safe ? |
|---|---|
| `supabase/functions/sort-priorities/` (2 fichiers) | OUI |
| `frontend/src/pages/PlanPriorities.tsx` (l.589) | MIXTE — le call est dans le chemin V1, a nettoyer |
| `frontend/src/pages/PlanPrioritiesFollow.tsx` (l.284) | OUI — page entiere a supprimer |
| `frontend/src/edge/coverage-guard.int.test.ts` (l.83) | A ADAPTER |
| `frontend/src/edge/edge-functions.int.test.ts` (l.69) | A ADAPTER |

---

## 8. summarize-context

Edge function V1 — remplacee par le pipeline V2 (cristallisation).

| Fichier | Safe ? |
|---|---|
| `supabase/functions/summarize-context/index.ts` | OUI |
| `frontend/src/pages/ActionPlanGeneratorFollow.tsx` (l.483) | OUI |
| `frontend/src/pages/ActionPlanGeneratorNext.tsx` (l.316) | OUI |
| `frontend/src/pages/ActionPlanGeneratorRecraft.tsx` (l.271) | OUI |
| `frontend/src/hooks/usePlanGeneratorData.ts` (l.256, 306) | OUI |
| `frontend/src/edge/coverage-guard.int.test.ts` (l.90) | A ADAPTER |
| `frontend/src/edge/edge-functions.int.test.ts` (l.47) | A ADAPTER |
| `supabase/functions/_shared/llm-usage.ts` (l.78) | GARDER — mapping pour reporting historique |
| `frontend/src/pages/AdminUsageDashboard.tsx` (l.89) | GARDER — idem |

---

## 9. suggest-north-star

Edge function V1 — remplacee par `user_metrics` avec scope cycle.

| Fichier | Safe ? |
|---|---|
| `supabase/functions/suggest-north-star/` | OUI |
| `frontend/src/components/dashboard/NorthStarSection.tsx` | OUI — composant V1 |
| `frontend/src/edge/coverage-guard.int.test.ts` | A ADAPTER |

---

## 10. __momentum_state_v1

Cle de state temporaire V1 dans `user_chat_states` — coexiste avec `__momentum_state_v2`.

| Fichier | Safe ? |
|---|---|
| `supabase/functions/sophia-brain/momentum_state.ts` (l.16) | COEXISTE — lazy migration V1→V2 active tant que tous les users n'ont pas fait leur premiere consolidation V2 |
| `supabase/functions/sophia-brain/momentum_morning_nudge_test.ts` (l.27, 95) | SUIT le code V1 |

---

## 11. Routes legacy

| Route | Fichier | Safe ? |
|---|---|---|
| `/dashboard-legacy` | `frontend/src/App.tsx` (l.85) | OUI — route de transition creee au lot 5.1 |
| `/onboarding-legacy` | **N'existe pas** — jamais creee | N/A |

---

## 12. Code mort (dead code)

Exports/fichiers definis mais jamais importes nulle part dans le codebase.

| Fichier | Symbole | Evidence |
|---|---|---|
| `supabase/functions/sophia-brain/state-manager.ts` | `getDispatcherActionSnapshot()` | Aucun import — remplace par `plan_item_snapshot` au lot 7.1 |
| `supabase/functions/sophia-brain/lib/tracking.ts` | `handleTracking()` (module entier) | Aucun import — le tracking V1 n'est plus appele |
| `supabase/functions/sophia-brain/lib/tool_ledger.ts` | Module entier | Aucun import |
| `frontend/src/types/plan.ts` | Types V1 Phase/GeneratedPlan | Aucun import dans frontend/ |
| `frontend/src/data/dashboardMock.ts` | Mock data V1 | Aucun import |

---

## 13. Edge functions V1 a supprimer

| Dossier | Remplacee par | Safe ? |
|---|---|---|
| `supabase/functions/recommend-transformations/` | `analyze-intake-v2` | OUI |
| `supabase/functions/sort-priorities/` | `crystallize-v2` | OUI |
| `supabase/functions/summarize-context/` | Pipeline V2 cristallisation | OUI |
| `supabase/functions/suggest-north-star/` | `user_metrics` cycle-level | OUI |
| `supabase/functions/generate-plan/` | `generate-plan-v2` | OUI |
| `supabase/functions/break-down-action/` | Pas d'equivalent V2 — fonctionnalite remplacee par le plan structurel V2 | OUI |
| `supabase/functions/archive-plan/` | Pas d'equivalent V2 direct — cycle lifecycle V2 gere la cloture | OUI quand l'archivage V1 est retire |

### Edge functions qui COEXISTENT

| Dossier | Raison |
|---|---|
| `supabase/functions/schedule-recurring-checkins/` | Cron V1 encore actif pour les users V1 |
| `supabase/functions/process-plan-topic-memory/` | Topic memory encore cle sur `user_plans` V1 |
| `supabase/functions/trigger-memory-echo/` | Echo pipeline lit encore `user_plans` V1 |

---

## 14. Frontend — pages V1 a supprimer

| Fichier | Role V1 |
|---|---|
| `frontend/src/pages/GlobalPlan.tsx` | Onboarding V1 — questionnaire + recommend-transformations |
| `frontend/src/pages/GlobalPlanFollow.tsx` | Idem (follow mode) |
| `frontend/src/pages/PlanPrioritiesFollow.tsx` | Priorisation V1 (follow mode) |
| `frontend/src/pages/ActionPlanGenerator.tsx` | Generation de plan V1 |
| `frontend/src/pages/ActionPlanGeneratorFollow.tsx` | Idem (follow mode) |
| `frontend/src/pages/ActionPlanGeneratorNext.tsx` | Idem (next plan mode) |
| `frontend/src/pages/ActionPlanGeneratorRecraft.tsx` | Idem (recraft mode) |
| `frontend/src/pages/NextPlan.tsx` | Page "plan suivant" V1 |
| `frontend/src/pages/Recraft.tsx` | Recraft du questionnaire V1 |
| `frontend/src/pages/Dashboard.tsx` | Dashboard V1 entier (remplace par DashboardV2.tsx) |

---

## 15. Frontend — composants V1 a supprimer

Tous dans `frontend/src/components/dashboard/` (utilises uniquement par `Dashboard.tsx` V1) :

| Fichier |
|---|
| `PlanPhaseBlock.tsx` |
| `PlanActionCard.tsx` |
| `PersonalActionsSection.tsx` |
| `NorthStarSection.tsx` |
| `NorthStarModal.tsx` |
| `ActionHelpModal.tsx` |
| `CreateActionModal.tsx` |
| `EmptyState.tsx` |
| `FeedbackModal.tsx` |
| `FrameworkModal.tsx` |
| `HabitSettingsModal.tsx` |
| `InstallAppModal.tsx` |
| `MetricCard.tsx` |
| `PlanSettingsModal.tsx` |
| `PreferencesSection.tsx` |
| `RemindersSection.tsx` |
| `CreateReminderModal.tsx` |
| `RitualCard.tsx` |
| `StrategyCard.tsx` |
| `VitalSignModal.tsx` |
| `VitalSignSettingsModal.tsx` |
| `WeekCard.tsx` |

Autres composants V1 (utilises par les pages V1 du funnel onboarding) :

| Fichier |
|---|
| `frontend/src/components/SophiaAssistantModal.tsx` |
| `frontend/src/components/OnboardingProgress.tsx` |
| `frontend/src/components/common/EpicLoading.tsx` |

---

## 16. Frontend — hooks et libs V1 a supprimer

| Fichier | Remplace par |
|---|---|
| `frontend/src/hooks/useDashboardData.ts` | `useDashboardV2Data.ts` |
| `frontend/src/hooks/useDashboardLogic.ts` | `useDashboardV2Logic.ts` |
| `frontend/src/hooks/usePlanGeneratorData.ts` | Pipeline onboarding V2 |
| `frontend/src/hooks/usePlanGeneratorLogic.ts` | Pipeline onboarding V2 |
| `frontend/src/lib/planActions.ts` | `v2-plan-distribution.ts` |
| `frontend/src/lib/planActions.int.test.ts` | Supprime avec planActions |
| `frontend/src/lib/topicMemory.ts` | Plus necessaire en V2 |
| `frontend/src/lib/loadingSequence.ts` | Plus necessaire en V2 |
| `frontend/src/lib/guestPlanFlowCache.ts` | A supprimer quand le funnel invite V1 est retire |
| `frontend/src/types/dashboard.ts` | `types/v2.ts` |
| `frontend/src/types/plan.ts` | Dead code (aucun import) |
| `frontend/src/data/dashboardMock.ts` | Dead code (aucun import) |

---

## 17. Frontend — fichiers mixtes V1/V2 (a nettoyer)

| Fichier | Ce qui est V1 | Ce qui est V2 | Action |
|---|---|---|---|
| `frontend/src/App.tsx` | Imports et routes de toutes les pages V1, route `/dashboard-legacy` | Routes `/dashboard` (V2), `/onboarding-v2` | Retirer les imports et routes V1 |
| `frontend/src/pages/PlanPriorities.tsx` | Branches `user_goals`, `sort-priorities`, `cleanupSubmissionData` | Mode V2 avec `user_transformations` | Nettoyer les branches V1 |
| `frontend/src/components/ResumeOnboardingView.tsx` | Branches `user_plans`, `user_goals` pour resume V1 → `/dashboard`, `/plan-generator` | Branche V2 `user_cycles` → `/onboarding-v2` | Retirer les branches V1 |
| `frontend/src/pages/Auth.tsx` | `guestPlanFlowCache` pour le funnel V1 | Redirection standard | Nettoyer le cache invite V1 |

---

## 18. Frontend — fichiers hors-scope V2 (Grimoire, modules, etc.)

Ces fichiers touchent des tables V1 mais appartiennent a des fonctionnalites qui ne sont pas remplacees par la V2. Ils necessiteront une adaptation future mais ne bloquent pas le lot 8.

| Fichier | V1 deps | Verdict |
|---|---|---|
| `frontend/src/lib/grimoire.ts` | `user_plans`, `user_actions`, `user_framework_tracking`, `user_goals`, `phases` | ADAPTER — le Grimoire devra lire le modele V2 |
| `frontend/src/pages/Grimoire.tsx` | Via `grimoire.ts` | SUIT |
| `frontend/src/pages/FrameworkExecution.tsx` | `user_framework_entries` | A DECIDER — framework execution V2 ? |
| `frontend/src/components/FrameworkHistoryModal.tsx` | `user_framework_entries` | SUIT FrameworkExecution |
| `frontend/src/pages/IdentityArchitect.tsx` | `user_module_state_entries` | GARDER |
| `frontend/src/pages/IdentityEvolution.tsx` | `user_module_archives`, `user_week_states` | GARDER |
| `frontend/src/pages/AdminUsageDashboard.tsx` | Mapping `sort-priorities`, `summarize-context` | GARDER — pour reporting historique |

---

## 19. Backend — brain modules V1 qui coexistent

Ces fichiers contiennent du code V1 qui doit rester tant que tous les users ne sont pas migres.

| Fichier | Raison de coexistence |
|---|---|
| `sophia-brain/momentum_state.ts` (partie V1) | Lazy migration `__momentum_state_v1` → `__momentum_state_v2` |
| `sophia-brain/agents/investigator/db.ts` | Investigator V1 lit `user_actions`, `user_action_entries` |
| `sophia-brain/agents/investigator/streaks.ts` | Calcul de streaks V1 sur `user_action_entries` |
| `sophia-brain/agents/investigator-weekly/db.ts` | Weekly investigator ecrit `weekly_bilan_recaps` |
| `sophia-brain/agents/investigator-weekly/suggestions.ts` | Types depuis `trigger-weekly-bilan/payload.ts` (V1) |
| `sophia-brain/lib/north_star_tools.ts` | Lit `user_north_stars` (utilise par investigator-weekly) |
| `sophia-brain/context/loader.ts` | Charge contexte V1 (`getPlanMetadata`, `getActionsSummary`, etc.) ET V2 | 
| `sophia-brain/context/types.ts` | Types `PlanRow` avec `current_phase`, slices V1 | 
| `sophia-brain/topic_memory.ts` | References aux `user_plans` V1 dans les commentaires |
| `_shared/checkin_scope.ts` | Lit `user_actions`, `user_framework_tracking` pour le watcher |
| `trigger-weekly-bilan/payload.ts` | Payload V1 du weekly bilan, encore appele par investigator-weekly |
| `whatsapp-webhook/` (multiples handlers) | Lit `user_plans` V1 dans handlers_onboarding, handlers_optin_bilan, handlers_unlinked, handlers_pending |
| `process-checkins/index.ts` | Mixte V1/V2 — gere `morning_nudge_v2`, `daily_bilan_v2` ET le legacy |

---

## 20. state-manager.ts

Le fichier `supabase/functions/sophia-brain/state-manager.ts` est le coeur du runtime V1. Statut de ses exports :

| Export | Appele par | Verdict |
|---|---|---|
| `AgentMode`, `normalizeScope` | watcher, synthesizer, loader, routing_decision, agent_exec, emergency | GARDER |
| `getUserState`, `updateUserState` | watcher, agent_exec, trigger-memorizer-daily | GARDER |
| `logMessage` | router/run.ts | GARDER |
| `getCoreIdentity` | context/loader.ts | GARDER |
| `getPlanMetadata`, `formatPlanMetadata` | context/loader.ts | COEXISTE — sert le contexte V1 |
| `getPlanFullJson`, `formatPlanJson` | context/loader.ts | COEXISTE |
| `getActionsSummary`, `formatActionsSummary` | context/loader.ts | COEXISTE |
| `getActionDetailsByHint`, `getActionsDetails` | context/loader.ts | COEXISTE |
| `getVitalSignsContext` | context/loader.ts | COEXISTE |
| `scoreActionHintMatch` | interne + test | COEXISTE |
| **`getDispatcherActionSnapshot`** | **AUCUN** | **DEAD CODE — a supprimer** |

---

## 21. Signaux CRUD V1 dans le dispatcher

Le lot 7.2 a retire ces signaux du **prompt**, mais le parser les detecte encore si le LLM les renvoie.

| Signal V1 deprecated | Fichier | Verdict |
|---|---|---|
| `create_action`, `update_action`, `breakdown_action`, `activate_action`, `delete_action`, `deactivate_action` | `router/dispatcher.ts` (types l.138-198, defaults l.472-498, parsing l.1970-1975, output l.2175-2207) | A NETTOYER — les types et le parsing peuvent etre retires |
| Memes signaux dans `surface_state.ts` | Detection de surface | A NETTOYER |
| `create_action` dans `whatsapp-webhook/handlers_onboarding.ts` | Signal hints WhatsApp | COEXISTE — WhatsApp V1 |
| Test de non-regression `router/run_test.ts` l.417-422 | Verifie l'absence dans le prompt | GARDER le test |

---

## 22. SQL — fonctions stockees et triggers actifs sur tables V1

> Note : les fichiers de migration sont IMMUABLES. Ce qui suit documente les objets **actifs en base** qu'il faudra eventuellement remplacer par des V2-equivalents via une migration additive.

### Fonctions stockees actives qui lisent des tables V1

| Fonction | Tables V1 | Migration definissante |
|---|---|---|
| `match_all_action_entries` | JOIN `user_actions` | `20251214101500` |
| `match_all_action_entries_for_user` | JOIN `user_actions` | `20260110120000` |
| `match_action_entries` | `user_action_entries` | `20251214101000` |
| `handle_morning_active_action_checkins_refresh` | `user_actions`, `user_personal_actions`, `user_framework_tracking`, `user_vital_signs`, `user_plans` | `20260317133000` (version finale) |
| `claim_due_daily_bilan` | `user_plans` | `20260226101500` |
| `claim_due_weekly_bilan` | `user_plans` | `20260316195000` |
| `get_admin_user_stats` | LEFT JOIN `user_plans` | `20251218030000` |
| `handle_archive_plan_trigger` | Trigger sur `user_plans` | `20260130223000` |

### Triggers actifs sur tables V1

| Table | Trigger |
|---|---|
| `user_actions` | `trg_refresh_morning_active_action_checkins_user_actions` |
| `user_personal_actions` | `trg_refresh_morning_active_action_checkins_user_personal_actions` |
| `user_plans` | `trg_refresh_morning_active_action_checkins_user_plans` |
| `user_framework_tracking` | `trg_refresh_morning_active_action_checkins_user_framework_tracking` |
| `user_vital_signs` | `trg_refresh_morning_active_action_checkins_user_vital_signs` |
| `user_plans` | `on_plan_completed_archive` → `handle_archive_plan_trigger` |

### FK V2 → V1

Aucune FK des tables V2 vers les tables V1. Les graphes sont independants. Pas de risque de cascade croisee.

### Vues / vues materialisees

Aucune vue SQL trouvee dans les migrations.

---

## 23. Tests et fixtures V1

### E2E (frontend/e2e/)

| Fichier | V1 deps | Verdict |
|---|---|---|
| `dashboard.e2e.spec.ts` | `user_goals`, `user_plans` + phases, `user_actions`, `user_vital_signs` | A ADAPTER ou SUPPRIMER |
| `chat.e2e.spec.ts` | Meme pattern de seed V1 | A ADAPTER |
| `concurrency.e2e.spec.ts` | `user_goals`, `user_plans`, `user_actions` | A ADAPTER |
| `framework.e2e.spec.ts` | `user_goals`, `user_plans`, `user_framework_tracking` | A ADAPTER |
| `plan-settings.e2e.spec.ts` | `user_goals`, `user_plans`, `user_actions` | A ADAPTER |
| `reset-recraft-next.e2e.spec.ts` | `user_goals`, `user_plans`, `user_actions` | A ADAPTER |
| `onboarding-full.e2e.spec.ts` | Flow complet V1: `/global-plan` → `/plan-priorities` → plan generator → `/dashboard` | A ADAPTER pour V2 |
| `stress-chat.e2e.spec.ts` | Pas de tables plan V1 | GARDER |
| `network-chaos.e2e.spec.ts` | Idem | GARDER |
| `chat-delete.e2e.spec.ts` | Idem | GARDER |

### Integration tests (frontend/src/edge/)

| Fichier | V1 deps | Verdict |
|---|---|---|
| `edge-functions.int.test.ts` | Invoque `summarize-context`, `sort-priorities`, `generate-plan` V1 | A ADAPTER |
| `coverage-guard.int.test.ts` | Liste les fonctions/triggers V1 | A ADAPTER au fur et a mesure |
| `ultimate.int.test.ts` | `user_plans`, `user_actions`, `user_vital_signs` intensif | A ADAPTER |
| `rls-negative.int.test.ts` | `user_goals`, `user_plans`, `user_actions` | A ADAPTER |
| `planActions.int.test.ts` | `distributePlanActions` V1 | SUPPRIMER avec planActions.ts |

### Backend tests

| Fichier | V1 deps | Verdict |
|---|---|---|
| `investigator_rules_db_test.ts` | `user_goals`, `user_plans`, `user_actions`, `user_action_entries` | COEXISTE tant que l'investigator V1 est actif |
| `momentum_morning_nudge_test.ts` | `__momentum_state_v1` | COEXISTE |
| `trigger-weekly-bilan/payload_test.ts` | `is_current_phase`, phases V1 | COEXISTE |
| `_shared/llm-usage_test.ts` | Noms de fonctions V1 (`sort-priorities`, `summarize-context`) | GARDER tant que le mapping historique existe |

---

## 24. Scripts V1

| Fichier | V1 deps | Verdict |
|---|---|---|
| `frontend/scripts/provision_fixture_user.mjs` | `user_goals`, `user_plans` + `current_phase`, `user_actions`, `user_action_entries` | A ADAPTER pour V2 |
| `package.json` → `fixtures:provision` | Appelle le script ci-dessus | A ADAPTER |

---

## 25. Tables V1 encore lues par du code actif (hors migrations)

Resume des tables V1 et du code non-suppressible qui les lit encore :

| Table V1 | Code actif qui la lit | Peut-on couper ? |
|---|---|---|
| `user_plans` | state-manager, loader, investigator, payload.ts, whatsapp-webhook, checkin claims, grimoire, admin stats | NON — coexistence necessaire |
| `user_goals` | schedule-recurring-checkins, grimoire, suggest-north-star (si pas encore supprime) | NON (sauf suggest-north-star) |
| `user_actions` | investigator, checkin_scope, state-manager, tracking, momentum V1, grimoire | NON |
| `user_framework_tracking` | investigator, checkin_scope, state-manager, grimoire | NON |
| `user_action_entries` | investigator/streaks, momentum V1, tracking, match_*_entries SQL | NON |
| `user_vital_signs` | investigator, checkin_scope, state-manager, tracking | NON |
| `user_vital_sign_entries` | tracking, archive-plan | NON |
| `user_north_stars` | north_star_tools, state-manager, schedule-recurring-checkins | NON (pour les users V1) |
| `weekly_bilan_recaps` | trigger-weekly-bilan, trigger-daily-bilan, investigator-weekly, conversation_pulse_builder | NON — utilise aussi par le V2 comme persistence complementaire |
| `user_personal_actions` | PersonalActionsSection, checkin_scope, loader, investigator | NON |

---

## 26. Plan de suppression par batch

Recommandation d'ordre pour le lot 8.2 :

### Batch 1 — Frontend : routes et pages V1 (safe now)

1. Supprimer les pages V1 (section 14)
2. Supprimer les composants dashboard V1 (section 15)
3. Supprimer les hooks/libs V1 (section 16)
4. Supprimer le dead code (section 12 — types/plan.ts, dashboardMock.ts)
5. Nettoyer `App.tsx` : retirer imports et routes V1, supprimer `/dashboard-legacy`
6. Nettoyer les fichiers mixtes (section 17)

### Batch 2 — Edge functions V1 (safe now)

1. Supprimer `recommend-transformations/`
2. Supprimer `sort-priorities/`
3. Supprimer `summarize-context/`
4. Supprimer `suggest-north-star/`
5. Supprimer `generate-plan/`
6. Supprimer `break-down-action/`
7. Supprimer `_shared/plan-validator.ts`

### Batch 3 — Brain dead code (safe now)

1. Supprimer `getDispatcherActionSnapshot` dans state-manager.ts
2. Supprimer `lib/tracking.ts` (aucun import)
3. Supprimer `lib/tool_ledger.ts` (aucun import)
4. Nettoyer les signaux CRUD V1 deprecated dans dispatcher.ts

### Batch 4 — Tests V1 (apres batches 1-3)

1. Supprimer `planActions.int.test.ts`
2. Adapter `edge-functions.int.test.ts`
3. Adapter `coverage-guard.int.test.ts`
4. Adapter `ultimate.int.test.ts`
5. Adapter les E2E (ou les réécrire pour V2)
6. Adapter `rls-negative.int.test.ts`

### Batch 5 — Coexistence (quand TOUS les users sont migres)

1. Retirer le code V1 de `momentum_state.ts`
2. Retirer les fonctions V1 de `state-manager.ts`
3. Retirer les branches V1 de `context/loader.ts` et `context/types.ts`
4. Adapter `grimoire.ts` pour le modele V2
5. Supprimer `schedule-recurring-checkins/`, `archive-plan/`, `process-plan-topic-memory/`
6. Migrer les fonctions SQL stockees (`claim_due_*_bilan`, `match_*_entries`, etc.)
7. Retirer les triggers morning refresh sur les tables V1

---

> **Ce rapport ne fait aucune suppression.** Il sert de base pour le lot 8.2.
> **Validation requise:** review humaine avant toute action.
