# QA Run Report — status-recap-real-r4

## 1. Contexte Du Test

- Date: 2026-06-12 Europe/Paris
- Run: `status-recap-real-r4`
- Persona: `qa-skill`, connexion temporaire neuve `status_recap_status_recap_20260612_r4`, user `041c0bb6-c3c2-40a7-9233-d0e8e858226d`
- Objectif: rerun IA reel apres assouplissement du prompt visible `status_recap`, pour verifier que la restitution n'utilise plus le format mecanique `Fait / Prévu / Fragile` hors stage explicite.
- Trajectoire visee: demande de point factuel read-only -> relance factuelle -> follow-up rappels annules -> demande de sources.
- Surfaces visees: dispatcher `status_recap`, active flow local, visible agent `status_compact`, projection DB, absence de mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer/fallback deterministe.
- Validite QA: invalide. Aucun tour conversationnel exploitable: le worker Edge retourne `503 BOOT_ERROR` avant execution du flow.

Artefacts:
- Raw: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r4.raw.json`
- Durable: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r4.durable.json`
- Cleanup: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r4.cleanup.json`

Incident de setup:
- Une premiere tentative a echoue avant conversation sur un doublon `user_profile_facts` pour `coach.tone` du user temporaire neuf. Le runner a ete ajuste pour nettoyer ce champ sur ce user temporaire avant seed. Aucun message utilisateur n'avait encore ete traite.

Diagnostic runtime:
- Les quatre appels `/functions/v1/test-send-message` ont retourne:
  `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`.
- Diagnostic non destructif lance ensuite:
  `/usr/local/bin/deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/agents/companion.ts`
- Resultat:
  `TS2305: Module ".../skills/weekly_review/runtime.ts" has no exported member 'isExplicitPendingApplyConfirmation'` dans `router/adjust_plan_operation_bridge.ts`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incoherent ou suite malsaine

**User**
> Tu peux me dire simplement ce qui est vraiment enregistré dans mon espace, sans rien changer ?

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 503
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- erreur: `BOOT_ERROR`

**Analyse si yellow/red**
- Symptome: le worker Edge ne boote pas; aucun dispatcher local ou global n'est atteint.
- Source amont probable: contrat d'import/export casse entre `router/adjust_plan_operation_bridge.ts` et `skills/weekly_review/runtime.ts`.
- Owner runtime: `sophia-brain` boot / weekly bridge import.
- Meilleure correction selon les guidelines: reparer le contrat d'export/import qui empeche le worker de demarrer, puis relancer le meme run IA reel.
- Pourquoi ce n'est pas un patch local: le flow `status_recap` n'a pas ete execute; le blocage est au boot global de la fonction.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incoherent ou suite malsaine

**User**
> Oui, fais-moi le point maintenant, en restant juste factuel.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 503
- selected_handler: null
- route_reason: null
- executed_tools: []
- durable_effect: null
- erreur: `BOOT_ERROR`

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incoherent ou suite malsaine

**User**
> Et pour les rappels annulés, tu vois quelque chose ou pas ?

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 503
- selected_handler: null
- route_reason: null
- executed_tools: []
- durable_effect: null
- erreur: `BOOT_ERROR`

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incoherent ou suite malsaine

**User**
> Sur quoi tu t'appuies pour ce récap ?

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 503
- selected_handler: null
- route_reason: null
- executed_tools: []
- durable_effect: null
- erreur: `BOOT_ERROR`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien de conversationnellement exploitable: Sophia ne produit aucune reponse visible.

**Problemes**
- Tours 1-4: worker non demarre, reponses vides. Famille: `BF-TEST-01`. Impact: run inutilisable. Severite: red.

**Fix propose**
- Source amont: boot global `sophia-brain`.
- Correction recommandee: corriger l'import `isExplicitPendingApplyConfirmation` ou restaurer l'export attendu, puis relancer un run r5 avec la meme trajectoire et connexion temporaire propre.
- Tests d'invariant attendus: `deno check` sur `sophia-brain/index.ts`, puis run IA reel `/functions/v1/test-send-message`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage observe: le worker echoue avant dispatcher.

**Skills / Operations / Tools**
- `status_recap` non atteint.
- Aucun tool execute.
- Aucun effet durable produit par les tours, car les appels echouent au boot.

**Memory / Effets durables**
- Seed r4 avant conversation: 1 rappel ponctuel pending, 1 rappel ponctuel cancelled, 1 rappel recurrent actif, 1 preference coach explicite, plus preferences coach system defaults creees pour le user temporaire.
- Cleanup final r4: artefacts de run supprimes (`chat_messages`, `scheduled_checkins`, rappel recurrent r4, `coach.tone`), pas de message persistant; les preferences system defaults du user temporaire restent hors perimetre fixture.

**Problemes**
- `sophia-brain` ne boote pas: `TS2305` sur un export weekly manquant.

**Fix propose**
- Source amont: `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts` ou `supabase/functions/sophia-brain/skills/weekly_review/runtime.ts`.
- Correction recommandee: aligner le contrat import/export, verifier le boot par `deno check`, puis relancer `status-recap-real-r5`.

## Verdict Global

- Verdict: red
- Raison principale: run IA reel invalide car le worker Edge retourne `BOOT_ERROR` sur tous les tours. Le test ne permet pas de juger la nouvelle restitution `status_recap`.
