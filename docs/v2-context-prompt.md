# Contexte V2 Sophia — A donner au debut de chaque nouvelle conversation

## Projet

Sophia est une app de transformation personnelle. On fait une refonte V2
complete: onboarding, modele metier, plan, dashboard, systemes vivants
(momentum, bilans, coaching, nudges, memoire).

## Branche

`v2-redesign` (a partir de main)

## Documents de reference

Tous dans `docs/`. Lire dans cet ordre si besoin de contexte:

1. `docs/onboarding-v2-canonique.md` — fondation produit (flow, modele metier,
   data)
2. `docs/v2-systemes-vivants-implementation.md` — systemes runtime (momentum,
   coaching, memoire, bilans, nudges)
3. `docs/v2-technical-schema.md` — **source de verite** pour tables, enums,
   types, events, invariants
4. `docs/v2-orchestration-rules.md` — qui decide quoi, priorites, fallbacks
5. `docs/v2-global-implementation-plan.md` — plan de build en 10 lots
6. `docs/v2-mvp-scope.md` — scope V2.0 vs V2.1, dettes acceptees avec
   declencheurs
7. `docs/v2-execution-playbook.md` — playbook etape par etape avec prompts,
   checkpoints, legacy
8. `docs/v2-audit-strategy.md` — 9 guides d'audit, structure standard
9. `docs/audit-v2/` — 9 squelettes de guides d'audit (a completer au fur et a
   mesure)

## Decisions canoniques a respecter

- `user_plan_items` = source de verite d'execution
- `user_plans_v2.content` = snapshot de generation, read-only apres
  distribution, jamais resynchronise
- `user_plans_v2` est une NOUVELLE table (l'ancienne `user_plans` reste pour le
  legacy)
- `user_cycles.validated_structure` = snapshot cycle-level de l'onboarding
  (structure provisoire puis validee)
- North Star = metric canonique cycle-level dans `user_metrics`, pas une entite
  separee
- `user_metrics` = table unique avec `scope` (cycle | transformation), pas deux
  tables
- `activation_condition` (pas `unlock_rule`)
- State shapes runtime = lazy migration on read via `migrateIfNeeded`
- Cycle state machine inclut `clarification_needed` et le retour
  `prioritized → structured`
- Retrieval memoire specialise par intention (5 intentions, budgets tokens
  definis dans technical-schema section 5.7)
- Plan structure en 3 dimensions (`support`, `missions`, `habits`), PAS en
  phases

## Architecture cle

- Frontend: React + TypeScript + Tailwind (mobile-first)
- Backend: Supabase Edge Functions (Deno)
- Brain: `supabase/functions/sophia-brain/` (routeur, momentum, coaching,
  memory, etc.)
- DB: PostgreSQL via Supabase

## Lots d'implementation et statut

```
Lot 0:  Preparation                                         [FAIT]
  - 0.1 Branche v2-redesign                                [FAIT]
  - 0.2 FROZEN_MODULES.md                                  [FAIT]
  - 0.3 V2_MERGE_CHECKLIST.md                              [FAIT]
Lot 1:  Schema DB V2                                        [FAIT]
  - 1.1 Migration SQL V2 core                              [FAIT]
  - 1.2 Review migration                                   [FAIT]
  - 1.3 Types TypeScript shared                            [FAIT]
  - 1.4 Types TypeScript frontend                          [FAIT]
Lot 2:  Runtime views + events                              [FAIT]
  - 2.1 Helpers runtime backend                            [FAIT]
  - 2.2 Event contracts                                    [FAIT]
Lot 3:  Plan generation V2 + audit guide                    [FAIT]
  - 3.1 Prompts structuration + cristallisation             [FAIT]
  - 3.2 Prompt generation de plan + validateur              [FAIT]
  - 3.3 Distribution plan_items                             [FAIT]
  - 3.4 Edge function generate-plan-v2                      [FAIT]
  - 3.5 Audit guide + script d'export                       [FAIT]
Lot 4:  Onboarding V2                                       [FAIT]
Lot 5:  Dashboard V2 + audit guide                          [FAIT]
  - 5.0 Specs UX dashboard                                  [FAIT]
  - 5.1 Dashboard frontend V2                               [FAIT]
  - 5.2 Audit guide plan execution                          [FAIT]
Lot 6A: active_load + momentum V2 + audit guide             [FAIT]
  - 6A.1 Moteur active_load                                 [FAIT]
  - 6A.2 Momentum state V2 (6 dimensions, posture, assessment) [FAIT]
  - 6A.3 Audit guide momentum V2 + script d'export          [FAIT]
Lot 6B: daily + weekly + pulse + memory retrieval V2        [FAIT]
  - 6B.1 Refondre trigger-daily-bilan V2                    [FAIT]
  - 6B.2 Refondre trigger-weekly-bilan V2 (prompt + validator + materializer) [FAIT]
  - 6B.3 ConversationPulse (prompt + validator + builder)   [FAIT]
  - 6B.4 Memory retrieval V2 (contracts + scope + adapter)  [FAIT]
  - 6B.5 Guides d'audit + scripts d'export (memory, bilans, pulse) [FAIT]
Lot 6C: coaching + morning nudge V2                         [FAIT]
  - 6C.1 Coaching selector V2                              [FAIT]
  - 6C.2 Morning nudge V2 + outreach                       [FAIT]
  - 6C.3 Audit guides coaching/proactive V2                [FAIT]
Lot 7:  Dispatcher V2 adaptation + modele GPT 5.4 Mini       [FAIT]
  - 7.1 Snapshot plan items V2 pour le dispatcher            [FAIT]
  - 7.2 Nettoyer prompt dispatcher (signaux V1 superflus)    [FAIT]
  - 7.3 Adapter tracking parallele a V2                      [FAIT]
  - 7.4 Migrer loaders de contexte vers sources V2           [FAIT]
  - 7.5 Migration modele: GPT 5.4 Mini + Nano               [FAIT]
  - 7.6 Dedupliquer chargement runtime V2                    [FAIT]
Lot 8:  Legacy cleanup + LLM cost audit guide                [FAIT]
  - 8.1 Audit final des dependances legacy residuelles        [FAIT]
  - 8.2 Supprimer par batch (safe-only)                       [FAIT]
  - 8.3 Suppression totale V1 (zero coexistence)              [FAIT]
  - 8.4 LLM cost audit guide                                  [FAIT]

--- V2.1 Phases ---
Phase A: Proactive windows engine + cooldown engine            [FAIT]
  - A.1 Architecture du moteur                                [FAIT]
  - A.2 Cooldown engine                                       [FAIT]
  - A.3 Proactive windows engine                              [FAIT]
Phase B: Repair mode formel + relation preferences            [FAIT]
  - B.1 Repair mode                                           [FAIT]
  - B.2 Relation preferences                                  [FAIT]
Phase C: Rendez-vous table + transformation handoff formel    [EN COURS]
  - C.1 Migration SQL + CRUD rendez-vous                      [FAIT]
  - C.2 Integration rendez-vous pipeline                      [FAIT]
  - C.3 Prompt + moteur transformation handoff                [FAIT]
  - C.4 Wiring transformation handoff                         [EN COURS]
Phase D: user_cycle_drafts + weekly conversation digest        [EN COURS]
  - D.1 user_cycle_drafts (cache invite serveur)              [FAIT]
  - D.2 Weekly conversation digest                            [FAIT]
```

## Decisions prises en cours de route

> Cette section est mise a jour a la fin de chaque conversation. Elle capture
> les decisions, ecarts, et problemes resolus.

- **Lot 0.2:** FROZEN_MODULES.md couvre ~180 fichiers geles (brain 29.1 keep +
  brain hors cartographie + edge functions + shared + frontend legacy).
  `App.tsx`, `main.tsx` et `RouteGuards.tsx` explicitement NON geles car devront
  integrer les routes V2.
- **Lot 0.3:** MERGE_CHECKLIST.md enrichie a 12 sections / ~45 points de
  controle, ancres dans les invariants du technical-schema (sections 8.1-8.7),
  les orchestration-rules, et la policy FROZEN_MODULES.
- **Lot 1.1:** migration `20260323181825_v2_core_schema.sql` creee dans
  `supabase/migrations/` pour les 9 tables V2 canoniques, avec enums SQL, FKs,
  contraintes critiques, indexes et RLS. Le nom canonique retenu est
  `user_victory_ledger` (et non `udger`, qui etait une coquille du prompt). Les
  tables `user_plan_item_entries`, `user_victory_ledger` et
  `system_runtime_snapshots` restent sans `updated_at` car le technical-schema
  ne les definit pas.
- **Lot 1.3:** fichier partage `supabase/functions/_shared/v2-types.ts` cree a
  partir du technical-schema, avec tous les enums section 2, tous les row types
  section 3, et tous les state shapes section 5, y compris
  `MemoryRetrievalContract`. `deno check supabase/functions/_shared/v2-types.ts`
  passe localement.
- **Lot 1.4:** fichier frontend `frontend/src/types/v2.ts` cree comme miroir
  sans dependance server-side de `supabase/functions/_shared/v2-types.ts`.
  `npx tsc --noEmit -p tsconfig.app.json` passe localement. La granularite du
  suivi a ete corrigee pour aligner l'etape 1.4 du context prompt avec le
  playbook (`types frontend`, pas `integration / verification`).
- **Lot 2.1:** fichier `supabase/functions/_shared/v2-runtime.ts` cree avec
  trois helpers de lecture runtime (`getActiveTransformationRuntime`,
  `getPlanItemRuntime`, `getActiveLoad`) et leurs types de retour exportes. Les
  counts `plan_item_counts` sont agreges par `dimension/statut`, et
  `getActiveLoad` suit deja la formule du playbook Lot 6A pour les slots actifs.
  Comme `recent_traction` n'est pas encore formalise dans le technical-schema,
  `needs_consolidate` utilise temporairement une heuristique locale basee sur
  les 5 dernieres entries d'habits: `partial` compte comme signal positif,
  `support_feedback` est neutre, traction = "poor" si
  `negativeCount > positiveCount` sur la fenetre. `deno fmt` et `deno check`
  passent localement.
- **Lot 2.2:** fichier `supabase/functions/_shared/v2-events.ts` cree avec 27
  event types (sections 6.2-6.5 du technical-schema), payloads types specifiques
  (section 6.6) et helper `logV2Event<T>` type-safe qui persiste dans
  `system_runtime_snapshots`. La contrainte CHECK `snapshot_type` devra etre
  etendue via une migration additive avant la premiere emission effective (Lot
  3+). Les events coaching utilisent `GenericV2EventPayload` en attendant que
  les lots 6A-6C definissent des schemas specifiques. `deno fmt` + `deno check`
  passent.
- **Lot 3.1:** prompts de structuration (`v2-prompts/structuration.ts`) et de
  cristallisation (`v2-prompts/cristallisation.ts`) crees. La structuration
  prend le `raw_intake_text` et produit `aspects`, `provisional_groups`,
  `deferred_aspects`, `uncertain_aspects`, `needs_clarification`. Contraintes:
  max 3 blocs, max 15 aspects, usage sain de "Pour plus tard". La
  cristallisation prend les `validated_groups` et produit les transformations
  formelles (`title`, `internal_summary`, `user_summary`,
  `questionnaire_context`, `recommended_order`). Les deux prompts exportent
  leurs types TypeScript et leurs builders user-prompt.
- **Lot 3.2:** prompt de generation de plan (`v2-prompts/plan-generation.ts`)
  cree avec `PLAN_GENERATION_SYSTEM_PROMPT`, `buildPlanGenerationUserPrompt`, et
  `validatePlanOutput`. Le validateur verifie: version, cycle_id,
  transformation_id, duration_months, 3 dimensions, kind-dimension alignment
  (`KINDS_BY_DIMENSION`), activation_condition.type valide
  (`VALID_ACTIVATION_TYPES`), depends_on references existantes,
  support_mode/support_function obligatoires pour la dimension support. Le
  validateur normalise `depends_on` (accepte string ou string[]) via
  `normalizeDependsOn`.
- **Lot 3.3:** fichier `supabase/functions/_shared/v2-plan-distribution.ts` cree
  avec un helper pur `preparePlanDistribution` et un wrapper
  `distributePlanItems` qui distribue `PlanContentV2` vers `user_plan_items`,
  remplace les `temp_id` par de vrais UUIDs, resolve
  `activation_condition.depends_on`, initialise les statuts selon le contrat
  canonique (`active` si `activation_condition` est `null` ou `immediate`, sinon
  `pending`), normalise `scheduled_days` vers les codes SQL (`mon..sun`),
  renseigne `current_habit_state` pour les habitudes actives, et cree/actualise
  la metric cycle-level `north_star`. La distribution stocke aussi le `temp_id`
  d'origine dans `payload._generation.temp_id` pour pouvoir reconstruire la map
  en cas de rerun, et saute le re-insert si des items existent deja pour le
  `plan_id`. Le point de review sur `snapshot_type` a ete traite par la
  migration additive `20260323190400_extend_snapshot_type_for_v2_events.sql`,
  donc les events V2 emis par la distribution sont maintenant compatibles avec
  la contrainte SQL. `deno fmt`, `deno check` et
  `deno test supabase/functions/_shared/v2-plan-distribution_test.ts` passent
  localement.
- **Lot 3.4:** edge function `supabase/functions/generate-plan-v2/index.ts`
  creee. Elle authentifie l'utilisateur, charge `user_transformations` +
  `user_cycles`, calcule le prochain `generation_attempts/version`, appelle le
  LLM avec `PLAN_GENERATION_SYSTEM_PROMPT`, parse/valide le JSON via
  `validatePlanOutput`, persiste un snapshot dans `user_plans_v2`, appelle
  `distributePlanItems`, puis active le plan, la transformation et le cycle.
  Elle bloque les cas ou un plan V2 `generated/active/paused` existe deja pour
  la transformation afin d'eviter plusieurs plans concurrents tant que la regen
  complete n'est pas implementee. Les events `plan_activated_v2` et
  `transformation_activated_v2` sont logues en best-effort, comme
  `plan_generated_v2` via la distribution. Un test local
  `supabase/functions/generate-plan-v2/index_test.ts` couvre le calcul d'age, le
  compteur de tentatives et la validation d'un fixture `PlanContentV2`.
  `deno fmt`, `deno check` et
  `deno test supabase/functions/generate-plan-v2/index_test.ts` passent
  localement.
- **Lot 3.5:** guide d'audit `docs/audit-v2/plan-generation-v2-audit-guide.md`
  complete avec la chaine reelle implementee (structuration → cristallisation →
  generation → validation → distribution). Pour chaque etape: inputs/outputs
  reels, events logues, contraintes quantitatives. Inclut une scorecard avec
  alertes automatiques (caps de charge depasses, absence de rescue support, pas
  de debloquage progressif). Script d'export
  `scripts/export_plan_generation_audit_bundle.mjs` cree — il query directement
  la Supabase REST API (pas d'edge function d'audit) pour charger cycle,
  transformations, aspects, plans, plan_items, north_star metrics et events,
  puis reconstitue un bundle JSON conforme au format standard V2 (trace +
  scorecard + annotations). Commande:
  `npm run plan-gen:audit:export -- --user-id <uuid> --cycle-id <uuid>`.
  `node --check` passe localement.
- **Lot 4 (corrections pre-implementation):** review et correction de 4
  incoherences dans le playbook et `onboarding-v2-canonique.md` avant
  implementation. (1) `PlanPriorities.tsx` est **conserve et adapte**, pas
  remplace par un nouveau `TransformationPriority.tsx` — l'ecran drag-and-drop
  existant est bon, il suffit de brancher les transformations V2. (2) `Auth.tsx`
  est **conserve tel quel** — le flow V2 y redirige normalement. (3) Le
  questionnaire sur mesure cible ~3+3 questions mais ce n'est **pas un plafond**
  — le nombre varie selon la complexite. (4) La section "Regles techniques de
  refonte" dans `onboarding-v2-canonique.md` distingue maintenant "A remplacer"
  (GlobalPlan, questionnaire, dashboard) vs "A adapter" (priorisation,
  inscription).
- **Lot 4.1:** edge functions onboarding V2 implementees. `analyze-intake-v2`
  cree/recharge un cycle, appelle le prompt de structuration, persiste les
  aspects et ecrit le snapshot cycle-level dans
  `user_cycles.validated_structure`, puis passe le cycle en `structured` ou
  `clarification_needed`. `crystallize-v2` appelle la cristallisation,
  cree/recree les transformations tant qu'aucun plan ou questionnaire n'a engage
  le cycle downstream, associe les aspects aux transformations, marque les
  aspects retires comme `rejected`, puis passe le cycle en `prioritized`.
  `generate-questionnaire-v2` genere un schema dynamique depuis
  `internal_summary` + `handoff_payload.onboarding_v2.questionnaire_context`, le
  persiste dans `questionnaire_schema`, et passe le cycle en
  `questionnaire_in_progress`. Deux ajustements de contrat ont ete necessaires:
  (1) migration additive
  `20260324103000_add_validated_structure_to_user_cycles.sql` pour expliciter le
  stockage cycle-level de la structure onboarding; (2) prompt de cristallisation
  etendu avec `source_group_index` pour fiabiliser l'association regroupement ->
  transformation. Ecart documente: le technical-schema ne definit pas encore
  d'event dedie a la generation du questionnaire, donc
  `generate-questionnaire-v2` logue temporairement `cycle_prioritized_v2` avec
  `reason = questionnaire_generated` comme hook d'audit.
- **Lot 4.2:** frontend onboarding V2 implemente. Nouvelle page
  `frontend/src/pages/OnboardingV2.tsx` avec composants dedies
  `FreeTextCapture`, `AspectValidation`, `CustomQuestionnaire`,
  `MinimalProfile`, plus helper `frontend/src/lib/onboardingV2.ts` pour le draft
  localStorage. Le flow appelle `analyze-intake-v2`, `crystallize-v2`,
  `generate-questionnaire-v2` et `generate-plan-v2`, puis marque
  `profiles.onboarding_completed = true` pour rester compatible avec le
  dashboard actuel. `PlanPriorities.tsx` a d'abord ete adapte en mode V2 (sans
  dupliquer l'UI), puis simplifie en ecran V2-only au lot 8.2.
  `OnboardingV2.tsx` sait rehydrater un cycle V2 incomplet depuis Supabase quand
  le brouillon local n'existe plus. Ce comportement a ensuite ete etendu par le
  lot D.1: le draft onboarding V2 est maintenant dual-source
  `localStorage + user_cycle_drafts`, avec `anonymous_session_id`,
  synchronisation best-effort pre-signup et resolution de conflit
  "last-write-wins" sur `updated_at` (egalite => local gagne).
- **Lot 4.2 (UX review):** le prompt Gemini du playbook a ete remplace par une
  version ancree sur l'UI reelle deja codee. Il demande maintenant une review
  composant par composant de `OnboardingV2.tsx`, `FreeTextCapture`,
  `AspectValidation`, `CustomQuestionnaire`, `MinimalProfile` et
  `PlanPriorities.tsx`, avec corrections concretes sur hierarchie visuelle,
  micro-copy, friction, mobile et confiance. Suite a cette review, les
  ajustements UX ont ete implementes (confirmation de reset, adoucissement des
  micro-copies, sticky buttons sur mobile, simplification des roles V2 dans
  PlanPriorities).
- **Lot 5.0:** `docs/v2-dashboard-ux-specs.md` cree par Gemini puis corrige par
  Claude. 8 corrections integrees : ordre des dimensions corrige (Support en
  premier, conforme au canonique), mode `unlockable` et taxonomie fonctionnelle
  (`rescue`/`practice`/`understanding`) ajoutes aux supports, etat `stalled` des
  habitudes designe, indicateur d'ancrage (3/5) remplace le streak, milestones
  differencies des tasks, point d'entree daily check-in ajoute, carousel
  habitudes remplace par cartes empilees (max 2 items).
- **Lot 5.0 (daily check-in):** precision ajoutee dans
  `v2-dashboard-ux-specs.md` — le daily bilan est principalement pousse via
  WhatsApp (cron `trigger-daily-bilan`). Le bandeau in-app du dashboard est un
  canal complementaire/fallback, pas le canal principal.
- **Lot 5.1:** dashboard frontend V2 implemente. Nouvelle page
  `frontend/src/pages/DashboardV2.tsx`, branchee sur `/dashboard`. Le chargement
  V2 passe par `useDashboardV2Data.ts` qui lit `user_cycles`,
  `user_transformations`, `user_plans_v2`, `user_plan_items`,
  `user_plan_item_entries` et `user_metrics`; il ne lit ni `current_phase`, ni
  `user_actions`, ni `user_framework_tracking` comme source primaire. La logique
  `useDashboardV2Logic.ts` groupe les items par dimension, separe
  `active/pending/maintenance`, calcule le prochain debloquage a partir de
  `activation_condition`, et persiste l'execution via `user_plan_item_entries` +
  mises a jour de `user_plan_items`. Les composants V2 dedies (`StrategyHeader`,
  `NorthStarV2`, `DimensionSection`, `PlanItemCard`, `UnlockPreview`,
  `HabitMaintenanceStrip`) suivent la spec UX mobile-first du lot 5.0.
  `npm run build` passe localement; Vite signale seulement que Node 18.17.0 est
  sous la version recommandee 20.19+.
- **Lot 5.2:** guide d'audit `docs/audit-v2/plan-execution-v2-audit-guide.md`
  complete avec le lifecycle reel des `user_plan_items` (7 statuts, transitions
  canoniques, 4 types d'`activation_condition`, regle 3/5, detection zombies >
  7j, caps de charge). Trace JSON: plan_items_snapshot, status_transitions,
  unlock_events, entries_timeline, zombie_candidates, load_timeline,
  metrics_snapshot. Scorecard: completion_rate, unlock_trigger_rate,
  habit_anchoring_rate, support_effectiveness, alerts automatiques. Script
  `scripts/export_plan_execution_audit_bundle.mjs` cree — charge plan, items,
  entries, metrics et events V2 via Supabase REST API, reconstitue la timeline
  et detecte les zombies. Commande:
  `npm run plan-exec:audit:export -- --user-id <uuid> --plan-id <uuid> --hours <N>`.
  `node --check` passe localement.
- **Lot 6A.1:** moteur pur
  `supabase/functions/sophia-brain/active_load_engine.ts` cree avec
  `computeActiveLoad(planItems, entriesByItem)` et type de retour
  `MomentumStateV2["active_load"]`. Le calcul compte uniquement les `plan_items`
  actifs pour les missions, supports `recommended_now` et habitudes
  `active_building`, et preserve l'heuristique de traction sur les 5 dernieres
  entries (`partial` positif, `support_feedback` neutre, traction "poor" si
  `negativeCount > positiveCount`). `supabase/functions/_shared/v2-runtime.ts`
  delegue maintenant a ce moteur apres fetch des `plan_items` et
  `user_plan_item_entries`, sans logique inline dupliquee. Tests locaux ajoutes
  dans `supabase/functions/sophia-brain/active_load_engine_test.ts` avec 5
  scenarios fixtures; `deno fmt`, `deno check` et `deno test` passent.
- **Lot 6A.2:** `momentum_state.ts` refonde pour V2 avec coexistence V1.
  Nouvelle cle `__momentum_state_v2`, type interne `StoredMomentumV2` qui etend
  `MomentumStateV2` avec `_internal` (signal_log, stability, sources,
  metrics_cache). Les 6 dimensions V2 sont implementees: `engagement` et
  `emotional_load`/`consent` reutilisent la detection V1 (patterns regex +
  signal log), `execution_traction` remplace `progression` en lisant les
  `plan_item_entries` au lieu des `user_action_entries`, `plan_fit` detecte les
  items stalled/zombies (>7j sans entry), `load_balance` mappe depuis
  `active_load_engine`. La classification produit les memes 6 etats publics. La
  posture est derivee de l'etat + override `reduce_load` si `needs_reduce`.
  L'assessment calcule `top_risk` (emotional > consent > load > avoidance >
  drift), `top_blocker` depuis les items stalled, et `confidence` depuis la
  qualite des donnees. Le watcher V2 (`consolidateMomentumStateV2`) fetch les
  plan_items via `v2-runtime.ts` au lieu de `user_actions`/`user_vital_signs`.
  La lazy migration V1→V2 preserve l'etat, les dimensions
  (progression→execution_traction), le signal_log et la stability. Correctif
  post-review: `plan_fit` est maintenant deterministic (base sur `nowIso`, pas
  `Date.now()`), et un item `active` sans entry n'est considere zombie qu'apres
  > 7 jours depuis `activated_at` (fallback `created_at`). 10 tests dans
  > `momentum_state_v2_test.ts` couvrent les 6 etats publics + migration +
  > posture override + les 2 cas zombies sans entry; les 11 tests V1 existants
  > passent sans regression. `deno fmt`, `deno check` et `deno test` passent.
- **Lot 6B (organisation):** les etapes 6B.1-6B.4 ont ete scindees en
  sous-etapes `a` (architecture/prompts par Claude) et `b`
  (implementation/wiring par GPT/Codex). Claude concoit les prompts LLM,
  validateurs et contrats d'architecture; GPT implemente le wiring mecanique,
  les edge functions et les modules de persistence.
- **Lot 6B.1:** `trigger-daily-bilan` refonde en V2. Le daily utilise un mode
  (check_light/check_supportive/check_blocker/check_progress) derive du momentum
  state et de l'active_load. Il cible les items les plus pertinents et genere
  1-2 questions adaptees. GPT a implemente `v2_daily_bilan.ts` dans
  `trigger-daily-bilan/`.
- **Lot 6B.2a:** Claude a concu le prompt LLM weekly bilan
  (`v2-prompts/weekly-recalibrage.ts`), le validateur et le materialiseur
  (`v2-weekly-bilan-engine.ts`). Le weekly decide hold/expand/consolidate/reduce
  avec max 3 ajustements. GPT a corrige 4 points: snapshot 7 jours au lieu de
  limit 5, status `deactivated` au lieu de `paused`, `applyReplace` plus
  robuste, idempotence amelioree.
- **Lot 6B.2b:** GPT a implemente `v2_weekly_bilan.ts` dans
  `trigger-weekly-bilan/` avec appel LLM Tier 2, validation, materialisation des
  ajustements dans `user_plan_items`, et log des events V2.
- **Lot 6B.3a:** Claude a concu le prompt ConversationPulse
  (`v2-prompts/conversation-pulse.ts`) et le validateur. GPT a corrige 5 points:
  exposition des IDs dans le prompt, regle < 3 messages (confidence=low,
  direction=flat, likely_need=silence), backfill `message_ids`, caps manquants,
  clamp `last_72h_weight`.
- **Lot 6B.3b:** GPT a implemente `conversation_pulse_builder.ts` dans
  `sophia-brain/` avec chargement parallele des donnees, appel LLM, cache 12h
  scope par cycle_id+transformation_id, et persistence dans
  `system_runtime_snapshots`.
- **Lot 6B.4a:** Claude a concu l'architecture memoire V2
  (`v2-memory-retrieval.ts`): 5 contrats canoniques par intention, mapping
  couche→table, scope classifier (`classifyMemoryScope`), plan resolver
  (`resolveV2RetrievalPlan`), event payload builders. Decision d'architecture
  cle: les V2 intents ne remplacent PAS le memory_plan du dispatcher en mode
  conversationnel — le V2 contract sert de guardrail/budget cap. GPT a corrige 3
  points: structure `LAYER_SOURCES` imbriquee pour le multi-table,
  `buildRetrievalExecutedPayload` avec layers reellement chargees, migration
  `scope`/`cycle_id`/`transformation_id` sur `user_global_memories`.
- **Lot 6B.4b:** GPT a wire le retrieval V2 dans le loader
  (`context/loader.ts`), les memory modules (`global_memory.ts`,
  `topic_memory.ts`), et le run principal (`router/run.ts`). Nouveau
  `resolveContextMemoryLoadStrategy()` avec 3 modes: backward compatible (pas de
  v2Intent), dispatcher_capped (answer_user_now en companion), v2_intent pur
  (bilans/nudges). Migration additive pour partial unique indexes par scope sur
  `user_global_memories`.
- **Lot 6B.5:** 3 guides d'audit completes (memory-v2, daily-weekly-v2,
  conversation-pulse-v2) avec 9 sections chacun suivant le pattern momentum-v2.
  3 scripts d'export crees (memory-v2, bilans-v2, pulse-v2) avec pattern REST
  direct + scorecard locale. GPT a corrige 4 decalages dans les scripts:
  colonnes memoire perimees, shape conversation_pulse imbrique, daily_bilan lu
  hors metadata.output, weekly_bilan lu hors metadata.applied.
- **Lot 6A.3:** guide d'audit `docs/audit-v2/momentum-v2-audit-guide.md`
  complete (~330 lignes), refonte du squelette V2 avec fusion du guide V1. Le
  script `scripts/export_momentum_v2_audit_bundle.mjs` est maintenant aligne sur
  la temporalite runtime V2: fenetre entries sur `effective_at`,
  `last_entry_at`/zombies calcules a `window.to`, et resolution du contexte
  (cycle/transformation/plan) depuis la fenetre auditée au lieu du runtime actif
  au moment de l'export. `node --check` passe. Le lot 6A peut etre considere
  clos. Les dettes restantes sont explicitement reportées dans le playbook:
  cooldown engine + re-evaluation `snapshot_type` en Phase A, persistence
  backend du draft invite en Phase D.
- **Lot 6C.1:** `coaching_intervention_selector.ts` a ete finalise en V2 avec
  vrai wiring runtime. `router/run.ts` injecte maintenant `v2_momentum` et un
  `target_plan_item` resolu depuis les `plan_items` du plan actif. La strategie
  lit enfin `dimension + kind`, distingue micro-coaching vs structural coaching,
  et la surcharge conclut sur `simplify` sans technique residuelle.
- **Lot 6C.2:** le morning nudge V2 est operationnel de bout en bout.
  `momentum_morning_nudge.ts` applique la cascade V2 avec budget hebdo et
  cooldown same-item; `schedule-whatsapp-v2-checkins` cree des
  `scheduled_checkins` en `morning_nudge_v2`; `process-checkins` genere le
  message au moment d'envoi; `momentum_outreach.ts` lit `momentum_state_v2` et
  les `plan_items`; le watcher annule aussi les contexts morning V2.
- **Lot 6C.3:** les guides `docs/audit-v2/coaching-v2-audit-guide.md` et
  `docs/audit-v2/proactive-v2-audit-guide.md`, ainsi que leurs scripts d'export,
  ont ete corriges pour coller au runtime reel. Les bundles s'appuient sur les
  endpoints canoniques de trace/scorecard et les `scheduled_checkins` existants,
  plutot que sur des events V2 dedies non encore emis. Les logs coaching
  existants ont ete enrichis avec les champs V2 auditables
  (`dimension_detected`, `item_kind`, `coaching_scope`, `simplify_instead`,
  `dimension_strategy`, `plan_fit_level`, `load_balance_level`).
- **Lot 7.1:** le dispatcher recoit maintenant un snapshot V2 des
  `user_plan_items` via `plan_item_snapshot` (champ canonique), construit depuis
  `getPlanItemRuntime` et enrichi avec `streak_current`, `last_entry_at` et
  `active_load_score`. Correctif post-review: la validation locale de
  `run_test.ts` est reproductible sans `--allow-env`, et un test couvre
  explicitement l'injection du snapshot V2 dans le prompt dispatcher.
- **Lot 7.2:** le prompt dispatcher a ete nettoye des signaux CRUD V1 et du
  tracking vital signs legacy. Les signaux conversationnels canoniques
  deviennent `plan_item_discussion`, `plan_feedback`, `track_progress_plan_item`
  et `track_progress_north_star`; les references internes du router et du loader
  ont ete alignees sur ces noms.
- **Lot 7.3:** le tracking parallele du router ecrit maintenant en V2
  (`user_plan_item_entries` et `user_metrics`) et emet les events runtime V2
  correspondants (`plan_item_entry_logged_v2`, `metric_recorded_v2`). Le pattern
  `Promise.allSettled` est conserve pour ne pas bloquer le turn.
- **Lot 7.4:** les loaders de contexte cibles du prompt agent lisent desormais
  les sources V2: `planItemIndicators` depuis `getPlanItemRuntime`, North Star
  depuis `user_metrics`, recap hebdo depuis `system_runtime_snapshots`, et les
  addons dashboard decrivent les surfaces V2 reelles plutot que les
  sections/actions V1.
- **Lot 7.5:** le dispatcher tourne maintenant par defaut sur `gpt-5.4-mini`
  avec `reasoning_effort=low`, avec fallback explicite sur `gemini-2.5-flash` en
  cas d'echec primaire. Le tier agent `lite` passe a `gpt-5.4-nano`, et les
  metriques de fin de tour loggent le modele reellement utilise.
- **Lot 7.6:** `getActiveTransformationRuntime` est maintenant prefetche une
  seule fois par turn dans `processMessage`, puis reutilise par le snapshot
  dispatcher, le coaching selector, le tracking parallele et le context loader
  via un parametre optionnel `v2Runtime`. Un trace `brain:v2_runtime_prefetched`
  mesure le cout de ce chargement unique.
- **Lot 8.1:** audit exhaustif des dependances legacy residuelles, couvrant les
  8 points canoniques du playbook plus des angles supplementaires
  (sort-priorities, suggest-north-star, dead code brain, fonctions SQL stockees,
  triggers, tests E2E, scripts, Grimoire, modules). Rapport complet dans
  `docs/audit-v2/legacy-cleanup-audit-report.md` (26 sections). Conclusions
  cles: ~45 fichiers frontend V1 suppressibles, 7 edge functions V1, 3 fichiers
  brain dead code, 4 fichiers mixtes a nettoyer, ~10 fichiers backend en
  coexistence necessaire, 8 fonctions SQL + 6 triggers actifs sur tables V1. Le
  Grimoire resiste (lit encore les structures V1) et devra etre adapte
  separement. `weekly_bilan_recaps` est utilise par le V2 comme persistence
  complementaire. La route `/onboarding-legacy` n'a jamais ete creee.
- **Lot 8.2:** cleanup legacy safe execute. Cote frontend: suppression des pages
  V1 (`GlobalPlan*`, `ActionPlanGenerator*`, `NextPlan`, `Recraft`,
  `Dashboard`), des composants dashboard V1, des hooks/libs V1
  (`useDashboardData/Logic`, `usePlanGeneratorData/Logic`, `planActions`,
  `topicMemory`, `loadingSequence`, `guestPlanFlowCache`) et des types morts
  `dashboard.ts` / `plan.ts`. `PlanPriorities.tsx` est conserve mais reecrit en
  V2-only; `App.tsx`, `Auth.tsx` et les CTA marketing pointent maintenant vers
  `/onboarding-v2`; la partie Architecte n'a pas ete modifiee fonctionnellement.
  Cote backend: suppression des edge functions V1 safe
  (`recommend-transformations`, `sort-priorities`, `summarize-context`,
  `suggest-north-star`, `generate-plan`, `break-down-action`), du validateur
  `_shared/plan-validator.ts`, du dead code `getDispatcherActionSnapshot`, ainsi
  que des modules morts `lib/tracking.ts` et `lib/tool_ledger.ts`.
  `npm run build` passe localement. Les nettoyages backend mixtes et la
  suppression du residuel V1 ont ete finalises au lot 8.3.
- **Lot 8.3:** suppression totale du V1 executee avec exception explicite pour
  le Grimoire, conserve puis restaure en V2-only. Cote frontend: suppression de
  `FrameworkExecution`, des routes/fichiers V1 restants et nettoyage des
  tests/scripts encore relies a `user_plans`, `user_actions`, `sort-priorities`,
  `summarize-context` et `break-down-action`; `Grimoire.tsx`, `grimoire.ts`,
  `types/grimoire.ts` et `FrameworkHistoryModal.tsx` sont conserves et
  rebranches sur les tables V2. Cote backend: suppression de `archive-plan`,
  `process-plan-topic-memory`, `schedule-recurring-checkins`, des dossiers
  `agents/investigator/` et `agents/investigator-weekly/`, de
  `trigger-weekly-bilan/payload.ts`, de `north_star_tools.ts`, et nettoyage des
  fichiers mixtes (`run.ts`, `loader.ts`, `types.ts`, `watcher.ts`,
  `whatsapp-webhook/*`, `checkin_scope.ts`, `momentum_state.ts`, etc.) pour
  retirer lazy migration, momentum V1 et signaux CRUD V1. Verification finale:
  `npm run build` passe et le grep confirmatoire sur `supabase/functions` ne
  remonte plus de references runtime V1 interdites. Point restant hors perimetre
  cleanup: un `deno check` large de `whatsapp-webhook` remonte encore des
  erreurs TypeScript preexistantes dans des helpers utilitaires.
- **Lot 8.4:** guide d'audit LLM cost V2 complete avec l'inventaire reel des
  appels LLM par tier (3 Tier 1, 5 Tier 2, 11+ Tier 3, 11 memoire, 8
  embeddings). Mapping `operation_family → tier` via `inferOperationFromSource`
  de `_shared/llm-usage.ts` avec override source pour bilans/pulse. Freshness
  windows: 12h pulse, 20h daily, 6j weekly, 20h nudge, 1h compaction. 9 alertes
  automatiques dans la scorecard. Script d'export
  `scripts/export_llm_cost_audit_bundle.mjs` cree avec support `--user-id` et
  `--all-users`, detection de redondance et derive temporelle. Commande:
  `npm run llm-cost:audit:export`. Les 9 guides d'audit V2 sont maintenant tous
  completes.
- **Phase A (V2.1):** proactive windows engine + cooldown engine implementes.
  `cooldown_engine.ts` remplace les cooldowns hardcodes de
  `momentum_morning_nudge.ts` par un moteur configurable avec 5 types de
  cooldown (same_posture 48h, same_item 72h, failed_technique 14j, refused_rdv
  7j, reactivation 72h). Approche hybride: cooldowns derives depuis
  `scheduled_checkins` + `chat_messages` pour les types historiques, stockage
  registre dans `system_runtime_snapshots` (snapshot_type `cooldown_entry`) pour
  les types explicites. `proactive_windows_engine.ts` implemente le moteur de
  decision avec pipeline 8 etapes: absolute locks → momentum policy → confidence
  gate → dominant need identification (6 besoins) → window kind selection (5
  types, sensible a l'heure locale) → posture selection (cascade par window
  kind) → cooldown validation → emit. Corrections post-review integrees:
  `momentum_morning_nudge.ts` lit maintenant l'historique complet via
  `loadProactiveHistory` pour eviter les faux negatifs de cooldown quand le
  dernier nudge differe, `min_gap_hours` du `momentum_policy.ts` est applique
  dans `evaluateProactiveWindow`, et `confidence=medium` downgrade reellement
  les sorties vers une window light avec posture light-only. Contrat
  `system_runtime_snapshots.snapshot_type` realigne entre migration, schema
  technique et types partages pour inclure aussi `plan_item_entry_logged_v2`,
  `metric_recorded_v2` et `cooldown_entry`. Types `CooldownType` et
  `DominantNeedKind` ajoutes dans `v2-types.ts`, `frontend/src/types/v2.ts` et
  `v2-technical-schema.md`. 70 tests passent (17 cooldown + 34 proactive + 19
  morning nudge).
- **Phase B (V2.1):** repair mode et relation preferences sont maintenant
  branches runtime. `process-checkins` persiste/logue l'entree en repair mode,
  met a jour `last_soft_contact_at`, et `router/run.ts` gere la sortie avec
  `repair_mode_exited_v2`. La table `user_relation_preferences` est creee via
  migration additive, et `relation_preferences_engine.ts` infere de facon
  conservative les preferences a partir des proactives envoyes, des reactions
  WhatsApp, des horaires et de la longueur des reponses. Consommation immediate:
  le scheduler morning respecte la fenetre `morning`, le renderer WhatsApp
  dynamique injecte `preferred_tone` / `preferred_message_length`, et le
  proactive windows engine bloque les fenetres dislikees + cappe
  `max_proactive_intensity=low` a une intensite light.
- **Phase C.1 (V2.1):** la table `user_rendez_vous` est maintenant creee via
  migration additive avec RLS, indexes `(user_id, state)` /
  `(user_id, scheduled_for)` et trigger `updated_at`. Nouveau helper partage
  `supabase/functions/_shared/v2-rendez-vous.ts` avec `createRendezVous`,
  `transitionRendezVous`, `getActiveRendezVous`, `getRendezVousHistory`, plus
  validation des invariants (`trigger_reason` obligatoire, refus de
  `confidence=low`, verification du cooldown `refused_rendez_vous` via
  `cooldown_engine.ts`). Le payload de `rendez_vous_state_changed_v2` est
  maintenant specifique dans `v2-events.ts` et le technical-schema. Les types
  partages/frontend etaient deja alignes sur le technical-schema, donc aucune
  extension de `v2-types.ts` / `frontend/src/types/v2.ts` n'a ete necessaire.
- **Phase C.2 (V2.1, corrections GPT):** GPT a corrige et enrichi C.1/C.2 avec
  des payloads specifiques dans `v2-events.ts` (`RendezVousStateChangedPayload`,
  `RepairModeEnteredPayload`, `RepairModeExitedPayload`), des types TypeScript
  supplementaires dans `v2-types.ts` (`CooldownType`, `DominantNeedKind`,
  `RelationPreferenceContactWindow`, typage strict des contact windows), et un
  alignement du commentaire `logV2Event` avec la contrainte Phase A. Le wiring
  runtime complet (scheduler, process-checkins, webhook WhatsApp) est maintenant
  operationnel avec suivi via `whatsapp_pending_actions` et gestion explicite du
  refus + cooldown. Le critere `mission_preparation` est reporte tant que le
  runtime n'expose pas d'echeance fiable pour les plan items mission.
- **Phase C.2 (V2.1):** integration runtime finalisee. Le scheduler
  `schedule-whatsapp-v2-checkins` consomme maintenant le proactive
  windows engine via `resolveRendezVousDecisionForRuntime` et arbitre entre
  creation d'un `scheduled_checkins` morning nudge et creation d'un
  `user_rendez_vous` reel. `process-checkins` delivre les rendez-vous
  `scheduled`, transitionne vers `delivered`, et cree un
  `whatsapp_pending_actions(kind='rendez_vous')` pour suivre la reponse
  utilisateur. Le webhook WhatsApp marque ensuite le rendez-vous `completed`
  sur une vraie reponse libre, ou `skipped` + cooldown `refused_rendez_vous`
  sur un refus explicite. L'auto-complete trop large dans `router/run.ts` a ete
  retire. Correction de scope: le critere `mission_preparation` n'est plus actif
  dans cette etape tant que le runtime n'expose pas d'echeance fiable pour les
  plan items mission; les criteres effectivement livres ici sont
  `pre_event_grounding`, `post_friction_repair` et `weekly_reset`.
- **Phase C.3 (V2.1):** prompt LLM + validateur pour le transformation handoff
  formel cree dans `v2-prompts/transformation-handoff.ts`, meme pattern que les
  prompts 6B (conversation-pulse, weekly-recalibrage). Le module exporte le type
  `TransformationHandoffPayload` aligne sur `v2-mvp-scope.md` section 7, des
  input builders purs (transformation snapshot, plan item snapshot, pulse
  summary), un system prompt avec regles strictes par champ (supports_to_keep
  limite aux plan_items de dimension `support`, habits limites a kind=`habit`,
  techniques_that_failed autorise explicitement les `plan_item_id` ET les
  `technique_key` presents dans `coaching_snapshots`, coaching_memory_summary <
  200 tokens), un mode handoff partiel si la transformation est courte (< 14j)
  ou si l'activite reelle est tres faible (< 5 `total_entries` agreges), un
  validateur avec clamping/filtrage par champ, et un JSON parse helper avec
  fallback payload. 27 tests passent. Le wiring downstream est maintenant en
  cours via C.4.
- **Phase C.4 (V2.1):** nouveau module
  `supabase/functions/sophia-brain/transformation_handoff.ts` livre pour
  executer le handoff complet de facon idempotente: chargement DB des entrees
  C.3 (transformation, plan_items + entries, `user_victory_ledger`, historique
  coaching via `memory_observability_events`, metriques cycle/transformation,
  dernier `conversation_pulse`), appel LLM, validation, persistence additive
  dans `user_transformations.handoff_payload.transformation_handoff_v2`, et log
  `transformation_handoff_generated_v2`. Le module derive aussi des artefacts
  consumers (`questionnaire_context`, `pulse_context`, `mini_recap`) et cree le
  rendez-vous `transition_handoff` avec `source_refs` assez riches pour que
  `process-checkins` genere un vrai recap. Wiring downstream livre:
  `generate-questionnaire-v2` backfill le handoff precedent si absent et
  enrichit le contexte questionnaire; `conversation_pulse_builder` lit le
  handoff recent comme contexte de continuite. Le repo ne dispose toutefois pas
  encore d'un point unique de transition `user_transformations.status ->
  completed`, donc le branchement direct "au moment exact de la completion"
  reste ouvert. 4 tests du module handoff + 3 tests du pulse builder passent;
  `deno check` ne remonte que la dette TypeScript preexistante dans
  `_shared/checkin_scope.ts`.
- **Lot D.1:** cache serveur des drafts onboarding V2 implemente. Migration
  `20260325170000_create_user_cycle_drafts.sql` ajoute `user_cycle_drafts`
  (TTL 7 jours, unique `anonymous_session_id`, RLS active sans policy
  `auth.uid()`, trigger `updated_at`). Nouvelle edge function publique
  `cycle-draft` (`verify_jwt = false`) avec `POST /cycle-draft` pour l'upsert,
  `GET /cycle-draft?session_id=...` pour la lecture, et
  `POST /cycle-draft/hydrate` avec auth manuelle pour migrer le draft apres
  signup. Decision d'implementation: si un `draft_payload.cycle_id` appartient
  deja au user, le hydrate re-utilise ce cycle; sinon il rejoue
  `analyze-intake-v2` a partir de `raw_intake_text`. Le frontend
  `onboardingV2.ts` genere/persiste maintenant un `anonymous_session_id`,
  synchronise le draft vers le serveur en best-effort, recharge le draft
  serveur au boot, puis tente l'hydratation post-auth avant de retomber sur le
  flow existant `pending_auth_action`.
- **Lot D.2:** le weekly conversation digest est maintenant branche de bout en
  bout. Nouveau builder `weekly_conversation_digest_builder.ts` avec pattern
  identique a `conversation_pulse_builder`: chargement parallele des messages
  hebdo, daily bilans, event memories et dernier pulse, appel LLM Tier 2,
  validation puis persistence dans `system_runtime_snapshots` en
  `snapshot_type='weekly_digest'`. Le cron `trigger-weekly-bilan` appelle le
  builder avant le weekly bilan, injecte `weekly_digest` dans
  `WeeklyBilanV2Input`, conserve un fallback `null` si le builder echoue, et
  trace `weekly_digest_id` dans les payloads/event logs. Extension downstream
  minimale: le moteur proactif lit le dernier digest disponible et transforme
  une semaine silencieuse (`message_count < 3` et `active_days < 2`) en signal
  de reactivation `open_door`. Review Claude: ajout `snapshot_id` dans
  `WeeklyDigestGeneratedPayload` pour aligner avec le pattern
  `conversation_pulse_generated_v2` (lien direct event → snapshot).
- **Audit global (V2.1):** audit complet du codebase croisant code, playbook et
  context-prompt. Corrections livrees:
  - **P0 — circular deps:** `computeActiveLoad` extrait dans
    `_shared/v2-active-load.ts`, `checkRegistryCooldown` extrait dans
    `_shared/v2-cooldown-registry.ts`. Les modules brain re-exportent pour ne
    casser aucun import existant.
  - **P0 — logV2Event crash:** `logV2Event` wrappe dans try/catch interne,
    `console.warn` par defaut, option `throwOnError` si besoin.
  - **P1 — frontend robustesse:** error handling dans
    `PlanPriorities.handleValidate`, message user-friendly dans `NorthStarV2`,
    affichage items completes dans `DimensionSection`, UI retry
    `questionnaire_setup` dans `OnboardingV2`.
  - **P1 — types dupliques:** `MemoryRetrievalExecutedPayload` et
    `MemoryPersistedPayload` dedupliques via import/re-export depuis `v2-events.ts`.
  - **P2 — hardcoded timezone:** `DEFAULT_TIMEZONE` centralise dans
    `_shared/v2-constants.ts`, propage dans ~10 fichiers.
  - **P2 — v2-mvp-scope.md:** tables V2.1 livrees + dettes resolues marquees.
  - **Playbook:** etapes 4.0 et 4.1 passees de EN COURS a FAIT (etaient deja
    livrees), fichiers audit ajoutes dans le context-prompt.

## Regles

- Ne jamais modifier les tables legacy destructivement
- Ne jamais push sur le remote sans demande explicite
- Ne jamais run `supabase db reset` ou commandes destructives
- Toujours verifier la conformite avec `v2-technical-schema.md`
- Toujours respecter les blocs "Hors scope" et "Legacy neutralise" dans le
  playbook

## Fichiers crees pendant la V2

> Mis a jour a chaque fin de conversation. Tout fichier cree doit apparaitre
> ici.

| Fichier                                                                          | Cree au lot | Role                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/v2-context-prompt.md`                                                      | Lot 0       | Contexte de conversation                                                                                                                                                                                 |
| `docs/v2-execution-playbook.md`                                                  | Pre-V2      | Playbook d'execution                                                                                                                                                                                     |
| `docs/v2-audit-strategy.md`                                                      | Pre-V2      | Strategie d'audit                                                                                                                                                                                        |
| `docs/audit-v2/*.md` (9 squelettes)                                              | Pre-V2      | Guides d'audit                                                                                                                                                                                           |
| `docs/FROZEN_MODULES.md`                                                         | Lot 0.2     | Liste des modules geles pendant la V2                                                                                                                                                                    |
| `docs/V2_MERGE_CHECKLIST.md`                                                     | Lot 0.3     | Checklist pre-merge pour chaque lot V2                                                                                                                                                                   |
| `supabase/migrations/20260323181825_v2_core_schema.sql`                          | Lot 1.1     | Migration SQL du schema DB V2 canonique                                                                                                                                                                  |
| `supabase/functions/_shared/v2-types.ts`                                         | Lot 1.3     | Types TypeScript partages V2 alignes sur le technical-schema                                                                                                                                             |
| `frontend/src/types/v2.ts`                                                       | Lot 1.4     | Miroir frontend des types V2 partages                                                                                                                                                                    |
| `supabase/functions/_shared/v2-runtime.ts`                                       | Lot 2.1     | Helpers runtime backend V2 pour cycle/transformation/plan actifs, plan items runtime et active load                                                                                                      |
| `supabase/functions/_shared/v2-events.ts`                                        | Lot 2.2     | Event contracts V2: 27 types, payloads type-safe, helper logV2Event                                                                                                                                      |
| `supabase/functions/_shared/v2-prompts/structuration.ts`                         | Lot 3.1     | Prompt de structuration V2: extraction d'aspects, regroupements provisoires, "Pour plus tard", incertitudes                                                                                              |
| `supabase/functions/_shared/v2-prompts/cristallisation.ts`                       | Lot 3.1     | Prompt de cristallisation V2: transformations formelles (titre, syntheses, questionnaire_context, ordre)                                                                                                 |
| `supabase/functions/_shared/v2-prompts/plan-generation.ts`                       | Lot 3.2     | Prompt de generation de plan V2 + validateur `validatePlanOutput`                                                                                                                                        |
| `supabase/functions/_shared/v2-plan-distribution.ts`                             | Lot 3.3     | Distribution de `PlanContentV2` vers `user_plan_items`, resolution des dependances, creation North Star, event lifecycle                                                                                 |
| `supabase/functions/_shared/v2-plan-distribution_test.ts`                        | Lot 3.3     | Fixture locale pour verifier le mapping `temp_id -> UUID`, la resolution des dependances et la normalisation des rows distribuees                                                                        |
| `supabase/functions/generate-plan-v2/index.ts`                                   | Lot 3.4     | Edge function V2 de generation de plan: auth, chargement du contexte, appel LLM, validation JSON, persistence snapshot, distribution et activation                                                       |
| `supabase/functions/generate-plan-v2/index_test.ts`                              | Lot 3.4     | Tests locaux des helpers du handler `generate-plan-v2` avec fixture `PlanContentV2`                                                                                                                      |
| `supabase/migrations/20260323190400_extend_snapshot_type_for_v2_events.sql`      | Lot 3 (fix) | Migration additive pour etendre le CHECK constraint `snapshot_type` a tous les event types V2                                                                                                            |
| `docs/audit-v2/plan-generation-v2-audit-guide.md`                                | Lot 3.5     | Guide d'audit complet pour la chaine de generation de plan V2                                                                                                                                            |
| `scripts/export_plan_generation_audit_bundle.mjs`                                | Lot 3.5     | Script d'export du bundle d'audit plan generation V2                                                                                                                                                     |
| `docs/v2-onboarding-ux-specs.md`                                                 | Lot 4.0     | Specs UX onboarding V2 : ecrans, micro-copy, interactions, transitions (Gemini + review Claude)                                                                                                          |
| `docs/v2-dashboard-ux-specs.md`                                                  | Lot 5.0     | Specs UX dashboard V2 : layout, dimensions, micro-copy, interactions                                                                                                                                     |
| `supabase/migrations/20260324103000_add_validated_structure_to_user_cycles.sql`  | Lot 4.1     | Migration additive pour persister le snapshot onboarding cycle-level dans `user_cycles.validated_structure`                                                                                              |
| `supabase/functions/_shared/v2-prompts/questionnaire.ts`                         | Lot 4.1     | Prompt du questionnaire sur mesure V2 + types du schema retourne                                                                                                                                         |
| `supabase/functions/analyze-intake-v2/index.ts`                                  | Lot 4.1     | Edge function V2 de structuration onboarding: auth, cycle draft, LLM structuration, persistence des aspects et transition vers `structured` / `clarification_needed`                                     |
| `supabase/functions/crystallize-v2/index.ts`                                     | Lot 4.1     | Edge function V2 de cristallisation: validation des regroupements, creation des transformations, association des aspects et transition vers `prioritized`                                                |
| `supabase/functions/generate-questionnaire-v2/index.ts`                          | Lot 4.1     | Edge function V2 de generation du questionnaire sur mesure et passage du cycle en `questionnaire_in_progress`                                                                                            |
| `frontend/src/lib/onboardingV2.ts`                                               | Lot 4.2     | Types UI + persistance localStorage du brouillon onboarding V2                                                                                                                                           |
| `frontend/src/components/onboarding-v2/FreeTextCapture.tsx`                      | Lot 4.2     | Ecran de capture libre onboarding V2                                                                                                                                                                     |
| `frontend/src/components/onboarding-v2/AspectValidation.tsx`                     | Lot 4.2     | Ecran de validation / deplacement des aspects et zone "Pour plus tard"                                                                                                                                   |
| `frontend/src/components/onboarding-v2/CustomQuestionnaire.tsx`                  | Lot 4.2     | Questionnaire one-question-per-screen, questions dynamiques V2                                                                                                                                           |
| `frontend/src/components/onboarding-v2/MinimalProfile.tsx`                       | Lot 4.2     | Profil minimal V2: birth_date, gender, duration_months                                                                                                                                                   |
| `frontend/src/pages/OnboardingV2.tsx`                                            | Lot 4.2     | Orchestrateur frontend du flow onboarding V2                                                                                                                                                             |
| `frontend/src/pages/DashboardV2.tsx`                                             | Lot 5.1     | Nouvelle page dashboard V2 branchee sur `/dashboard`, avec layout mobile-first et sections par dimension                                                                                                 |
| `frontend/src/hooks/useDashboardV2Data.ts`                                       | Lot 5.1     | Chargement runtime V2 actif: cycle, transformation, plan, plan_items, entries et metrics                                                                                                                 |
| `frontend/src/hooks/useDashboardV2Logic.ts`                                      | Lot 5.1     | Logique d'execution dashboard V2: regroupements par dimension, debloquages et mutations `plan_items` / `plan_item_entries`                                                                               |
| `frontend/src/components/dashboard-v2/DimensionSection.tsx`                      | Lot 5.1     | Section V2 par dimension (support, missions, habits)                                                                                                                                                     |
| `frontend/src/components/dashboard-v2/PlanItemCard.tsx`                          | Lot 5.1     | Carte d'item V2 avec statuts, progression et actions                                                                                                                                                     |
| `frontend/src/components/dashboard-v2/StrategyHeader.tsx`                        | Lot 5.1     | Header V2 de transformation et bloc strategie                                                                                                                                                            |
| `frontend/src/components/dashboard-v2/NorthStarV2.tsx`                           | Lot 5.1     | Bloc North Star V2 branche sur `user_metrics` + progress markers                                                                                                                                         |
| `frontend/src/components/dashboard-v2/UnlockPreview.tsx`                         | Lot 5.1     | Carte d'anticipation pour le prochain item debloquable                                                                                                                                                   |
| `frontend/src/components/dashboard-v2/HabitMaintenanceStrip.tsx`                 | Lot 5.1     | Accordeon des habitudes en maintien                                                                                                                                                                      |
| `docs/audit-v2/plan-execution-v2-audit-guide.md`                                 | Lot 5.2     | Guide d'audit complet pour le lifecycle des plan_items V2                                                                                                                                                |
| `scripts/export_plan_execution_audit_bundle.mjs`                                 | Lot 5.2     | Script d'export du bundle d'audit plan execution V2                                                                                                                                                      |
| `supabase/functions/sophia-brain/active_load_engine.ts`                          | Lot 6A.1    | Moteur pur de calcul de charge active V2 a partir des plan_items et de la traction recente                                                                                                               |
| `supabase/functions/sophia-brain/active_load_engine_test.ts`                     | Lot 6A.1    | Tests unitaires du moteur active_load sur 5 scenarios fixtures                                                                                                                                           |
| `supabase/functions/sophia-brain/momentum_state_v2_test.ts`                      | Lot 6A.2    | Tests V2 momentum: 6 etats publics, lazy migration V1→V2, posture override                                                                                                                               |
| `docs/audit-v2/momentum-v2-audit-guide.md`                                       | Lot 6A.3    | Guide d'audit complet momentum V2: 6 dimensions, distinction friction/plan, active_load, posture, checklist, patterns, tuning                                                                            |
| `scripts/export_momentum_v2_audit_bundle.mjs`                                    | Lot 6A.3    | Script d'export du bundle d'audit momentum V2 (pattern REST API direct, scorecard locale, alertes automatiques)                                                                                          |
| `supabase/functions/trigger-daily-bilan/v2_daily_bilan.ts`                       | Lot 6B.1    | Implementation V2 du daily bilan: mode selection, items ciblage, generation de questions, capture d'entries                                                                                              |
| `supabase/functions/trigger-daily-bilan/v2_daily_bilan_test.ts`                  | Lot 6B.1    | Tests du daily bilan V2                                                                                                                                                                                  |
| `supabase/functions/_shared/v2-prompts/weekly-recalibrage.ts`                    | Lot 6B.2a   | Prompt LLM + input builder pour le weekly bilan V2 (hold/expand/consolidate/reduce)                                                                                                                      |
| `supabase/functions/_shared/v2-weekly-bilan-engine.ts`                           | Lot 6B.2a   | Validateur + materialiseur du weekly bilan V2 (max 3 ajustements, invariants metier)                                                                                                                     |
| `supabase/functions/_shared/v2-weekly-bilan-engine_test.ts`                      | Lot 6B.2a   | Tests du validateur et materialiseur weekly bilan V2                                                                                                                                                     |
| `supabase/functions/trigger-weekly-bilan/v2_weekly_bilan.ts`                     | Lot 6B.2b   | Implementation V2 du weekly bilan: appel LLM, validation, materialisation, events                                                                                                                        |
| `supabase/functions/trigger-weekly-bilan/v2_weekly_bilan_test.ts`                | Lot 6B.2b   | Tests du weekly bilan V2                                                                                                                                                                                 |
| `supabase/functions/_shared/v2-prompts/conversation-pulse.ts`                    | Lot 6B.3a   | Prompt LLM + validateur ConversationPulse V2 (tone, trajectory, highlights, likely_need)                                                                                                                 |
| `supabase/functions/_shared/v2-prompts/conversation-pulse_test.ts`               | Lot 6B.3a   | Tests du prompt et validateur ConversationPulse                                                                                                                                                          |
| `supabase/functions/sophia-brain/conversation_pulse_builder.ts`                  | Lot 6B.3b   | Builder ConversationPulse: chargement parallele, appel LLM, cache 12h, persistence snapshot                                                                                                              |
| `supabase/functions/sophia-brain/conversation_pulse_builder_test.ts`             | Lot 6B.3b   | Tests du builder ConversationPulse avec bundles conversationnels reels                                                                                                                                   |
| `supabase/functions/_shared/v2-memory-retrieval.ts`                              | Lot 6B.4a   | Architecture memoire V2: 5 contrats par intention, scope classifier, plan resolver, event builders                                                                                                       |
| `supabase/functions/_shared/v2-memory-retrieval_test.ts`                         | Lot 6B.4a   | Tests des contrats, scope classifier et plan resolver memoire V2 (26 tests)                                                                                                                              |
| `supabase/functions/sophia-brain/context/memory_plan_loader_test.ts`             | Lot 6B.4b   | Tests du wiring V2 dans le loader: 5 intents, backward compat, dispatcher capping                                                                                                                        |
| `supabase/migrations/20260324113000_add_v2_scope_to_user_global_memories.sql`    | Lot 6B.4    | Migration additive: colonnes scope, cycle_id, transformation_id sur user_global_memories                                                                                                                 |
| `supabase/migrations/20260324124500_scope_unique_user_global_memories.sql`       | Lot 6B.4b   | Migration: partial unique indexes par scope sur user_global_memories                                                                                                                                     |
| `docs/audit-v2/memory-v2-audit-guide.md`                                         | Lot 6B.5    | Guide d'audit memoire V2 complet (6 couches, retrieval par intention, tagging scope, budget tokens)                                                                                                      |
| `docs/audit-v2/daily-weekly-v2-audit-guide.md`                                   | Lot 6B.5    | Guide d'audit bilans V2 complet (modes daily, decisions weekly, materialisation, correlation)                                                                                                            |
| `docs/audit-v2/conversation-pulse-v2-audit-guide.md`                             | Lot 6B.5    | Guide d'audit ConversationPulse V2 complet (generation, freshness, downstream, coherence)                                                                                                                |
| `scripts/export_memory_v2_audit_bundle.mjs`                                      | Lot 6B.5    | Script d'export bundle audit memoire V2 (retrieval events, persistence events, scope tagging)                                                                                                            |
| `scripts/export_bilans_v2_audit_bundle.mjs`                                      | Lot 6B.5    | Script d'export bundle audit bilans V2 (daily decisions/outcomes, weekly decisions/materializations)                                                                                                     |
| `scripts/export_conversation_pulse_v2_audit_bundle.mjs`                          | Lot 6B.5    | Script d'export bundle audit ConversationPulse V2 (generations, downstream usage, freshness)                                                                                                             |
| `scripts/export_coaching_v2_audit_bundle.mjs`                                    | Lot 6C.3    | Script d'export bundle audit coaching V2, branche sur les endpoints canoniques `get-coaching-intervention-trace` / `get-coaching-intervention-scorecard` et enrichi avec snapshots momentum + plan_items |
| `scripts/export_proactive_v2_audit_bundle.mjs`                                   | Lot 6C.3    | Script d'export bundle audit proactive V2, branche sur `get-momentum-trace` / `get-momentum-scorecard` et les `scheduled_checkins` reels (`morning_nudge_v2`)                                            |
| `docs/audit-v2/legacy-cleanup-audit-report.md`                                   | Lot 8.1     | Rapport d'audit exhaustif des dependances legacy residuelles (26 sections, plan de suppression par batch)                                                                                                |
| `docs/lot8-v1-full-cleanup-manifest.md`                                          | Lot 8.3     | Manifeste de suppression totale V1 (6 batches, zero coexistence, ~80 fichiers concernes)                                                                                                                 |
| `docs/audit-v2/llm-cost-v2-audit-guide.md`                                       | Lot 8.4     | Guide d'audit LLM cost V2 complet: inventaire appels par tier, mapping operation_family→tier, freshness windows, detection redondance/derive, 9 alertes                                                  |
| `scripts/export_llm_cost_audit_bundle.mjs`                                       | Lot 8.4     | Script d'export bundle audit LLM cost V2 (--user-id / --all-users, trace + scorecard, detection redondance et derive)                                                                                    |
| `supabase/functions/sophia-brain/cooldown_engine.ts`                             | Phase A     | Moteur de cooldown configurable V2.1: 5 types, approche hybride (derive + registre), fallback postures adjacentes                                                                                        |
| `supabase/functions/sophia-brain/cooldown_engine_test.ts`                        | Phase A     | 17 tests du cooldown engine (posture, item, reactivation, validation composite, durations)                                                                                                               |
| `supabase/functions/sophia-brain/proactive_windows_engine.ts`                    | Phase A     | Moteur de decision proactive V2.1: pipeline 8 etapes, 5 window kinds, 6 dominant needs, budget §7.1                                                                                                      |
| `supabase/functions/sophia-brain/proactive_windows_engine_test.ts`               | Phase A     | 34 tests du proactive windows engine (locks, budget, confidence, needs, windows, postures, min_gap, payload contract, full eval)                                                                         |
| `supabase/migrations/20260325100000_extend_snapshot_type_for_cooldown_entry.sql` | Phase A     | Migration additive: ajout `cooldown_entry` et realignement du CHECK constraint `system_runtime_snapshots.snapshot_type` avec les events runtime V2 manquants                                             |
| `supabase/migrations/20260325113000_create_user_relation_preferences.sql`        | Phase B     | Migration additive: creation de `user_relation_preferences` + RLS                                                                                                                                        |
| `supabase/functions/sophia-brain/relation_preferences_engine.ts`                 | Phase B     | Moteur d'inference progressive des preferences relationnelles + helpers runtime                                                                                                                          |
| `supabase/functions/sophia-brain/relation_preferences_engine_test.ts`            | Phase B     | Tests unitaires du moteur relation preferences (fenetres, ton, longueur, intensite)                                                                                                                      |
| `supabase/migrations/20260325143000_create_user_rendez_vous.sql`                 | Phase C.1   | Migration additive: creation de `user_rendez_vous` avec RLS, indexes runtime et trigger `updated_at`                                                                                                     |
| `supabase/functions/_shared/v2-rendez-vous.ts`                                   | Phase C.1   | CRUD partage des rendez-vous V2: creation, transitions validees, lecture active et historique, guardrails d'invariants/cooldown                                                                          |
| `supabase/functions/_shared/v2-rendez-vous_test.ts`                              | Phase C.1   | Tests unitaires des invariants et transitions du helper rendez-vous                                                                                                                                      |
| `supabase/functions/sophia-brain/rendez_vous_decision.ts`                        | Phase C.2   | Couche de decision runtime au-dessus du proactive engine: chargement du contexte utile, arbitrage nudge simple vs rendez-vous et wiring du scheduler morning                                           |
| `supabase/functions/sophia-brain/rendez_vous_decision_test.ts`                   | Phase C.2   | Tests unitaires de la logique pure de selection des rendez-vous                                                                                                                                            |
| `supabase/migrations/20260325153000_extend_whatsapp_pending_actions_for_rendez_vous.sql` | Phase C.2   | Migration additive: extension du CHECK `whatsapp_pending_actions.kind` pour suivre les reponses explicites aux rendez-vous                                                                               |
| `supabase/functions/_shared/v2-prompts/transformation-handoff.ts`                        | Phase C.3   | Prompt LLM + input builders + validateur pour le transformation handoff formel (meme pattern que conversation-pulse et weekly-recalibrage)                                                                |
| `supabase/functions/_shared/v2-prompts/transformation-handoff_test.ts`                   | Phase C.3   | 27 tests unitaires du prompt handoff: snapshot builders, validateur, LLM parser, user prompt builder et regressions metier sur supports/handoff partiel                                                  |
| `supabase/functions/sophia-brain/transformation_handoff.ts`                      | Phase C.4   | Execution idempotente du transformation handoff: chargement du contexte, appel LLM, validation, persistence additive, artefacts downstream et creation du rendez-vous `transition_handoff`             |
| `supabase/functions/sophia-brain/transformation_handoff_test.ts`                 | Phase C.4   | 4 tests unitaires des helpers C.4: contexte questionnaire, mini recap, mapping coaching trace -> handoff et extracteurs du payload stocke                                                               |
| `supabase/migrations/20260325170000_create_user_cycle_drafts.sql`               | Phase D.1   | Migration additive pour creer `user_cycle_drafts` (TTL 7 jours, unique `anonymous_session_id`, RLS service-role-only, trigger `updated_at`)                                                            |
| `supabase/functions/cycle-draft/index.ts`                                       | Phase D.1   | Edge function publique de cache draft onboarding V2: upsert, lecture par session et hydratation post-auth vers `user_cycles`                                                                            |
| `supabase/functions/cycle-draft/index_test.ts`                                  | Phase D.1   | Tests unitaires des helpers de statut / normalisation / strategie d'hydratation du draft onboarding V2                                                                                                   |
| `supabase/functions/cycle-draft/config.toml`                                    | Phase D.1   | Config locale Supabase pour exposer `cycle-draft` sans JWT automatique et gerer manuellement l'endpoint `/hydrate`                                                                                      |
| `supabase/functions/_shared/v2-prompts/weekly-conversation-digest.ts`           | Phase D.2a  | Prompt LLM + user prompt builder + validateur du weekly conversation digest: type input, system prompt, clamping, coherence confidence, fallback digest minimal                                          |
| `supabase/functions/_shared/v2-prompts/weekly-conversation-digest_test.ts`      | Phase D.2a  | 12 tests unitaires: prompt builder, validation output valide/invalide, clamping, semaine silencieuse, coherence confidence, JSON parse, normalisation strings vides                                      |
| `supabase/functions/sophia-brain/weekly_conversation_digest_builder.ts`         | Phase D.2b  | Builder hebdomadaire idempotent du digest conversationnel: loaders paralleles, cache par `week_start`, appel LLM, validation, snapshot `weekly_digest` et event `weekly_digest_generated_v2`            |
| `supabase/functions/sophia-brain/weekly_conversation_digest_builder_test.ts`    | Phase D.2b  | Tests unitaires du builder weekly digest: comptage `message_count` / `active_days`, deduplication du contexte injecte et prompt assemble                                                                 |
| `supabase/migrations/20260325183000_extend_snapshot_type_for_weekly_digest_generated.sql` | Phase D.2c  | Migration additive alignant le CHECK `system_runtime_snapshots.snapshot_type` avec le nouvel event runtime `weekly_digest_generated_v2`                                                                  |
| `supabase/functions/_shared/v2-active-load.ts`                                  | Audit       | Fonction pure `computeActiveLoad` extraite depuis `sophia-brain/active_load_engine.ts` pour eliminer la dependance circulaire `_shared` → `sophia-brain`                                                |
| `supabase/functions/_shared/v2-cooldown-registry.ts`                            | Audit       | Fonction `checkRegistryCooldown` + types extraits depuis `sophia-brain/cooldown_engine.ts` pour eliminer la dependance circulaire `_shared` → `sophia-brain`                                            |
| `supabase/functions/_shared/v2-constants.ts`                                    | Audit       | Constantes partagees V2 (`DEFAULT_TIMEZONE`), centralise les valeurs dupliquees dans ~20 fichiers                                                                                                        |

## Rituel de fin de conversation

**OBLIGATOIRE avant de fermer.** Copier-coller ce bloc tel quel:

```
Avant de finir cette conversation, execute le rituel de cloture complet:

## 1. MISE A JOUR DU SUIVI (`docs/v2-context-prompt.md`)

- Mets a jour le statut de chaque lot/etape: [FAIT], [EN COURS], [A FAIRE]
- Ajoute dans "Decisions prises en cours de route" toute decision importante,
  ecart par rapport au plan, ou probleme resolu pendant cette conversation
- Si un nouveau fichier .md ou .ts a ete cree:
  l'ajouter dans la table "Fichiers crees pendant la V2"
- Si une decision canonique a change (ex: nouveau nom de table, nouveau contrat),
  mettre a jour la section "Decisions canoniques a respecter"

## 2. MISE A JOUR DU PLAYBOOK (`docs/v2-execution-playbook.md`)

- Marque les etapes terminees avec **Statut: FAIT**
- Si une etape a ete modifiee ou a diverge du plan initial,
  mets a jour le contenu de l'etape dans le playbook

## 3. PROPAGATION DES CHANGEMENTS (le plus important)

Reponds a ces questions. Si la reponse est "oui", fais la mise a jour:

- Un nouveau fichier a ete cree?
  → Verifier qu'il est reference dans les headers des docs qui en ont besoin
  → Verifier qu'il est mentionne dans les bonnes etapes du playbook
  → L'ajouter dans v2-context-prompt.md table "Fichiers crees"

- Un type, enum, ou table a change?
  → Verifier que v2-technical-schema.md est a jour (source de verite)
  → Verifier que les docs qui le referencent ne sont pas desalignees

- Une decision de contrat a change (source de verite, naming, scope)?
  → Propager dans: technical-schema, orchestration-rules, onboarding-canonique,
    mvp-scope, et context-prompt selon ce qui est impacte

- Du legacy a ete neutralise?
  → Verifier que le playbook le documente dans "Legacy neutralise par ce lot"
  → Verifier que FROZEN_MODULES.md est a jour (si il existe)

- Un guide d'audit a ete complete ou modifie?
  → Verifier que v2-audit-strategy.md reference bien le guide
  → Verifier que le planning dans audit-strategy est a jour

## 4. CHECK DE COHERENCE RAPIDE

Lis les sections modifiees et verifie en 30 secondes:
- Pas de reference a un ancien nom (unlock_rule, user_plans sans _v2, current_phase)
- Pas de type duplique entre docs (tout vit dans technical-schema)
- Pas de fichier orphelin (cree mais pas reference nulle part)
- Les numeros de section dans les renvois sont encore corrects

## 5. RESUME DE FIN

Ecris un court resume (5-10 lignes) de ce qui a ete fait, ce qui reste,
et s'il y a des points d'attention pour la conversation suivante.
```
