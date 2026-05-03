# Modules geles — Refonte V2

> Ces fichiers ne doivent PAS etre modifies pendant la refonte V2, sauf bugfix
> critique approuve explicitement. Derniere mise a jour: 2026-03-23

> **Convention:** les fichiers de test (`_test.ts`, `.test.ts`, `.int.test.ts`)
> associes a un module gele sont egalement geles. Ils ne sont pas listes
> individuellement pour garder ce document lisible.

---

## Backend — Brain modules geles (section 29.1 Keep)

Ces modules sont explicitement marques "keep presque tel quel" dans la
cartographie.

- `supabase/functions/sophia-brain/momentum_policy.ts` — politique momentum
  stable
- `supabase/functions/sophia-brain/coaching_interventions.ts` — catalogue
  d'interventions coaching
- `supabase/functions/sophia-brain/coaching_intervention_tracking.ts` — tracking
  des interventions
- `supabase/functions/sophia-brain/coaching_intervention_observability.ts` —
  observabilite coaching
- `supabase/functions/sophia-brain/event_memory.ts` — memoire evenementielle
- `supabase/functions/sophia-brain/topic_memory.ts` — memoire thematique
- `supabase/functions/sophia-brain/global_memory.ts` — memoire globale
  (compaction)
- `supabase/functions/sophia-brain/architect_memory.ts` — memoire architecte
  identitaire

## Backend — Brain modules geles (hors cartographie)

Modules brain stables, non cibles par la refonte V2.

- `supabase/functions/sophia-brain/index.ts` — point d'entree du brain
- `supabase/functions/sophia-brain/router.ts` — routeur principal
- `supabase/functions/sophia-brain/supervisor.ts` — superviseur de conversation
- `supabase/functions/sophia-brain/chat_text.ts` — utilitaires texte chat
- `supabase/functions/sophia-brain/coaching_intervention_selector.ts` —
  selecteur d'interventions
- `supabase/functions/sophia-brain/memory_provenance.ts` — provenance memoire
- `supabase/functions/sophia-brain/profile_facts.ts` — faits profil utilisateur
- `supabase/functions/sophia-brain/surface_registry.ts` — registre de surfaces
- `supabase/functions/sophia-brain/surface_state.ts` — etat des surfaces
- `supabase/functions/sophia-brain/time.ts` — utilitaires temporels
- `supabase/functions/sophia-brain/tool_ack.ts` — acquittement outils

### Agents geles

- `supabase/functions/sophia-brain/agents/companion.ts` — agent compagnon
- `supabase/functions/sophia-brain/agents/investigator.ts` — agent investigateur
  (dispatcher)
- `supabase/functions/sophia-brain/agents/sentry.ts` — agent sentinelle
- `supabase/functions/sophia-brain/agents/synthesizer.ts` — agent synthetiseur
- `supabase/functions/sophia-brain/agents/watcher.ts` — agent veilleur

### Investigateur daily (tout le dossier)

- `supabase/functions/sophia-brain/agents/investigator/checkup_stats.ts`
- `supabase/functions/sophia-brain/agents/investigator/copy.ts`
- `supabase/functions/sophia-brain/agents/investigator/db.ts`
- `supabase/functions/sophia-brain/agents/investigator/global_state.ts`
- `supabase/functions/sophia-brain/agents/investigator/item_progress.ts`
- `supabase/functions/sophia-brain/agents/investigator/missed_reason.ts`
- `supabase/functions/sophia-brain/agents/investigator/opening_decider.ts`
- `supabase/functions/sophia-brain/agents/investigator/opening_response_classifier.ts`
- `supabase/functions/sophia-brain/agents/investigator/prompt.ts`
- `supabase/functions/sophia-brain/agents/investigator/run.ts`
- `supabase/functions/sophia-brain/agents/investigator/streaks.ts`
- `supabase/functions/sophia-brain/agents/investigator/tools.ts`
- `supabase/functions/sophia-brain/agents/investigator/turn.ts`
- `supabase/functions/sophia-brain/agents/investigator/types.ts`
- `supabase/functions/sophia-brain/agents/investigator/utils.ts`

### Investigateur weekly — fichiers geles (hors refactor)

- `supabase/functions/sophia-brain/agents/investigator-weekly/consent_classifier.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/copy.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/db.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/turn.ts`

### Context (tout le dossier)

- `supabase/functions/sophia-brain/context/index.ts`
- `supabase/functions/sophia-brain/context/loader.ts`
- `supabase/functions/sophia-brain/context/types.ts`

### Knowledge

- `supabase/functions/sophia-brain/knowledge/frontend-site-map.ts`

### Lib (tout le dossier)

- `supabase/functions/sophia-brain/lib/coaching_intervention_scorecard.ts`
- `supabase/functions/sophia-brain/lib/coaching_intervention_trace.ts`
- `supabase/functions/sophia-brain/lib/ethical_text_validator.ts`
- `supabase/functions/sophia-brain/lib/memory_scorecard.ts`
- `supabase/functions/sophia-brain/lib/memory_trace.ts`
- `supabase/functions/sophia-brain/lib/momentum_scorecard.ts`
- `supabase/functions/sophia-brain/lib/momentum_trace.ts`
- `supabase/functions/sophia-brain/lib/north_star_tools.ts`
- `supabase/functions/sophia-brain/lib/one_shot_reminder_tool.ts`
- `supabase/functions/sophia-brain/lib/tool_ledger.ts`
- `supabase/functions/sophia-brain/lib/tracking.ts`
- `supabase/functions/sophia-brain/lib/verifier_eval_log.ts`

### Router — fichiers geles (hors refactor)

- `supabase/functions/sophia-brain/router/agent_exec.ts`
- `supabase/functions/sophia-brain/router/debounce.ts`
- `supabase/functions/sophia-brain/router/dispatcher_flow.ts`
- `supabase/functions/sophia-brain/router/emergency.ts`
- `supabase/functions/sophia-brain/router/flow_context.ts`
- `supabase/functions/sophia-brain/router/magic_reset.ts`
- `supabase/functions/sophia-brain/router/routing_decision.ts`
- `supabase/functions/sophia-brain/router/signal_history.ts`
- `supabase/functions/sophia-brain/router/turn_summary_writer.ts`

## Backend — Edge Functions gelees

Fonctions edge standalone non ciblees par la refonte.

### Billing & Stripe

- `supabase/functions/stripe-change-plan/index.ts`
- `supabase/functions/stripe-create-checkout-session/index.ts`
- `supabase/functions/stripe-create-portal-session/index.ts`
- `supabase/functions/stripe-sync-subscription/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

### WhatsApp

- `supabase/functions/whatsapp-optin/index.ts`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/functions/process-whatsapp-optin-recovery/index.ts`
- `supabase/functions/process-whatsapp-outbound-retries/index.ts`
- `supabase/functions/whatsapp-webhook/` — tout le dossier (21 fichiers)

### Plan & Actions (legacy V1)

- `supabase/functions/archive-plan/index.ts`

### Memoire & Observabilite

- `supabase/functions/trigger-global-memory-compaction/index.ts`
- `supabase/functions/trigger-memorizer-daily/index.ts`
- `supabase/functions/process-plan-topic-memory/index.ts`
- `supabase/functions/create-module-memory/index.ts`
- `supabase/functions/get-coaching-intervention-scorecard/index.ts`
- `supabase/functions/get-coaching-intervention-trace/index.ts`
- `supabase/functions/get-memory-scorecard/index.ts`
- `supabase/functions/get-memory-trace/index.ts`
- `supabase/functions/get-momentum-scorecard/index.ts`
- `supabase/functions/get-momentum-trace/index.ts`
- `supabase/functions/upsert-memory-eval-annotation/index.ts`

### Scheduling & Proactive

- `supabase/functions/schedule-whatsapp-v2-checkins/index.ts`
- `supabase/functions/trigger-synthesizer-batch/index.ts`
- `supabase/functions/trigger-watcher-batch/index.ts`
- `supabase/functions/classify-recurring-reminder/index.ts`

### Modules & Feedback

- `supabase/functions/complete-module/index.ts`
- `supabase/functions/detect-future-events/index.ts`

### Identite & Profil

- `supabase/functions/update-core-identity/index.ts`
- `supabase/functions/notify-profile-change/index.ts`

### Email & Retention

- `supabase/functions/send-welcome-email/index.ts`
- `supabase/functions/trigger-retention-emails/index.ts`

### Eval & LLM infra

- `supabase/functions/eval-judge/index.ts`
- `supabase/functions/process-eval-judge-jobs/index.ts`
- `supabase/functions/process-llm-retry-jobs/index.ts`
- `supabase/functions/ethical-text-validator/index.ts`

### Autres

- `supabase/functions/sophia-brain-internal/index.ts`
- `supabase/functions/test-env/index.ts`

## Backend — Shared utilities gelees

- `supabase/functions/_shared/cors.ts` — CORS config
- `supabase/functions/_shared/http.ts` — utilitaires HTTP
- `supabase/functions/_shared/error-log.ts` — logging d'erreurs
- `supabase/functions/_shared/internal-auth.ts` — auth interne inter-functions
- `supabase/functions/_shared/request_context.ts` — contexte de requete
- `supabase/functions/_shared/locale.ts` — localisation
- `supabase/functions/_shared/retry429.ts` — retry sur rate-limit
- `supabase/functions/_shared/llm.ts` — client LLM principal
- `supabase/functions/_shared/gemini.ts` — client Gemini
- `supabase/functions/_shared/llm-usage.ts` — tracking usage LLM
- `supabase/functions/_shared/brain-trace.ts` — tracing brain
- `supabase/functions/_shared/coaching-observability.ts` — observabilite
  coaching
- `supabase/functions/_shared/memory-observability.ts` — observabilite memoire
- `supabase/functions/_shared/momentum-observability.ts` — observabilite
  momentum
- `supabase/functions/_shared/common-validators.ts` — validateurs communs
- `supabase/functions/_shared/billing-tier.ts` — tiers de facturation
- `supabase/functions/_shared/stripe.ts` — client Stripe
- `supabase/functions/_shared/whatsapp_graph.ts` — API WhatsApp
- `supabase/functions/_shared/whatsapp_outbound_tracking.ts` — tracking WhatsApp
  sortant
- `supabase/functions/_shared/whatsapp_winback.ts` — winback WhatsApp
- `supabase/functions/_shared/access_ended_whatsapp.ts` — message fin d'acces
- `supabase/functions/_shared/checkin_scope.ts` — scope des check-ins
- `supabase/functions/_shared/scheduled_checkins.ts` — check-ins programmes
- `supabase/functions/_shared/proactive_template_queue.ts` — queue templates
  proactifs
- `supabase/functions/_shared/user_time_context.ts` — contexte temporel
  utilisateur
- `supabase/functions/_shared/identity-manager.ts` — gestionnaire d'identite
- `supabase/functions/_shared/resend.ts` — client email Resend
- `supabase/functions/_shared/weeksContent.ts` — contenu des semaines
- `supabase/functions/config.ts` — configuration globale

## Frontend — Pages gelees

- `frontend/src/pages/Account.tsx` — page compte/parametres
- `frontend/src/pages/AdminDashboard.tsx` — dashboard admin
- `frontend/src/pages/AdminProductionLog.tsx` — logs production admin
- `frontend/src/pages/AdminUsageDashboard.tsx` — usage admin
- `frontend/src/pages/Auth.tsx` — page authentification
- `frontend/src/pages/ChatPage.tsx` — page chat
- `frontend/src/pages/EmailVerified.tsx` — confirmation email
- `frontend/src/pages/Formules.tsx` — page pricing
- `frontend/src/pages/FrameworkExecution.tsx` — execution framework V1
- `frontend/src/pages/Grimoire.tsx` — grimoire utilisateur
- `frontend/src/pages/IdentityArchitect.tsx` — architecte identitaire
- `frontend/src/pages/IdentityEvolution.tsx` — evolution identitaire
- `frontend/src/pages/InstallAppGuide.tsx` — guide installation PWA
- `frontend/src/pages/LandingPage.tsx` — page d'accueil
- `frontend/src/pages/Legal.tsx` — mentions legales
- `frontend/src/pages/ModulesPage.tsx` — page modules V1
- `frontend/src/pages/PlanPriorities.tsx` — priorisation transformations V2
- `frontend/src/pages/ProductArchitect.tsx` — architecte produit
- `frontend/src/pages/ProductPlan.tsx` — plan produit V1
- `frontend/src/pages/ResetPassword.tsx` — reinitialisation mot de passe
- `frontend/src/pages/UpgradePlan.tsx` — page upgrade
- `frontend/src/pages/WeeklyAlignment.tsx` — alignement hebdomadaire V1

## Frontend — Components geles

### Components racine

- `frontend/src/components/ChatInterface.tsx` — interface chat
- `frontend/src/components/Footer.tsx` — footer
- `frontend/src/components/FrameworkHistoryModal.tsx` — historique frameworks
- `frontend/src/components/SEO.tsx` — meta SEO
- `frontend/src/components/UserProfile.tsx` — profil utilisateur
- `frontend/src/components/YinYangLoader.tsx` — loader anime

### Components architect

- `frontend/src/components/architect/QuotesTab.tsx`
- `frontend/src/components/architect/ReflectionsTab.tsx`
- `frontend/src/components/architect/StoriesTab.tsx`
- `frontend/src/components/architect/WishlistTab.tsx`
- `frontend/src/components/architect/quotesUtils.ts`

### Components common

### Components dashboard (hors refactor)

## Frontend — Hooks geles

- `frontend/src/hooks/useAppInstall.ts` — installation PWA
- `frontend/src/hooks/useArchitectData.ts` — donnees architecte
- `frontend/src/hooks/useArchitectLogic.ts` — logique architecte
- `frontend/src/hooks/useChat.ts` — logique chat
- `frontend/src/hooks/useEvolutionData.tsx` — donnees evolution
- `frontend/src/hooks/useEvolutionLogic.ts` — logique evolution
- `frontend/src/hooks/useModules.ts` — modules V1

## Frontend — Lib gelees

- `frontend/src/lib/entitlements.ts` — droits/entitlements
- `frontend/src/lib/ethicalValidation.ts` — validation ethique
- `frontend/src/lib/grimoire.ts` — utilitaires grimoire
- `frontend/src/lib/isoWeek.ts` — semaines ISO
- `frontend/src/lib/localization.ts` — localisation frontend
- `frontend/src/lib/requestId.ts` — generation request ID
- `frontend/src/lib/supabase.ts` — client Supabase

## Frontend — Types geles

- `frontend/src/types/grimoire.ts` — types grimoire

## Frontend — Data gelees

### Onboarding V1

- `frontend/src/data/onboarding/registry.ts`
- `frontend/src/data/onboarding/theme_confidence.ts`
- `frontend/src/data/onboarding/theme_discipline.ts`
- `frontend/src/data/onboarding/theme_energy.ts`
- `frontend/src/data/onboarding/theme_professional.ts`
- `frontend/src/data/onboarding/theme_relations.ts`
- `frontend/src/data/onboarding/theme_sense.ts`
- `frontend/src/data/onboarding/theme_sleep.ts`
- `frontend/src/data/onboarding/theme_transverse.ts`
- `frontend/src/data/onboarding/types.ts`

### Semaines V1

- `frontend/src/data/weeksContent.ts`
- `frontend/src/data/weeksPaths.ts`
- `frontend/src/data/weeks/types.ts`
- `frontend/src/data/weeks/week1.ts` ... `week12.ts` (12 fichiers)

### Autres data

- `frontend/src/data/dashboardMock.ts`

## Frontend — Infrastructure gelees

- `frontend/src/context/AuthContext.tsx` — contexte d'authentification
- `frontend/src/security/prelaunch.ts` — garde pre-lancement
- `frontend/src/config/modules-registry.ts` — registre de modules V1

> **Note:** `frontend/src/App.tsx`, `frontend/src/main.tsx` et
> `frontend/src/security/RouteGuards.tsx` ne sont PAS geles car ils devront etre
> modifies pour integrer les nouvelles routes V2.

---

## Modules explicitement NON geles (seront refactores/supprimes)

> Rappel: ces fichiers SERONT modifies par la V2. Cf. section 29.2 et 29.3 de
> `docs/v2-systemes-vivants-implementation.md`.

### 29.2 — Refactor fort

**Backend Brain:**

- `supabase/functions/sophia-brain/momentum_state.ts`
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts`
- `supabase/functions/sophia-brain/momentum_outreach.ts`
- `supabase/functions/sophia-brain/router/dispatcher.ts`
- `supabase/functions/sophia-brain/router/run.ts`
- `supabase/functions/sophia-brain/state-manager.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/types.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/suggestions.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/run.ts`

**Backend Edge Functions:**

- `supabase/functions/schedule-recurring-checkins/index.ts`
- `supabase/functions/process-checkins/index.ts`

**Frontend:**

### 29.3 — Delete ou deprecate ciblee

- Toute logique runtime basee sur `current_phase`
- Suggestions weekly centrees `activate/deactivate/swap` sans lecture
  dimensionnelle
- Toute vue dashboard qui suppose `phases` comme structure primaire
- Tout pipeline qui traite `actions/frameworks/vital_signs` comme source
  canonique au lieu des `plan_items`
