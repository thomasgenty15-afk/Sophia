# V2 Suivi Modifications

## But

Ce document sert de journal unique pour tracer la vague de modifications en
cours autour de la V2, en complement de `docs/v2-context-prompt.md` et
`docs/v2-execution-playbook.md`.

Il doit etre mis a jour a chaque session qui modifie du code, des docs, des
prompts, des migrations ou des contrats.

## Regles de mise a jour

1. Ajouter chaque nouvelle entree en haut de la section `Journal`.
2. Renseigner obligatoirement `Modele`.
3. Si plusieurs modeles contribuent a la meme session, soit separer en
   plusieurs entrees, soit lister explicitement tous les modeles dans le meme
   champ.
4. Lister uniquement les fichiers reellement touches.
5. Noter les validations executees et les points encore ouverts.

## Format d'entree

```md
### Entree XXX - YYYY-MM-DD HH:MM

- Scope:
- Modele:
- Statut:
- Resume:
- Fichiers touches:
  - `path/to/file`
- Validations:
- Decisions / ecarts:
- Points ouverts:
```

## Journal

### Entree 005 - 2026-03-28 18:00

- Scope: Audit global V2/V3 — 60+ correctifs (P0-P3)
- Modele: claude-4.6-opus-high-thinking (Cursor)
- Statut: termine
- Resume: Audit exhaustif croisant v3-context-prompt, v3-dashboard-ux-specs,
  v2-execution-playbook et v2-context-prompt avec le code reel. 55+ findings
  classes P0 a P3 identifies et corriges en 5 sprints.
  P0: transitions de phase auto (tryAdvancePhaseItems, advance-phase-v2),
  heartbeat dynamique (inferred mode), phase guard (isItemInActivatablePhase),
  buildConversationPulse branche dans router, migration 20260327123000 fix
  (EXISTS subquery), layering _shared/sophia-brain (extracting helpers).
  P1: calibration fields extraits vers _shared, AgentMode cleanup, routing
  dead code supprime, roadmap fallback corrige, duration type number, CASCADE
  defense cards, duration choice supprime du MinimalProfile, partial failure
  recovery, defense card auto-trigger, heartbeat target >= 0, heartbeat log
  button, phase completion celebration, daily bilan phase awareness, phase
  transition event, RPC revoke, unlocked_principles guard trigger.
  P2: toast system, shimmer/confetti animations, skeleton loaders, slide-down,
  quick-log confirmation, multi-part completion message, micro-copy alignment,
  dead code cleanup, config.toml pour edge functions, V3 distribution tests.
  P3: journal mis a jour, frontend-site-map V3, generate-plan-v2 naming
  comment, StrategyHeader multi-part sessionStorage.
- Fichiers touches:
  - `supabase/functions/_shared/v2-runtime.ts`
  - `supabase/functions/_shared/v2-events.ts`
  - `supabase/functions/_shared/v2-types.ts`
  - `supabase/functions/_shared/v2-plan-distribution.ts`
  - `supabase/functions/_shared/v2-plan-distribution_test.ts`
  - `supabase/functions/_shared/v2-calibration-fields.ts` (new)
  - `supabase/functions/_shared/v2-momentum-helpers.ts` (new)
  - `supabase/functions/_shared/v2-outreach-helpers.ts` (new)
  - `supabase/functions/_shared/v2-prompts/plan-generation.ts`
  - `supabase/functions/_shared/momentum-observability.ts`
  - `supabase/functions/advance-phase-v2/index.ts` (new)
  - `supabase/functions/activate-plan-item-v2/index.ts`
  - `supabase/functions/generate-plan-v2/index.ts`
  - `supabase/functions/generate-defense-card-v3/index.ts`
  - `supabase/functions/trigger-daily-bilan/index.ts`
  - `supabase/functions/trigger-daily-bilan/v2_daily_bilan.ts`
  - `supabase/functions/sophia-brain/router/run.ts`
  - `supabase/functions/sophia-brain/router/agent_exec.ts`
  - `supabase/functions/sophia-brain/state-manager.ts`
  - `supabase/functions/sophia-brain/momentum_state.ts`
  - `supabase/functions/sophia-brain/agents/roadmap_review.ts`
  - `supabase/functions/sophia-brain/knowledge/frontend-site-map.ts`
  - `supabase/migrations/20260327123000_systemic_unlocked_principles_triggers.sql`
  - `supabase/migrations/20260328100000_v3_fixes_cascade_and_security.sql` (new)
  - `frontend/src/App.tsx`
  - `frontend/src/index.css`
  - `frontend/src/components/ui/Toast.tsx` (new)
  - `frontend/src/components/dashboard-v2/PhaseProgression.tsx`
  - `frontend/src/components/dashboard-v2/DefenseCard.tsx`
  - `frontend/src/components/dashboard-v2/AtelierInspirations.tsx`
  - `frontend/src/components/dashboard-v2/StrategyHeader.tsx`
  - `frontend/src/pages/DashboardV2.tsx`
  - `frontend/src/hooks/useDashboardV2Logic.ts`
  - `frontend/src/hooks/useDashboardV2Data.ts`
  - `frontend/src/lib/onboardingV2.ts`
  - `frontend/src/types/v2.ts`
  - `docs/v2-suivi-modifications.md`
- Validations:
  - `tsc --noEmit` : 0 erreurs
  - `npm run build` : succes (2.10s)
- Decisions / ecarts:
  - Layering fix pragmatique: extraction minimale des helpers momentum/outreach
    vers _shared, refactoring lourd de scheduled_checkins defere
  - Heartbeat current derive des completions (mode inferred) plutot que stocke
    dans une table separee
  - Toast system minimaliste (contexte React) plutot que librairie externe
  - Confetti CSS-only (keyframes) plutot que canvas-confetti
- Points ouverts:
  - Animation de transition de phase (lock-break, auto-compact) reste
    simplifiee (fade-in + scale) — animation riche necessiterait framer-motion
  - Deno tests a executer pour valider les nouveaux tests V3 distribution
  - Verifier le flow complet phase transition en environnement local

### Entree 004 - 2026-03-26 15:44

- Scope: fix CORS local pour `cycle-draft` et `analyze-intake-v2`
- Modele: claude-4.6-sonnet-medium-thinking (Cursor)
- Statut: termine
- Resume: les requetes GET/POST vers `cycle-draft` retournaient systematiquement
  `403 CORS origin not allowed` au chargement de la page d'onboarding. La cause
  racine etait `APP_ENV=production` dans `supabase/.env`, qui desactivait la
  logique de bypass CORS pour localhost. La detection a ete migree vers
  `SUPABASE_URL` : si l'URL pointe sur `127.0.0.1` / `localhost` / `kong`, tout
  origin `localhost:*` est accepte quelle que soit la valeur d'`APP_ENV`.
  Parallelement, `OnboardingV2.tsx` a ete patche pour introduire un etat
  `onboardingAuthMode` (`checking` / `authenticated` / `guest`) et un fallback
  automatique vers `analyzeCycleDraftGuest` quand `analyze-intake-v2` renvoie
  401/403, de sorte que l'onboarding fonctionne aussi bien en invite qu'en
  connecte.
- Fichiers touches:
  - `supabase/functions/_shared/cors.ts`
  - `frontend/src/pages/OnboardingV2.tsx`
  - `frontend/.env.local` (ajout `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`)
- Validations:
  - `curl GET /functions/v1/cycle-draft?session_id=...` depuis `localhost:5174`
    retourne `{"draft":null}` (plus de 403)
  - `curl GET /functions/v1/cycle-draft?session_id=test` retourne
    `{"error":"Invalid session_id"}` (CORS passe, validation metier OK)
- Decisions / ecarts:
  - `isProdEnv()` conserve pour les autres usages mais n'est plus le signal CORS
    en local ; `isLocalSupabase()` base sur `SUPABASE_URL` prend le relais
  - le container Docker `supabase_edge_runtime_Sophia_2` a du etre supprime
    manuellement (`docker rm -f`) suite a un conflit apres redemarrage
- Points ouverts:
  - verifier le flow complet onboarding invite -> signup -> rehydratation en
    environnement local apres ces corrections CORS

### Entree 003 - 2026-03-26 16:18

- Scope: deplacement du gate inscription du parcours free apres l'etape 3
- Modele: GPT (Codex)
- Statut: termine
- Resume: le flow onboarding V2 en invite peut maintenant aller jusqu'au
  questionnaire inclus avant de demander l'inscription. Le backend guest passe
  par `cycle-draft` pour l'analyse, la cristallisation et la generation du
  questionnaire, puis la rehydratation post-auth reconstruit le vrai cycle,
  reapplique l'ordre de priorite choisi et restaure le questionnaire / ses
  reponses pour envoyer l'utilisateur directement vers le profil.
- Fichiers touches:
  - `frontend/src/components/onboarding-v2/FreeTextCapture.tsx`
  - `frontend/src/lib/onboardingV2.ts`
  - `frontend/src/pages/OnboardingV2.tsx`
  - `frontend/src/pages/PlanPriorities.tsx`
  - `supabase/functions/analyze-intake-v2/index.ts`
  - `supabase/functions/crystallize-v2/index.ts`
  - `supabase/functions/cycle-draft/index.ts`
  - `supabase/functions/generate-questionnaire-v2/index.ts`
- Validations:
  - `./frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.app.json`
  - `deno check supabase/functions/cycle-draft/index.ts supabase/functions/analyze-intake-v2/index.ts supabase/functions/crystallize-v2/index.ts supabase/functions/generate-questionnaire-v2/index.ts`
- Decisions / ecarts:
  - le gate auth initial dans `handleAnalyze()` a ete supprime
  - la priorisation guest reste locale jusqu'a l'inscription, puis est
    reappliquee au vrai cycle pendant l'hydratation
  - le questionnaire guest est persiste dans le draft puis rattache a la vraie
    transformation apres signup, pour eviter une regeneration differente
- Points ouverts:
  - verifier le comportement end-to-end sur environnement reel `/auth` ->
    retour `/onboarding-v2`
  - verifier la conversion UX sur mobile apres ce deplacement du gate

### Entree 002 - 2026-03-26 15:30

- Scope: Onboarding V2 UI/UX
- Modele: gemini-3.1-pro-preview
- Statut: Terminé
- Resume: Ajout d'un indicateur de progression (Étape X sur 5) dynamique et responsive dans la barre supérieure de la page d'onboarding.
- Fichiers touches:
  - `frontend/src/pages/OnboardingV2.tsx`
- Validations: Linter OK
- Decisions / ecarts: Mapping des différents états de l'onboarding (`capture`, `validation`, `priorities`/`questionnaire`, `profile`, `generating_plan`) sur un total de 5 étapes claires pour l'utilisateur.
- Points ouverts: Aucun

### Entree 001 - 2026-03-26 00:00

- Scope: baseline initiale du journal de suivi
- Modele: non reconcilie sur cette baseline (modifications anterieures a la
  creation du journal)
- Statut: snapshot du worktree en cours
- Resume: creation du journal pour suivre la vague actuelle de changements.
  Cette premiere entree capture l'etat visible du repo au moment de la creation
  du fichier, afin d'avoir un point de depart avant les prochaines
  modifications.
- Fichiers touches:
  - `docs/v2-context-prompt.md`
  - `docs/v2-execution-playbook.md`
  - `docs/v2-mvp-scope.md`
  - `frontend/src/components/dashboard-v2/DimensionSection.tsx`
  - `frontend/src/components/dashboard-v2/NorthStarV2.tsx`
  - `frontend/src/hooks/useDashboardV2Logic.ts`
  - `frontend/src/pages/OnboardingV2.tsx`
  - `frontend/src/pages/PlanPriorities.tsx`
  - `supabase/functions/_shared/llm-usage.ts`
  - `supabase/functions/_shared/scheduled_checkins.ts`
  - `supabase/functions/_shared/user_time_context.ts`
  - `supabase/functions/_shared/v2-events.ts`
  - `supabase/functions/_shared/v2-memory-retrieval.ts`
  - `supabase/functions/_shared/v2-rendez-vous.ts`
  - `supabase/functions/_shared/v2-runtime.ts`
  - `supabase/functions/sophia-brain/active_load_engine.ts`
  - `supabase/functions/sophia-brain/conversation_pulse_builder.ts`
  - `supabase/functions/sophia-brain/cooldown_engine.ts`
  - `supabase/functions/sophia-brain/momentum_morning_nudge.ts`
  - `supabase/functions/sophia-brain/rendez_vous_decision.ts`
  - `supabase/functions/sophia-brain/weekly_conversation_digest_builder.ts`
  - `supabase/functions/_shared/v2-active-load.ts` (new)
  - `supabase/functions/_shared/v2-constants.ts` (new)
  - `supabase/functions/_shared/v2-cooldown-registry.ts` (new)
  - `supabase/functions/_shared/v2-plan-item-activation.ts` (new)
  - `supabase/functions/_shared/v2-plan-item-activation_test.ts` (new)
  - `supabase/functions/activate-plan-item-v2/` (new)
  - `supabase/functions/sophia-brain/agents/investigator/` (new)
  - `supabase/functions/sophia-brain/agents/investigator-weekly/` (new)
  - `supabase/migrations/20260325190000_guard_v2_plan_item_activation.sql`
    (new)
- Validations: non consolidees dans cette entree baseline
- Decisions / ecarts:
  - Le champ `Modele` devient obligatoire pour toutes les prochaines entrees.
  - Cette entree n'essaie pas de reconstituer precisement quel modele a touche
    chaque fichier deja present dans le worktree.
- Points ouverts:
  - Reconciler si besoin les modifications deja en cours avec les sessions /
    modeles exacts.
  - Ajouter les prochaines entrees au fil de l'eau plutot que de reconstruire a
    posteriori.
